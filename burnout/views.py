from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Employee, Organization
from goals.permissions import IsHR, IsManager
from workspace.permissions import is_employee, is_manager

from . import bat, model_inputs, services, surveys


class IsManagerOnly(IsAuthenticated):
    message = (
        "Only managers can view an employee's burnout prediction. "
        'HR sees department-level results only.'
    )

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return is_manager(request.user)


class BurnoutPredictionView(APIView):
    """GET /api/burnout/prediction/<employee_id>/

    Manager: only employees of their own team. HR gets 403 (HR sees the
    department totals only). Reads only, writes nothing."""

    permission_classes = [IsManagerOnly]

    def get(self, request, employee_id):
        employee = services.can_view(request.user, employee_id)
        if employee is None:
            return Response(
                {'detail': 'This employee is not in your team.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        prediction = services.predict(employee)
        return Response({
            'employee': {
                'id': employee.pk,
                'first_name': employee.user.first_name or '',
                'last_name': employee.user.last_name or '',
            },
            **prediction,
            **services.assessment(employee, prediction),
        })


class BurnoutHistoryView(APIView):
    """GET /api/burnout/history/<employee_id>/

    The saved predictions of one employee (newest first, with their main
    factors) and the BAT results of the same surveys. Manager: only employees
    of their own team. HR gets 403. Reads only."""

    permission_classes = [IsManagerOnly]

    def get(self, request, employee_id):
        employee = services.can_view(request.user, employee_id)
        if employee is None:
            return Response(
                {'detail': 'This employee is not in your team.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({
            'employee': {
                'id': employee.pk,
                'first_name': employee.user.first_name or '',
                'last_name': employee.user.last_name or '',
            },
            'predictions': services.history(employee),
            'bat': surveys.bat_history(employee),
        })


def employee_of(user):
    """The Employee row of a signed-in employee, or None."""
    if not is_employee(user):
        return None
    return Employee.objects.filter(pk=user.pk).first()


class BatSurveyView(APIView):
    """The BAT survey of the signed-in employee. HR chooses how often it opens
    (every month, 3 months, 6 months, or only when HR sends it).

    GET  -> {"status": "available" | "submitted" | "closed", "submitted_on", "next_available"}
            ("closed": manual mode and HR has not sent the survey yet)
    POST -> body {"answers": [12 numbers from 1 to 5],
                  "model_answers": {the 10 questions of model_inputs.QUESTIONS}};
            all are required. Saves one row in burnoutsurvey and answers with the
            same status. The employee never receives the score. A second survey
            in the same period is refused (409).
    GET  /api/burnout/bat/questions/ -> the 10 model questions (key, label, kind, min, max)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = employee_of(request.user)
        if employee is None:
            return Response({'detail': 'Only employees can take the survey.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(surveys.status_for(employee))

    def post(self, request):
        employee = employee_of(request.user)
        if employee is None:
            return Response({'detail': 'Only employees can take the survey.'}, status=status.HTTP_403_FORBIDDEN)
        answers = request.data.get('answers') if hasattr(request.data, 'get') else None
        problems = bat.validate_answers(answers)
        if problems:
            return Response({'answers': problems}, status=status.HTTP_400_BAD_REQUEST)
        model_answers, model_problems = model_inputs.validate(
            request.data.get('model_answers') if hasattr(request.data, 'get') else None
        )
        if model_problems:
            return Response({'model_answers': model_problems}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = surveys.submit(employee, answers, model_answers)
        except surveys.SurveyClosed:
            return Response(
                {'detail': 'No survey is open right now. HR has not sent one yet.'},
                status=status.HTTP_409_CONFLICT,
            )
        except surveys.AlreadySubmitted:
            return Response(
                {'detail': 'You already submitted the survey for this period.'},
                status=status.HTTP_409_CONFLICT,
            )
        services.run_prediction_safely(employee)    # the survey is already saved
        return Response(result, status=status.HTTP_201_CREATED)


class SurveyQuestionsView(APIView):
    """GET /api/burnout/bat/questions/

    The questions of the survey that are used by the burnout prediction model
    (the 12 BAT items are shown by the frontend as before)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'questions': model_inputs.QUESTIONS})


class TeamBurnoutView(APIView):
    """GET /api/burnout/team/

    The predicted burnout risk, the latest BAT result and the overall reading of
    every employee in the signed-in manager's own team (and nobody else). Reads
    only, writes nothing."""

    permission_classes = [IsManager]

    def get(self, request):
        members = []
        for employee in services.team_of(request.user):
            user = employee.user
            prediction = services.predict(employee)
            members.append({
                'id': employee.pk,
                'first_name': user.first_name or '',
                'last_name': user.last_name or '',
                'job_title': user.job_title or '',
                **prediction,
                **services.assessment(employee, prediction),
            })
        return Response({'members': members})


class DepartmentBurnoutView(APIView):
    """GET /api/burnout/departments/

    Burnout risk compared between the departments of the HR user's organization:
    averages and level counts only, never one employee's result. Reads only."""

    permission_classes = [IsHR]

    def get(self, request):
        return Response(services.departments_for_org(request.user.org_id))


def survey_settings(org):
    return {
        'frequency': org.survey_frequency,
        'options': [{'value': value, 'label': label} for value, label in Organization.SURVEY_FREQUENCIES],
        'last_sent_on': org.survey_opened_on.isoformat() if org.survey_opened_on else None,
    }


class SurveySettingsView(APIView):
    """GET/PUT /api/burnout/survey-settings/  (HR only)

    How often the survey opens for the whole organization. PUT body:
    {"frequency": "monthly" | "quarterly" | "semiannual" | "manual"}."""

    permission_classes = [IsHR]

    def get(self, request):
        return Response(survey_settings(request.user.org))

    def put(self, request):
        frequency = request.data.get('frequency') if hasattr(request.data, 'get') else None
        if frequency not in dict(Organization.SURVEY_FREQUENCIES):
            return Response(
                {'frequency': 'Choose monthly, quarterly, semiannual or manual.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        org = request.user.org
        org.survey_frequency = frequency
        org.save(update_fields=['survey_frequency'])
        return Response(survey_settings(org))


class SurveySendView(APIView):
    """POST /api/burnout/survey-settings/send/  (HR only)

    Manual mode: opens the survey now for every employee of the organization.
    Employees who already answered today are not asked again today."""

    permission_classes = [IsHR]

    def post(self, request):
        org = request.user.org
        if org.survey_frequency != 'manual':
            return Response(
                {'detail': 'The survey opens on its own schedule. Choose "Manual" to send it yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        org.survey_opened_on = timezone.localdate()
        org.save(update_fields=['survey_opened_on'])
        return Response(survey_settings(org))
