from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Employee
from goals.permissions import IsHR, IsManager, is_hr
from workspace.permissions import is_employee, is_manager

from . import bat, services, surveys


class IsManagerOrHR(IsAuthenticated):
    message = 'Only managers and HR professionals can view burnout predictions.'

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return is_manager(request.user) or is_hr(request.user)


class BurnoutPredictionView(APIView):
    """GET /api/burnout/prediction/<employee_id>/

    Manager: only employees of their own team. HR: any employee.
    Reads only, writes nothing."""

    permission_classes = [IsManagerOrHR]

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
            **services.predict(employee),
        })


def employee_of(user):
    """The Employee row of a signed-in employee, or None."""
    if not is_employee(user):
        return None
    return Employee.objects.filter(pk=user.pk).first()


class BatSurveyView(APIView):
    """The monthly BAT survey of the signed-in employee.

    GET  -> {"status": "available" | "submitted", "submitted_on", "next_available"}
    POST -> body {"answers": [12 numbers from 1 to 5]}; saves one row in
            burnoutsurvey and answers with the same status. The employee never
            receives the score. A second survey in the same period is refused (409)."""

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
        try:
            result = surveys.submit(employee, answers)
        except surveys.AlreadySubmitted:
            return Response(
                {'detail': 'You already submitted the survey for this period.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(result, status=status.HTTP_201_CREATED)


class TeamBurnoutView(APIView):
    """GET /api/burnout/team/

    The predicted burnout risk of every employee in the signed-in manager's own
    team (and nobody else). Reads only, writes nothing."""

    permission_classes = [IsManager]

    def get(self, request):
        members = []
        for employee in services.team_of(request.user):
            user = employee.user
            members.append({
                'id': employee.pk,
                'first_name': user.first_name or '',
                'last_name': user.last_name or '',
                'job_title': user.job_title or '',
                **services.predict(employee),
            })
        return Response({'members': members})


class DepartmentBurnoutView(APIView):
    """GET /api/burnout/departments/

    Burnout risk compared between the departments of the HR user's organization:
    averages and level counts only, never one employee's result. Reads only."""

    permission_classes = [IsHR]

    def get(self, request):
        return Response(services.departments_for_org(request.user.org_id))
