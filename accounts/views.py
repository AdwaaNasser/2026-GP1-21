import csv
import logging
import re
import smtplib
from io import StringIO
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Employee, Manager, Organization, User
from .permissions import IsHRProfessional


logger = logging.getLogger(__name__)


def _send_invitation_email(user):
    uid = urlsafe_base64_encode(str(user.pk).encode())
    token = default_token_generator.make_token(user)
    link = (
        f'{settings.BAYYINAH_FRONTEND_URL}/set-password?'
        f'{urlencode({"uid": uid, "token": token})}'
    )
    send_mail(
        subject='Welcome to Bayyinah - Complete Your Onboarding',
        message=(
            f'Hello {user.display_name},\n\n'
            'Your Bayyinah account is ready. Use this link to set your password '
            'and finish setting up your account:\n\n'
            f'{link}\n\n'
            'Best regards,\nBayyinah HR Team'
        ),
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _send_password_reset_email(user):
    uid = urlsafe_base64_encode(str(user.pk).encode())
    token = default_token_generator.make_token(user)
    link = (
        f'{settings.BAYYINAH_FRONTEND_URL}/reset-password?'
        f'{urlencode({"uid": uid, "token": token})}'
    )
    send_mail(
        subject='Password reset requested - Bayyinah',
        message=(
            f'Hello {user.display_name},\n\n'
            'We received a request to reset your Bayyinah account password.\n\n'
            'Here is the link to reset your password:\n'
            f'{link}\n\n'
            'This link expires in 3 days and can only be used once. '
            'If you did not request a password reset, ignore this email; '
            'your password will remain unchanged.\n\n'
            'Best regards,\nBayyinah Support'
        ),
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _create_account(
    email,
    first_name,
    last_name,
    password,
    role,
    organization,
    hire_date,
    department=None,
    gender=None,
    allowed_absence_days=None,
    job_title=None,
    manager=None,
):
    user = User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        job_title=job_title,
        org=organization,
        department=department,
        gender=gender,
        allowed_absence_days=allowed_absence_days,
    )
    employee = Employee.objects.create(
        user=user,
        system_role=role,
        hire_date=hire_date,
        manager=manager,
    )
    if role == 'Manager':
        Manager.objects.create(user=user)
    return user, employee


def _employees_visible_to(user):
    employees = User.objects.filter(
        Q(employee_record__isnull=False) | Q(manager_record__isnull=False),
    ).select_related(
        'employee_record',
        'employee_record__manager__user',
        'manager_record',
        'org',
    )
    if user.role == 'HR':
        return employees.filter(org_id=user.org_id)
    if user.role == 'Manager':
        # A manager sees the employees who report to them, and themselves.
        return employees.filter(
            Q(employee_record__manager_id=user.pk) | Q(pk=user.pk),
            org_id=user.org_id,
        )
    return employees.filter(user_id=user.pk)


def _hire_date_of(user):
    employee = getattr(user, 'employee_record', None)
    return employee.hire_date if employee is not None else None


def _manager_of(user):
    employee = getattr(user, 'employee_record', None)
    boss = getattr(employee, 'manager', None) if employee is not None else None
    if boss is None:
        return None
    return {'id': boss.pk, 'name': boss.user.display_name}


def _find_manager(manager_id, organization_id):
    """The manager with this id in this organization, or None."""
    try:
        manager_id = int(manager_id)
    except (TypeError, ValueError):
        return None
    return Manager.objects.filter(pk=manager_id, user__org_id=organization_id).first()


def _invitation_pending(user):
    # An account has no usable password until the person accepts the invitation.
    check = getattr(user, 'has_usable_password', None)
    return bool(callable(check) and not check())


def _employee_data(user):
    return {
        'id': user.pk,
        'email': user.email,
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'role': user.role,
        'role_label': user.get_role_display(),
        'job_title': user.job_title or '',
        'gender': user.gender or '',
        'invitation_pending': _invitation_pending(user),
        'hire_date': _hire_date_of(user),
        'manager': _manager_of(user),
        'allowed_absence_days': user.allowed_absence_days or 0,
        'department': {
            'id': user.department or '',
            'name': user.department or '',
        },
    }


def _normalize_csv_header(header):
    name = re.sub(r'[^a-z0-9]+', '_', (header or '').strip().casefold()).strip('_')
    aliases = {
        'email_address': 'email',
        'employee_email': 'email',
        'work_email': 'email',
        'firstname': 'first_name',
        'given_name': 'first_name',
        'lastname': 'last_name',
        'family_name': 'last_name',
        'surname': 'last_name',
        'first': 'first_name',
        'last': 'last_name',
        'department_name': 'department',
        'title': 'job_title',
        'jobtitle': 'job_title',
        'hiredate': 'hire_date',
        'role_name': 'role',
        'system_role': 'role',
        'absence_days': 'allowed_absence_days',
        'password_hash': 'password',
        'passwordhash': 'password',
    }
    return aliases.get(name, name)


class OrganizationSetupSerializer(serializers.Serializer):
    organization_name = serializers.CharField(max_length=255)
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    email = serializers.EmailField(max_length=255)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_organization_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Organization name cannot be blank.')
        return value

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a first name.')
        return value

    def validate_last_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a last name.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class OrganizationSetupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrganizationSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            with transaction.atomic():
                organization = Organization.objects.create(
                    name=data['organization_name'],
                )
                user, _ = _create_account(
                    email=data['email'],
                    first_name=data['first_name'],
                    last_name=data['last_name'],
                    password=data['password'],
                    role='HR',
                    organization=organization,
                    hire_date=timezone.localdate(),  # the setup form does not ask for it
                )
        except IntegrityError:
            return Response(
                {'email': 'A user with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _login_response(user, status.HTTP_201_CREATED)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def _login_response(user, response_status=status.HTTP_200_OK):
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': user.pk,
                'email': user.email,
                'first_name': user.first_name or '',
                'last_name': user.last_name or '',
                'role': user.get_role_display(),
            },
        },
        status=response_status,
    )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data['email'],
            password=serializer.validated_data['password'],
        )
        if user is None:
            return Response(
                {'detail': 'Invalid email or password.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return _login_response(user)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email'],
        ).first()
        if user:
            try:
                _send_password_reset_email(user)
            except (smtplib.SMTPException, OSError):
                logger.exception('Could not send a Bayyinah password reset email.')

        return Response(
            {
                'detail': (
                    'If an account exists for that email, password reset '
                    'instructions have been sent.'
                )
            }
        )


class PasswordLinkSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def _user_from_password_link(uid, token):
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    if not default_token_generator.check_token(user, token):
        return None
    return user


def _change_password(data):
    user = _user_from_password_link(data['uid'], data['token'])
    if user is None:
        return None, {'detail': 'This password link is invalid or has expired.'}
    if user.has_usable_password() and user.check_password(data['password']):
        return None, {
            'password': ['Your new password must be different from your current password.']
        }
    try:
        validate_password(data['password'], user=user)
    except ValidationError as error:
        return None, {'password': error.messages}
    user.set_password(data['password'])
    user.save(update_fields=['password'])
    return user, None


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, error = _change_password(serializer.validated_data)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Password reset successfully.'})


class CSVEmployeeImportView(APIView):
    permission_classes = [IsAuthenticated, IsHRProfessional]

    def post(self, request):
        upload = request.FILES.get('file')
        if upload is None:
            return Response(
                {'file': 'Upload a CSV file using the "file" field.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > 5 * 1024 * 1024:
            return Response(
                {'file': 'CSV files must be 5 MB or smaller.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reader = csv.reader(StringIO(upload.read().decode('utf-8-sig')))
            headers = [_normalize_csv_header(value) for value in next(reader, [])]
        except (UnicodeDecodeError, csv.Error):
            return Response(
                {'file': 'The uploaded file is not a valid UTF-8 CSV.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(headers) != len(set(headers)):
            return Response(
                {'file': 'The CSV contains duplicate columns.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if 'password' in headers:
            return Response(
                {'file': 'Do not include passwords. Invitees set their own passwords.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        supported = {
            'email',
            'first_name',
            'last_name',
            'role',
            'job_title',
            'manager_email',
            'department',
            'gender',
            'hire_date',
            'allowed_absence_days',
        }
        if set(headers) - supported:
            return Response(
                {'file': 'The CSV contains unsupported columns.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            'email' not in headers
            or 'role' not in headers
            or 'job_title' not in headers
            or 'first_name' not in headers
            or 'last_name' not in headers
            or 'hire_date' not in headers
        ):
            return Response(
                {
                    'file': (
                        'CSV needs email, first name, last name, role, '
                        'job title, and hire date columns.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = []
        errors = []
        created_ids = []
        seen_emails = set()
        departments = {}
        for row_number, values in enumerate(reader, start=2):
            if not values or all(not value.strip() for value in values):
                continue
            if len(values) != len(headers):
                errors.append({
                    'row': row_number,
                    'detail': 'The number of values does not match the CSV columns.',
                })
                continue
            row = dict(zip(headers, (value.strip() for value in values)))
            try:
                email = serializers.EmailField(max_length=255).run_validation(
                    row.get('email', ''),
                )
                first_name = serializers.CharField(max_length=255).run_validation(
                    row.get('first_name', ''),
                ).strip()
                last_name = serializers.CharField(max_length=255).run_validation(
                    row.get('last_name', ''),
                ).strip()
                if not first_name:
                    raise serializers.ValidationError('Enter a first name.')
                if not last_name:
                    raise serializers.ValidationError('Enter a last name.')
                role_value = row.get('role', '').strip().casefold()
                role = {
                    'employee': 'Employee',
                    'manager': 'Manager',
                    'hr': 'HR',
                    'hr professional': 'HR',
                }.get(role_value)
                if role is None:
                    raise serializers.ValidationError(
                        'Role must be Employee, Manager, or HR.'
                    )
                if not row.get('job_title', '').strip():
                    raise serializers.ValidationError('Enter a job title.')
                if len(row.get('job_title', '')) > 255:
                    raise serializers.ValidationError(
                        'Job title must be 255 characters or fewer.'
                    )
                if email.casefold() in seen_emails:
                    raise serializers.ValidationError(
                        'This email appears more than once in the CSV.'
                    )
                if User.objects.filter(email__iexact=email).exists():
                    raise serializers.ValidationError(
                        'A user with this email already exists.'
                    )
                date = serializers.DateField().run_validation(
                    row.get('hire_date', ''),
                )
                absence_days = row.get('allowed_absence_days') or None
                if absence_days is not None:
                    absence_days = serializers.IntegerField(min_value=0).run_validation(
                        absence_days,
                    )
                if len(row.get('department', '')) > 255:
                    raise serializers.ValidationError(
                        'Department must be 255 characters or fewer.'
                    )
                rows.append({
                    'row': row_number,
                    'email': email,
                    'first_name': first_name,
                    'last_name': last_name,
                    'role': role,
                    'job_title': row.get('job_title') or None,
                    'manager_email': row.get('manager_email') or None,
                    'department': row.get('department') or None,
                    'gender': row.get('gender') or None,
                    'hire_date': date,
                    'allowed_absence_days': absence_days,
                })
                seen_emails.add(email.casefold())
            except serializers.ValidationError as error:
                errors.append({'row': row_number, 'detail': error.detail})

        for row in rows:
            manager = None
            if row['manager_email'] and row['role'] == 'Employee':
                manager = Manager.objects.filter(
                    user__email__iexact=row['manager_email'],
                    user__org_id=request.user.org_id,
                ).first()
                if manager is None:
                    errors.append({
                        'row': row['row'],
                        'detail': 'No manager with this email exists. Import the manager first.',
                    })
                    continue
            try:
                with transaction.atomic():
                    user, _ = _create_account(
                        email=row['email'],
                        first_name=row['first_name'],
                        last_name=row['last_name'],
                        password=None,
                        role=row['role'],
                        job_title=row['job_title'],
                        manager=manager,
                        organization=request.user.org,
                        department=row['department'],
                        gender=row['gender'],
                        hire_date=row['hire_date'],
                        allowed_absence_days=row['allowed_absence_days'],
                    )
                created_ids.append(user.pk)
                department_name = row['department'] or 'Unassigned'
                summary = departments.setdefault(
                    department_name,
                    {
                        'name': department_name,
                        'employees': 0,
                        'managers': 0,
                        'hr': 0,
                    },
                )
                role_summary_key = {
                    'Employee': 'employees',
                    'Manager': 'managers',
                    'HR': 'hr',
                }[row['role']]
                summary[role_summary_key] += 1
            except IntegrityError:
                errors.append({
                    'row': row['row'],
                    'detail': 'The record conflicts with an existing database value.',
                })

        employees_added = sum(item['employees'] for item in departments.values())
        managers_added = sum(item['managers'] for item in departments.values())
        hr_added = sum(item['hr'] for item in departments.values())
        return Response(
            {
                'pending_invitation_ids': created_ids,
                'status': (
                    'Import completed. Review the employee summary, then send '
                    'invitations when ready.'
                ),
                'summary': {
                    'employees_added': employees_added,
                    'managers_added': managers_added,
                    'hr_added': hr_added,
                    'total_added': len(created_ids),
                    'departments': list(departments.values()),
                },
                'errors': errors,
            },
            status=status.HTTP_201_CREATED,
        )


class CSVImportInviteAllSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )


class CSVImportInviteAllView(APIView):
    permission_classes = [IsAuthenticated, IsHRProfessional]

    def post(self, request):
        serializer = CSVImportInviteAllSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee_ids = list(dict.fromkeys(serializer.validated_data['employee_ids']))
        invited = 0
        errors = []
        remaining_ids = []

        for employee_id in employee_ids:
            user = User.objects.filter(
                Q(employee_record__isnull=False) | Q(manager_record__isnull=False),
                user_id=employee_id,
                org_id=request.user.org_id,
            ).first()
            if user is None or user.has_usable_password():
                errors.append({
                    'id': employee_id,
                    'detail': 'This employee cannot receive a setup invitation.',
                })
                continue
            try:
                _send_invitation_email(user)
                invited += 1
            except (smtplib.SMTPException, OSError):
                logger.exception('Could not send an employee invitation email.')
                remaining_ids.append(employee_id)
                errors.append({
                    'email': user.email,
                    'detail': 'Invitation email could not be sent. You can retry.',
                })

        return Response(
            {
                'invited': invited,
                'remaining': len(remaining_ids),
                'remaining_ids': remaining_ids,
                'message': (
                    'Invitations sent successfully.'
                    if not errors
                    else 'Some invitations could not be sent. Review the errors and retry.'
                ),
                'errors': errors,
            },
            status=(
                status.HTTP_200_OK
                if not errors
                else status.HTTP_207_MULTI_STATUS
            ),
        )


class TeamInviteView(APIView):
    permission_classes = [IsAuthenticated, IsHRProfessional]

    def post(self, request):
        email_serializer = serializers.EmailField(max_length=255)
        name_serializer = serializers.CharField(max_length=255)
        try:
            email = email_serializer.run_validation(request.data.get('email', ''))
            first_name = name_serializer.run_validation(
                str(request.data.get('first_name', '')).strip(),
            )
            last_name = name_serializer.run_validation(
                str(request.data.get('last_name', '')).strip(),
            )
            hire_date = serializers.DateField().run_validation(
                request.data.get('hire_date', ''),
            )
            if not first_name:
                raise serializers.ValidationError('Enter a first name.')
            if not last_name:
                raise serializers.ValidationError('Enter a last name.')
        except serializers.ValidationError as error:
            return Response(
                {'detail': error.detail},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = {
            'employee': 'Employee',
            'manager': 'Manager',
            'hr': 'HR',
            'hr professional': 'HR',
        }.get(str(request.data.get('role', 'Employee')).strip().casefold())
        if role is None:
            return Response(
                {'role': 'Role must be Employee, Manager, or HR Professional.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'email': 'A user with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        department = str(request.data.get('department', '')).strip() or None
        if department and len(department) > 255:
            return Response(
                {'department': 'Department must be 255 characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        manager = None
        if role == 'Employee':
            manager = _find_manager(request.data.get('manager_id'), request.user.org_id)
            if manager is None:
                return Response(
                    {'manager_id': 'Choose the manager this employee reports to.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        job_title = str(request.data.get('job_title', '')).strip()
        if not job_title:
            return Response(
                {'job_title': 'Enter a job title.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(job_title) > 255:
            return Response(
                {'job_title': 'Job title must be 255 characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user, _ = _create_account(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    password=None,
                    role=role,
                    organization=request.user.org,
                    hire_date=hire_date,
                    department=department,
                    job_title=job_title,
                    manager=manager,
                )
                _send_invitation_email(user)
        except (smtplib.SMTPException, OSError):
            return Response(
                {'detail': 'Invitation email could not be sent; no account was created.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except IntegrityError:
            return Response(
                {'email': 'This record conflicts with an existing database entry.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'message': f'Invitation successfully sent to {email}.'},
            status=status.HTTP_201_CREATED,
        )


class DepartmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.filter(org_id=request.user.org_id)
        if request.user.role != 'HR':
            users = users.filter(department=request.user.department)
        departments = users.exclude(
            department__isnull=True,
        ).exclude(
            department='',
        ).values_list('department', flat=True).distinct().order_by('department')
        return Response([
            {'id': department, 'name': department}
            for department in departments
        ])


class EmployeeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = _employees_visible_to(request.user).order_by(
            'last_name',
            'first_name',
        )
        return Response([_employee_data(user) for user in users])


class EmployeeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, employee_id):
        return _employees_visible_to(request.user).filter(pk=employee_id).first()

    def get(self, request, employee_id):
        user = self.get_object(request, employee_id)
        if user is None:
            return Response(
                {'detail': 'Employee not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_employee_data(user))

    def patch(self, request, employee_id):
        if request.user.role not in {'HR', 'Manager'}:
            return Response(
                {'detail': 'Employees cannot update employee records.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = self.get_object(request, employee_id)
        if user is None:
            return Response(
                {'detail': 'Employee not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        fields = {
            'first_name': serializers.CharField(max_length=255, required=False),
            'last_name': serializers.CharField(
                max_length=255,
                required=False,
                allow_blank=True,
            ),
            'gender': serializers.CharField(
                max_length=50,
                required=False,
                allow_blank=True,
                allow_null=True,
            ),
            'allowed_absence_days': serializers.IntegerField(
                min_value=0,
                required=False,
                allow_null=True,
            ),
            'department': serializers.CharField(
                max_length=255,
                required=False,
                allow_blank=True,
                allow_null=True,
            ),
            'hire_date': serializers.DateField(required=False),
            'job_title': serializers.CharField(max_length=255, required=False),
            'manager_id': serializers.IntegerField(required=False, allow_null=True),
        }
        invalid_fields = set(request.data) - set(fields)
        if invalid_fields:
            return Response(
                {'detail': 'Only employee profile fields can be updated.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = serializers.Serializer(data=request.data)
        serializer.fields.update(fields)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        hire_date = data.pop('hire_date', None)
        change_manager = 'manager_id' in data
        manager_id = data.pop('manager_id', None)
        new_manager = None
        if change_manager:
            if request.user.role != 'HR':
                return Response(
                    {'manager_id': 'Only HR can change who an employee reports to.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if user.role != 'Employee':
                return Response(
                    {'manager_id': 'Only employees report to a manager.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            new_manager = _find_manager(manager_id, request.user.org_id)
            if new_manager is None:
                return Response(
                    {'manager_id': 'Choose the manager this employee reports to.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if 'job_title' in data and not data['job_title'].strip():
            return Response(
                {'job_title': 'Enter a job title.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for field, value in data.items():
            setattr(user, field, value)
        user.save()
        employee_fields = []
        employee = user.employee_record
        if hire_date is not None:
            employee.hire_date = hire_date
            employee_fields.append('hire_date')
        if change_manager:
            employee.manager = new_manager
            employee_fields.append('manager')
        if employee_fields:
            employee.save(update_fields=employee_fields)
        return Response(_employee_data(user))


class SetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, error = _change_password(serializer.validated_data)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Password set successfully.'})
