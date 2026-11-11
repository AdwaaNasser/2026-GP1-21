from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from goals.permissions import is_hr
from workspace.permissions import is_manager

from . import services


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
