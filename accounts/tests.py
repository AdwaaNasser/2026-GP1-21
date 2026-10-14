from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .permissions import IsHRProfessional
from .views import (
    CSVEmployeeImportView,
    CSVImportInviteAllView,
    EmployeeDetailView,
    LoginView,
    SetPasswordView,
    _employees_visible_to,
    _new_hr_department_name,
    _normalize_csv_header,
)


class RoleAccessTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_hr_permission_requires_authenticated_hr_role(self):
        permission = IsHRProfessional()
        view = SimpleNamespace()
        hr = SimpleNamespace(is_authenticated=True, role='HR')
        manager = SimpleNamespace(is_authenticated=True, role='Manager')
        anonymous = SimpleNamespace(is_authenticated=False, role='HR')

        self.assertTrue(permission.has_permission(SimpleNamespace(user=hr), view))
        self.assertFalse(permission.has_permission(SimpleNamespace(user=manager), view))
        self.assertFalse(permission.has_permission(SimpleNamespace(user=anonymous), view))

    def test_employee_queries_are_scoped_by_role(self):
        department = SimpleNamespace(organization_id=12)
        cases = (
            (SimpleNamespace(role='HR', department=department), {'department__organization_id': 12}),
            (SimpleNamespace(role='Manager', department_id=7), {'department_id': 7}),
            (SimpleNamespace(role='Employee', pk=9), {'pk': 9}),
        )

        for user, expected_filter in cases:
            with self.subTest(role=user.role):
                with patch('accounts.views.SystemUser.objects.filter') as filter_users:
                    result = _employees_visible_to(user)

                filter_users.assert_called_once_with(**expected_filter)
                filter_users.return_value.select_related.assert_called_once_with('department')
                self.assertIs(result, filter_users.return_value.select_related.return_value)

    def test_non_hr_cannot_upload_csv(self):
        request = self.factory.post('/api/accounts/import-csv/', {}, format='multipart')
        force_authenticate(
            request,
            user=SimpleNamespace(is_authenticated=True, role='Manager'),
        )

        response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 403)

    def test_employee_cannot_patch_employee_records(self):
        request = self.factory.patch(
            '/api/accounts/employees/4/',
            {'first_name': 'Changed'},
            format='json',
        )
        force_authenticate(
            request,
            user=SimpleNamespace(is_authenticated=True, role='Employee'),
        )
        with patch.object(EmployeeDetailView, 'get_object') as get_object:
            response = EmployeeDetailView.as_view()(request, employee_id=4)

        self.assertEqual(response.status_code, 403)
        get_object.assert_not_called()

    def test_manager_cannot_change_employee_role(self):
        request = self.factory.patch(
            '/api/accounts/employees/4/',
            {'role': 'HR'},
            format='json',
        )
        force_authenticate(
            request,
            user=SimpleNamespace(
                is_authenticated=True,
                role='Manager',
                department_id=7,
                department=SimpleNamespace(organization_id=12),
            ),
        )
        employee = MagicMock()

        with patch.object(EmployeeDetailView, 'get_object', return_value=employee):
            response = EmployeeDetailView.as_view()(request, employee_id=4)

        self.assertEqual(response.status_code, 400)
        employee.save.assert_not_called()


class OnboardingApiTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def hr_user(self):
        organization = SimpleNamespace(pk=12)
        department = SimpleNamespace(organization_id=12, organization=organization)
        return SimpleNamespace(
            is_authenticated=True,
            role='HR',
            department_id=7,
            department=department,
        )

    def test_new_organization_gets_a_unique_hr_department_name(self):
        organization = SimpleNamespace(name='Acme')
        with patch('accounts.views.Department.objects.filter') as filter_departments:
            filter_departments.return_value.exists.side_effect = [True, False]

            department_name = _new_hr_department_name(organization)

        self.assertEqual(department_name, 'Human Resources - Acme (2)')

    def test_login_rejects_invalid_credentials(self):
        request = self.factory.post(
            '/api/accounts/login/',
            {'email': 'person@example.com', 'password': 'incorrect'},
            format='json',
        )

        with patch('accounts.views.authenticate', return_value=None):
            response = LoginView.as_view()(request)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['detail'], 'Invalid email or password.')

    def test_login_returns_tokens_and_role(self):
        request = self.factory.post(
            '/api/accounts/login/',
            {'email': 'person@example.com', 'password': 'correct-password'},
            format='json',
        )
        user = SimpleNamespace(
            pk=5,
            email='person@example.com',
            full_name='Person One',
            get_role_display=lambda: 'Manager',
        )

        class TokenPair:
            access_token = 'access-token'

            def __str__(self):
                return 'refresh-token'

        with (
            patch('accounts.views.authenticate', return_value=user),
            patch('accounts.views.RefreshToken.for_user', return_value=TokenPair()),
        ):
            response = LoginView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['access'], 'access-token')
        self.assertEqual(response.data['refresh'], 'refresh-token')
        self.assertEqual(response.data['user']['role'], 'Manager')

    def test_csv_rejects_rows_with_extra_columns_without_creating_accounts(self):
        upload = SimpleUploadedFile(
            'employees.csv',
            b'email,name,role,department\nperson@example.com,Person One,Employee,Engineering,extra\n',
            content_type='text/csv',
        )
        request = self.factory.post(
            '/api/accounts/import-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.hr_user())

        with (
            patch('accounts.views.SystemUser.objects.filter') as filter_users,
            patch('accounts.views.Department.objects.create') as create_department,
            patch('accounts.views.CSVImportBatch.objects.create') as create_batch,
            patch('accounts.views.transaction.atomic', return_value=nullcontext()),
        ):
            create_batch.return_value.pk = 42
            response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['summary']['total_added'], 0)
        self.assertEqual(response.data['errors'][0]['row'], 2)
        filter_users.assert_not_called()
        create_department.assert_not_called()

    def test_csv_creates_missing_department_and_sends_invitation(self):
        upload = SimpleUploadedFile(
            'employees.csv',
            b'email,name,role,department,job_title\nperson@example.com,Person One,Employee,Engineering,Analyst\n',
            content_type='text/csv',
        )
        request = self.factory.post(
            '/api/accounts/import-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.hr_user())

        department = MagicMock()
        employee = MagicMock()
        record = MagicMock()
        record.employee.department.name = 'Engineering'
        record.employee.role = 'Employee'
        batch = MagicMock(pk=42)
        batch.records.select_related.return_value.all.return_value = [record]
        with (
            patch('accounts.views.Department.objects.filter') as find_department,
            patch('accounts.views.Department.objects.create', return_value=department) as create_department,
            patch('accounts.views.SystemUser.objects.filter') as find_user,
            patch('accounts.views.SystemUser.objects.create_user', return_value=employee) as create_user,
            patch('accounts.views.CSVImportBatch.objects.create', return_value=batch) as create_batch,
            patch('accounts.views.CSVImportRecord.objects.create', return_value=record) as create_record,
            patch('accounts.views.InvitationToken.objects.create') as create_invitation,
            patch('accounts.views._send_invitation_email') as send_email,
            patch('accounts.views.transaction.atomic', return_value=nullcontext()),
        ):
            find_department.return_value.first.return_value = None
            find_user.return_value.exists.return_value = False

            response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['batch_id'], 42)
        self.assertEqual(response.data['summary']['employees_added'], 1)
        self.assertEqual(response.data['summary']['managers_added'], 0)
        self.assertEqual(response.data['summary']['departments'], [
            {'name': 'Engineering', 'employees': 1, 'managers': 0}
        ])
        create_department.assert_called_once_with(
            name='Engineering',
            organization=request.user.department.organization,
        )
        create_user.assert_called_once()
        self.assertEqual(create_user.call_args.kwargs['role'], 'Employee')
        self.assertNotIn('password', create_user.call_args.kwargs)
        create_batch.assert_called_once()
        create_record.assert_called_once_with(batch=batch, employee=employee)
        create_invitation.assert_not_called()
        send_email.assert_not_called()

    def test_invite_all_sends_only_when_hr_confirms(self):
        request = self.factory.post(
            '/api/accounts/import-csv/42/invite-all/',
            {},
            format='json',
        )
        force_authenticate(request, user=self.hr_user())
        employee = MagicMock(email='person@example.com')
        record = MagicMock(employee=employee, status='imported')
        batch = MagicMock(records=MagicMock())
        batch.records.filter.return_value.select_related.return_value = [record]
        batch.records.filter.return_value.count.return_value = 0

        with (
            patch('accounts.views.CSVImportBatch.objects.filter') as find_batch,
            patch('accounts.views.InvitationToken.objects.create', return_value=MagicMock()) as create_invitation,
            patch('accounts.views._send_invitation_email') as send_email,
            patch('accounts.views.transaction.atomic', return_value=nullcontext()),
        ):
            find_batch.return_value.first.return_value = batch
            response = CSVImportInviteAllView.as_view()(request, batch_id=42)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['invited'], 1)
        create_invitation.assert_called_once_with(employee=employee)
        send_email.assert_called_once()

    def test_csv_saves_manager_employee_and_reporting_relationship(self):
        upload = SimpleUploadedFile(
            'employees.csv',
            (
                b'email,first_name,last_name,role,department,manager_email\n'
                b'worker@example.com,Worker,One,Employee,Engineering,manager@example.com\n'
                b'manager@example.com,Manager,One,Manager,Engineering,\n'
            ),
            content_type='text/csv',
        )
        request = self.factory.post(
            '/api/accounts/import-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.hr_user())

        department = SimpleNamespace(pk=4, name='Engineering')
        manager = MagicMock()
        employee = MagicMock()
        manager.department = department
        manager.role = 'Manager'
        employee.department = department
        employee.role = 'Employee'
        manager_record = MagicMock(employee=manager)
        employee_record = MagicMock(employee=employee)
        batch = MagicMock(pk=43)
        batch.records.select_related.return_value.all.return_value = [
            manager_record,
            employee_record,
        ]
        with (
            patch('accounts.views.Department.objects.filter') as find_department,
            patch('accounts.views.Department.objects.create') as create_department,
            patch(
                'accounts.views.SystemUser.objects.filter'
            ) as find_user,
            patch(
                'accounts.views.SystemUser.objects.create_user',
                side_effect=[manager, employee],
            ) as create_user,
            patch('accounts.views.CSVImportBatch.objects.create', return_value=batch),
            patch(
                'accounts.views.CSVImportRecord.objects.create',
                side_effect=[manager_record, employee_record],
            ),
            patch('accounts.views.InvitationToken.objects.create') as create_invitation,
            patch('accounts.views._send_invitation_email') as send_email,
            patch('accounts.views.transaction.atomic', return_value=nullcontext()),
        ):
            find_department.return_value.first.return_value = department
            find_user.return_value.exists.return_value = False

            response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['summary']['employees_added'], 1)
        self.assertEqual(response.data['summary']['managers_added'], 1)
        self.assertEqual(response.data['summary']['departments'], [
            {'name': 'Engineering', 'employees': 1, 'managers': 1}
        ])
        self.assertEqual(create_user.call_args_list[0].kwargs['role'], 'Manager')
        self.assertEqual(create_user.call_args_list[1].kwargs['manager'], manager)
        create_department.assert_not_called()
        create_invitation.assert_not_called()
        send_email.assert_not_called()

    def test_set_password_requires_string_token_and_password(self):
        request = self.factory.post(
            '/api/accounts/set-password/',
            {'token': ['unexpected'], 'password': 'a-valid-password'},
            format='json',
        )

        response = SetPasswordView.as_view()(request)

        self.assertEqual(response.status_code, 400)

    def test_set_password_accepts_token_and_password(self):
        request = self.factory.post(
            '/api/accounts/set-password/',
            {'token': 'invitation-token', 'password': 'a-valid-password'},
            format='json',
        )

        with patch('accounts.views._set_invitation_password') as set_password:
            response = SetPasswordView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['detail'], 'Password set successfully.')
        set_password.assert_called_once_with('invitation-token', 'a-valid-password')

    def test_csv_header_names_are_normalized_to_database_fields(self):
        self.assertEqual(_normalize_csv_header('System Role'), 'role')
        self.assertEqual(_normalize_csv_header('departmentid'), 'department_id')
        self.assertEqual(_normalize_csv_header('Allowed Absence Days'), 'allowed_absence_days')
        self.assertEqual(_normalize_csv_header('Manager Email'), 'manager_email')

    def test_csv_refuses_password_hash_columns(self):
        upload = SimpleUploadedFile(
            'employees.csv',
            b'email,name,role,department,passwordhash\nperson@example.com,Person One,Employee,Engineering,secret\n',
            content_type='text/csv',
        )
        request = self.factory.post(
            '/api/accounts/import-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.hr_user())

        response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['file'].lower())

    def test_csv_refuses_database_generated_employee_ids(self):
        upload = SimpleUploadedFile(
            'employees.csv',
            b'employeeid,email,name,role,department\n1,person@example.com,Person One,Employee,Engineering\n',
            content_type='text/csv',
        )
        request = self.factory.post(
            '/api/accounts/import-csv/',
            {'file': upload},
            format='multipart',
        )
        force_authenticate(request, user=self.hr_user())

        response = CSVEmployeeImportView.as_view()(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn('generated', response.data['file'].lower())
