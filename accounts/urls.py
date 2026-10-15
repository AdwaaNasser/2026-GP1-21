from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    OrganizationSetupView,
    LoginView,
    CSVEmployeeImportView,
    CSVImportInviteAllView,
    TeamInviteView,
    DepartmentListView,
    EmployeeListView,
    EmployeeDetailView,
    SetPasswordView,
)

urlpatterns = [
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('setup/', OrganizationSetupView.as_view(), name='organization-setup'),
    path('login/', LoginView.as_view(), name='login'),
    path('import-csv/', CSVEmployeeImportView.as_view(), name='import-csv'),
    path(
        'import-csv/<int:batch_id>/invite-all/',
        CSVImportInviteAllView.as_view(),
        name='import-csv-invite-all',
    ),
    path('team-invite/', TeamInviteView.as_view(), name='team-invite'),
    path('departments/', DepartmentListView.as_view(), name='department-list'),
    path('employees/', EmployeeListView.as_view(), name='employee-list'),
    path('employees/<int:employee_id>/', EmployeeDetailView.as_view(), name='employee-detail'),
    path('set-password/', SetPasswordView.as_view(), name='set-password'),
]