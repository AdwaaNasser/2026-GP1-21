from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .skills import MySkillsView, SkillCatalogView, TeamMemberSkillsView
from .views import (
    OrganizationSetupView,
    LoginView,
    CSVEmployeeImportView,
    CSVImportCancelView,
    CSVImportInviteAllView,
    TeamInviteView,
    DepartmentListView,
    EmployeeListView,
    EmployeeDetailView,
    SetPasswordView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
)

urlpatterns = [
    path('skills/catalog/', SkillCatalogView.as_view(), name='skill-catalog'),
    path('skills/mine/', MySkillsView.as_view(), name='my-skills'),
    path('skills/employee/<int:employee_id>/', TeamMemberSkillsView.as_view(), name='team-member-skills'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('setup/', OrganizationSetupView.as_view(), name='organization-setup'),
    path('login/', LoginView.as_view(), name='login'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path(
        'password-reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='password-reset-confirm',
    ),
    path('import-csv/', CSVEmployeeImportView.as_view(), name='import-csv'),
    path(
        'import-csv/invite-all/',
        CSVImportInviteAllView.as_view(),
        name='import-csv-invite-all',
    ),
    path('import-csv/cancel/', CSVImportCancelView.as_view(), name='import-csv-cancel'),
    path('team-invite/', TeamInviteView.as_view(), name='team-invite'),
    path('departments/', DepartmentListView.as_view(), name='department-list'),
    path('employees/', EmployeeListView.as_view(), name='employee-list'),
    path('employees/<int:employee_id>/', EmployeeDetailView.as_view(), name='employee-detail'),
    path('set-password/', SetPasswordView.as_view(), name='set-password'),
]