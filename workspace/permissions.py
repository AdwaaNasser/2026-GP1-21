from rest_framework.permissions import BasePermission


class IsManagerOrEmployee(BasePermission):
    """HR professionals do not use the task workspaces."""

    message = 'Only managers and employees can use projects and tasks.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ('Manager', 'Employee')
        )
