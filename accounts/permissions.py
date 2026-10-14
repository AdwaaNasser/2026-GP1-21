from rest_framework.permissions import BasePermission


class IsHRProfessional(BasePermission):
    message = 'Only HR professionals can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'HR'
        )
