import csv
from io import StringIO
import re
import secrets
import smtplib
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.views import View
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    CSVImportBatch,
    CSVImportRecord,
    Department,
    InvitationToken,
    Organization,
    SystemUser,
)
from .permissions import IsHRProfessional


def _set_invitation_password(token, password):
    validate_password(password)
    with transaction.atomic():
        invitation = InvitationToken.objects.select_for_update().get(
            token=token,
            is_used=False,
        )
        employee = invitation.employee
        employee.set_password(password)
        employee.save(update_fields=['password'])
        invitation.is_used = True
        invitation.save(update_fields=['is_used'])


def _name_parts(full_name):
    parts = full_name.strip().split(maxsplit=1)
    if not parts or any(len(part) > 100 for part in parts):
        raise serializers.ValidationError(
            'First and last names must each be 100 characters or fewer.'
        )
    return parts[0], parts[1] if len(parts) > 1 else ''


def _new_hr_department_name(organization):
    base_name = f'Human Resources - {organization.name}'
    department_name = base_name[:255]
    suffix = 2

    while Department.objects.filter(name=department_name).exists():
        suffix_text = f' ({suffix})'
        department_name = f'{base_name[:255 - len(suffix_text)]}{suffix_text}'
        suffix += 1

    return department_name


def _send_invitation_email(employee, invitation):
    activation_link = (
        f"{settings.BAYYINAH_FRONTEND_URL}/set-password?"
        f"{urlencode({'token': invitation.token})}"
    )
    send_mail(
        subject='Welcome to Bayyinah - Complete Your Onboarding',
        message=(
            f'Hello {employee.full_name},\n\n'
            'You have been added to the Bayyinah HR platform. '
            'Please use the link below to set your password:\n\n'
            f'{activation_link}\n\n'
            'Best regards,\nBayyinah HR Team'
        ),
        from_email=None,
        recipient_list=[employee.email],
        fail_silently=False,
    )


def _employees_visible_to(user):
    if user.role == 'HR':
        return SystemUser.objects.filter(
            department__organization_id=user.department.organization_id
        ).select_related('department')
    if user.role == 'Manager':
        return SystemUser.objects.filter(
            department_id=user.department_id
        ).select_related('department')
    return SystemUser.objects.filter(pk=user.pk).select_related('department')


def _employee_data(employee):
    return {
        'id': employee.pk,
        'email': employee.email,
        'first_name': employee.first_name,
        'last_name': employee.last_name,
        'full_name': employee.full_name,
        'role': employee.get_role_display(),
        'job_title': employee.job_title,
        'hire_date': employee.hire_date,
        'allowed_absence_days': employee.allowed_absence_days,
        'department': {
            'id': employee.department_id,
            'name': employee.department.name,
        },
    }


def _normalize_csv_header(header):
    name = re.sub(r'[^a-z0-9]+', '_', (header or '').strip().casefold()).strip('_')
    aliases = {
        'email': 'email',
        'email_address': 'email',
        'employee_email': 'email',
        'work_email': 'email',
        'first_name': 'first_name',
        'firstname': 'first_name',
        'given_name': 'first_name',
        'last_name': 'last_name',
        'lastname': 'last_name',
        'family_name': 'last_name',
        'surname': 'last_name',
        'full_name': 'full_name',
        'name': 'full_name',
        'employee_name': 'full_name',
        'role': 'role',
        'system_role': 'role',
        'systemrole': 'role',
        'employee_role': 'role',
        'department': 'department',
        'department_name': 'department',
        'departmentname': 'department',
        'department_id': 'department_id',
        'departmentid': 'department_id',
        'dept': 'department',
        'gender': 'gender',
        'job_title': 'job_title',
        'jobtitle': 'job_title',
        'title': 'job_title',
        'hire_date': 'hire_date',
        'hiredate': 'hire_date',
        'hired_date': 'hire_date',
        'allowed_absence_days': 'allowed_absence_days',
        'allowedabsencedays': 'allowed_absence_days',
        'absence_days': 'allowed_absence_days',
        'manager_email': 'manager_email',
        'manageremail': 'manager_email',
        'manager_id': 'manager_id',
        'managerid': 'manager_id',
        'employee_id': 'employee_id',
        'employeeid': 'employee_id',
        'password': 'password',
        'password_hash': 'password',
        'passwordhash': 'password',
    }
    return aliases.get(name, name)


class OrganizationSetupSerializer(serializers.Serializer):
    organization_name = serializers.CharField(max_length=255)
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_organization_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Organization name cannot be blank.')
        if Organization.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError(
                'An organization with this name already exists.'
            )
        return value

    def validate_full_name(self, value):
        _name_parts(value)
        return value.strip()

    def validate_email(self, value):
        if SystemUser.objects.filter(email__iexact=value).exists():
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
        first_name, last_name = _name_parts(data['full_name'])

        with transaction.atomic():
            organization = Organization.objects.create(name=data['organization_name'])
            department = Department.objects.create(
                name=_new_hr_department_name(organization),
                organization=organization,
            )
            hr_user = SystemUser.objects.create_user(
                email=data['email'],
                first_name=first_name,
                last_name=last_name,
                password=data['password'],
                role='HR',
                department=department,
            )

        refresh = RefreshToken.for_user(hr_user)
        return Response(
            {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': {
                    'id': hr_user.pk,
                    'email': hr_user.email,
                    'full_name': hr_user.full_name,
                    'role': hr_user.get_role_display(),
                    'organization': organization.name,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


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

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': {
                    'id': user.pk,
                    'email': user.email,
                    'full_name': user.full_name,
                    'role': user.get_role_display(),
                },
            }
        )


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
            content = upload.read().decode('utf-8-sig')
            reader = csv.reader(StringIO(content))
            raw_headers = next(reader, [])
            headers = [_normalize_csv_header(header) for header in raw_headers]
            if len(headers) != len(set(headers)):
                return Response(
                    {'file': 'The CSV contains duplicate columns after name normalization.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if 'password' in headers:
                return Response(
                    {'file': 'Do not include password or password-hash columns; invitees set their own passwords.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if 'employee_id' in headers:
                return Response(
                    {'file': 'Employee IDs are generated by the database and must not be included in a new-employee CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            supported_headers = {
                'email',
                'first_name',
                'last_name',
                'full_name',
                'role',
                'department',
                'department_id',
                'gender',
                'job_title',
                'hire_date',
                'allowed_absence_days',
                'manager_email',
                'manager_id',
            }
            unsupported_headers = set(headers) - supported_headers
            if unsupported_headers:
                return Response(
                    {
                        'file': (
                            'Unsupported CSV columns: '
                            + ', '.join(sorted(unsupported_headers))
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                'email' not in headers
                or not (
                    'full_name' in headers
                    or {'first_name', 'last_name'}.issubset(headers)
                )
                or 'role' not in headers
                or not {'department', 'department_id'}.intersection(headers)
            ):
                return Response(
                    {
                        'file': (
                            'CSV needs email, role, department, and either full name '
                            'or both first name and last name columns.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows = []
            for row_number, values in enumerate(reader, start=2):
                if not values or all(not value.strip() for value in values):
                    continue
                if len(values) != len(headers):
                    rows.append((row_number, None))
                    continue
                rows.append(
                    (row_number, dict(zip(headers, (value.strip() for value in values))))
                )
        except (UnicodeDecodeError, csv.Error, StopIteration):
            return Response(
                {'file': 'The uploaded file is not a valid UTF-8 CSV.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row_errors = []
        parsed_rows = []
        seen_emails = set()
        for row_number, row in rows:
            if row is None:
                row_errors.append(
                    {'row': row_number, 'detail': 'The number of values does not match the CSV columns.'}
                )
                continue
            full_name = row.get('full_name', '')
            try:
                email = serializers.EmailField().run_validation(row.get('email', '')).strip()
                if not full_name:
                    first_name = row.get('first_name', '')
                    if not first_name:
                        raise serializers.ValidationError('A first name is required.')
                    full_name = f"{first_name} {row.get('last_name', '')}".strip()
                first_name, last_name = _name_parts(full_name or '')
                role = row.get('role', '').casefold()
                if role not in {'employee', 'manager'}:
                    raise serializers.ValidationError(
                        'Role must be Employee or Manager; HR accounts cannot be invited.'
                    )
                department_name = row.get('department', '') or row.get(
                    'department_id', ''
                )
                department_is_id = not row.get('department') and bool(
                    row.get('department_id')
                )
                if not department_name or len(department_name) > 255:
                    raise serializers.ValidationError(
                        'A department name or department ID is required.'
                    )
                if department_is_id and not department_name.isdecimal():
                    raise serializers.ValidationError(
                        'Department ID must be a positive integer.'
                    )
                gender = row.get('gender', '') or None
                if gender and len(gender) > 20:
                    raise serializers.ValidationError('Gender must be 20 characters or fewer.')
                job_title = row.get('job_title', '')
                if len(job_title) > 100:
                    raise serializers.ValidationError(
                        'Job title must be 100 characters or fewer.'
                    )
                hire_date = row.get('hire_date', '')
                if hire_date:
                    hire_date = serializers.DateField().run_validation(hire_date)
                absence_days = row.get('allowed_absence_days', '')
                if absence_days:
                    absence_days = serializers.IntegerField(min_value=0).run_validation(
                        absence_days
                    )
                else:
                    absence_days = 0
                manager_email = row.get('manager_email', '').strip()
                if manager_email:
                    manager_email = serializers.EmailField().run_validation(manager_email)
                manager_id = row.get('manager_id', '').strip()
                if manager_email and manager_id:
                    raise serializers.ValidationError(
                        'Use either Manager Email or Manager ID, not both.'
                    )
                if manager_id:
                    manager_id = serializers.IntegerField(min_value=1).run_validation(
                        manager_id
                    )
                email_key = email.casefold()
                if email_key in seen_emails:
                    raise serializers.ValidationError(
                        'This email appears more than once in the CSV.'
                    )
                seen_emails.add(email_key)
                if SystemUser.objects.filter(email__iexact=email).exists():
                    raise serializers.ValidationError(
                        'A user with this email already exists.'
                    )
                parsed_rows.append(
                    {
                        'row': row_number,
                        'email': email,
                        'first_name': first_name,
                        'last_name': last_name,
                        'role': role.title(),
                        'department': department_name,
                        'department_is_id': department_is_id,
                        'gender': gender,
                        'job_title': job_title or None,
                        'hire_date': hire_date or None,
                        'allowed_absence_days': absence_days,
                        'manager_email': manager_email,
                        'manager_id': manager_id,
                    }
                )
            except serializers.ValidationError as error:
                row_errors.append(
                    {'row': row_number, 'detail': error.detail}
                )

        batch_manager_emails = {
            row['email'].casefold(): row['role']
            for row in parsed_rows
        }
        for row in parsed_rows:
            manager_email = row['manager_email']
            manager_id = row['manager_id']
            if not manager_email and not manager_id:
                continue
            if manager_email:
                manager_role = batch_manager_emails.get(manager_email.casefold())
            else:
                manager_role = None
            if manager_role is None:
                manager = SystemUser.objects.filter(
                    department__organization_id=request.user.department.organization_id,
                    role='Manager',
                    **(
                        {'email__iexact': manager_email}
                        if manager_email
                        else {'pk': manager_id}
                    ),
                ).first()
                if manager is None:
                    row_errors.append(
                        {
                            'row': row['row'],
                            'detail': 'Manager email must belong to a Manager in this organization or this CSV.',
                        }
                    )
                    continue
            elif manager_role != 'Manager':
                row_errors.append(
                    {
                        'row': row['row'],
                        'detail': 'Manager email must identify an account with the Manager role.',
                    }
                )
        invalid_row_numbers = {error['row'] for error in row_errors}
        parsed_rows = [
            row for row in parsed_rows if row['row'] not in invalid_row_numbers
        ]

        organization = request.user.department.organization
        with transaction.atomic():
            batch = CSVImportBatch.objects.create(
                organization=organization,
                created_by=request.user,
            )

        created_by_email = {}
        for row in sorted(parsed_rows, key=lambda item: item['role'] != 'Manager'):
            try:
                with transaction.atomic():
                    department = None
                    if row['department_is_id']:
                        department = Department.objects.filter(
                            pk=int(row['department']),
                            organization_id=organization.pk,
                        ).first()
                        if department is None:
                            raise ValueError(
                                'Department ID must identify a department in this organization.'
                            )
                    else:
                        department = Department.objects.filter(
                            organization_id=organization.pk,
                            name__iexact=row['department'],
                        ).first()
                        if department is None:
                            department = Department.objects.create(
                                name=row['department'],
                                organization=organization,
                            )
                    manager = None
                    if row['manager_email']:
                        manager_details = created_by_email.get(
                            row['manager_email'].casefold()
                        )
                        manager = (
                            manager_details[0]
                            if manager_details
                            else SystemUser.objects.filter(
                                email__iexact=row['manager_email'],
                                department__organization_id=organization.pk,
                                role='Manager',
                            ).first()
                        )
                    elif row['manager_id']:
                        manager = SystemUser.objects.filter(
                            pk=row['manager_id'],
                            department__organization_id=organization.pk,
                            role='Manager',
                        ).first()
                    if (row['manager_email'] or row['manager_id']) and manager is None:
                        raise ValueError(
                            'The specified Manager could not be created or found.'
                        )
                    employee_fields = {
                        'email': row['email'],
                        'first_name': row['first_name'],
                        'last_name': row['last_name'],
                        'role': row['role'],
                        'department': department,
                        'gender': row['gender'],
                        'job_title': row['job_title'],
                        'allowed_absence_days': row['allowed_absence_days'],
                    }
                    if manager is not None:
                        employee_fields['manager'] = manager
                    if row['hire_date']:
                        employee_fields['hire_date'] = row['hire_date']
                    employee = SystemUser.objects.create_user(**employee_fields)
                    record = CSVImportRecord.objects.create(
                        batch=batch,
                        employee=employee,
                    )
                    created_by_email[row['email'].casefold()] = (employee, record, row)
            except (IntegrityError, ValueError) as error:
                row_errors.append(
                    {
                        'row': row['row'],
                        'detail': (
                            'This record could not be saved because it conflicts with '
                            'an existing database value.'
                            if isinstance(error, IntegrityError)
                            else str(error)
                        ),
                    }
                )

        records = list(
            batch.records.select_related('employee__department').all()
        )
        by_department = {}
        for record in records:
            department_name = record.employee.department.name
            summary = by_department.setdefault(
                department_name,
                {'name': department_name, 'employees': 0, 'managers': 0},
            )
            role_key = 'managers' if record.employee.role == 'Manager' else 'employees'
            summary[role_key] += 1
        employee_count = sum(
            1 for record in records if record.employee.role == 'Employee'
        )
        manager_count = sum(
            1 for record in records if record.employee.role == 'Manager'
        )
        return Response(
            {
                'batch_id': batch.pk,
                'status': 'Import completed. Review the employee summary, then send invitations when ready.',
                'summary': {
                    'employees_added': employee_count,
                    'managers_added': manager_count,
                    'total_added': len(records),
                    'departments': list(by_department.values()),
                },
                'errors': row_errors,
            },
            status=status.HTTP_201_CREATED,
        )


class CSVImportInviteAllView(APIView):
    permission_classes = [IsAuthenticated, IsHRProfessional]

    def post(self, request, batch_id):
        batch = CSVImportBatch.objects.filter(
            pk=batch_id,
            organization_id=request.user.department.organization_id,
            created_by=request.user,
        ).first()
        if batch is None:
            return Response(
                {'detail': 'CSV import batch not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        invited = 0
        errors = []
        pending_records = batch.records.filter(
            status=CSVImportRecord.Status.IMPORTED
        ).select_related('employee')
        for record in pending_records:
            try:
                with transaction.atomic():
                    invitation = InvitationToken.objects.create(
                        employee=record.employee
                    )
                    _send_invitation_email(record.employee, invitation)
                    record.status = CSVImportRecord.Status.INVITED
                    record.error = ''
                    record.save(update_fields=['status', 'error'])
            except (smtplib.SMTPException, OSError):
                record.error = 'Invitation email could not be sent. Retry this batch.'
                record.save(update_fields=['error'])
                errors.append(
                    {
                        'email': record.employee.email,
                        'detail': record.error,
                    }
                )
                continue
            except IntegrityError:
                record.error = 'Invitation could not be recorded because of a database conflict.'
                record.save(update_fields=['error'])
                errors.append(
                    {
                        'email': record.employee.email,
                        'detail': record.error,
                    }
                )
                continue
            invited += 1

        return Response(
            {
                'invited': invited,
                'remaining': batch.records.filter(
                    status=CSVImportRecord.Status.IMPORTED
                ).count(),
                'message': (
                    'Invitations sent successfully.'
                    if not errors
                    else 'Some invitations could not be sent. Review the errors and retry.'
                ),
                'errors': errors,
            },
            status=status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS,
        )


class TeamInviteView(APIView):
    permission_classes = [IsAuthenticated, IsHRProfessional]

    def post(self, request):
        serializer = serializers.EmailField()
        try:
            email = serializer.run_validation(request.data.get('email', ''))
            full_name = str(request.data.get('full_name', '')).strip()
            first_name, last_name = _name_parts(full_name)
        except serializers.ValidationError as error:
            return Response(
                {'detail': error.detail},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = str(request.data.get('role', 'Employee')).casefold()
        if role not in {'employee', 'manager'}:
            return Response(
                {'role': 'Role must be Employee or Manager.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        department_id = request.data.get('department_id')
        departments = Department.objects.filter(
            organization_id=request.user.department.organization_id
        )
        if department_id:
            department = departments.filter(pk=department_id).first()
            if department is None:
                return Response(
                    {'department_id': 'Choose a department in your organization.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            department = request.user.department
        if SystemUser.objects.filter(email__iexact=email).exists():
            return Response(
                {'email': 'A user with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                employee = SystemUser.objects.create_user(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    role=role.title(),
                    department=department,
                )
                invitation = InvitationToken.objects.create(employee=employee)
                _send_invitation_email(employee, invitation)
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
        departments = Department.objects.filter(
            organization_id=request.user.department.organization_id
        )
        if request.user.role != 'HR':
            departments = departments.filter(pk=request.user.department_id)
        return Response([
            {'id': department.pk, 'name': department.name}
            for department in departments.order_by('name')
        ])


class EmployeeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employees = _employees_visible_to(request.user).order_by('last_name', 'first_name')
        return Response([_employee_data(employee) for employee in employees])


class EmployeeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, employee_id):
        return _employees_visible_to(request.user).filter(pk=employee_id).first()

    def get(self, request, employee_id):
        employee = self.get_object(request, employee_id)
        if employee is None:
            return Response(
                {'detail': 'Employee not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_employee_data(employee))

    def patch(self, request, employee_id):
        if request.user.role not in {'HR', 'Manager'}:
            return Response(
                {'detail': 'Employees cannot update employee records.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        employee = self.get_object(request, employee_id)
        if employee is None:
            return Response(
                {'detail': 'Employee not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        allowed_fields = {
            'first_name': serializers.CharField(max_length=100, required=False),
            'last_name': serializers.CharField(max_length=100, required=False, allow_blank=True),
            'gender': serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True),
            'job_title': serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True),
            'hire_date': serializers.DateField(required=False),
            'allowed_absence_days': serializers.IntegerField(min_value=0, required=False),
        }
        if request.user.role == 'HR':
            allowed_fields['department_id'] = serializers.IntegerField(required=False)
        invalid_fields = set(request.data) - set(allowed_fields)
        if invalid_fields:
            return Response(
                {'detail': 'Only employee profile fields can be updated.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = serializers.Serializer(data=request.data)
        serializer.fields.update(allowed_fields)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if 'department_id' in values:
            department = Department.objects.filter(
                pk=values.pop('department_id'),
                organization_id=request.user.department.organization_id,
            ).first()
            if department is None:
                return Response(
                    {'department_id': 'Choose a department in your organization.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            employee.department = department
        for field, value in values.items():
            setattr(employee, field, value)
        employee.save()
        return Response(_employee_data(employee))


class SetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            _set_invitation_password(
                serializer.validated_data['token'],
                serializer.validated_data['password'],
            )
        except ValidationError as error:
            return Response(
                {'password': error.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except InvitationToken.DoesNotExist:
            return Response(
                {'detail': 'This invitation link is invalid or has already been used.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({'detail': 'Password set successfully.'})


class SetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class SetPasswordPageView(View):
    template_name = 'accounts/set_password.html'

    def get(self, request):
        if request.GET.get('complete') == '1':
            return render(
                request,
                self.template_name,
                {
                    'complete': True,
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
            )

        token = request.GET.get('token', '')
        if not token or not InvitationToken.objects.filter(
            token=token,
            is_used=False,
        ).exists():
            return render(
                request,
                self.template_name,
                {
                    'error': 'This invitation link is invalid or has already been used.',
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
                status=400,
            )
        return render(
            request,
            self.template_name,
            {
                'token': token,
                'frontend_url': settings.BAYYINAH_FRONTEND_URL,
            },
        )

    def post(self, request):
        token = request.POST.get('token', '')
        password = request.POST.get('password', '')
        password_confirmation = request.POST.get('password_confirmation', '')

        if not token or not password or not password_confirmation:
            return render(
                request,
                self.template_name,
                {
                    'token': token,
                    'error': 'Enter and confirm your new password.',
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
                status=400,
            )
        if password != password_confirmation:
            return render(
                request,
                self.template_name,
                {
                    'token': token,
                    'error': 'The passwords do not match.',
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
                status=400,
            )

        try:
            _set_invitation_password(token, password)
        except ValidationError as error:
            return render(
                request,
                self.template_name,
                {
                    'token': token,
                    'errors': error.messages,
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
                status=400,
            )
        except InvitationToken.DoesNotExist:
            return render(
                request,
                self.template_name,
                {
                    'error': 'This invitation link is invalid or has already been used.',
                    'frontend_url': settings.BAYYINAH_FRONTEND_URL,
                },
                status=400,
            )

        return HttpResponseRedirect(f"{reverse('set-password-page')}?complete=1")
