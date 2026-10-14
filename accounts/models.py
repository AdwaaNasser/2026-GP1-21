import secrets

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone


class Organization(models.Model):
    id = models.AutoField(primary_key=True, db_column='organizationid')
    name = models.CharField(max_length=255, unique=True, db_column='organizationname')

    class Meta:
        db_table = 'organization'

    def __str__(self):
        return self.name


class Department(models.Model):
    id = models.AutoField(primary_key=True, db_column='departmentid')
    name = models.CharField(max_length=255, db_column='departmentname')
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name='departments',
        db_column='organizationid',
    )

    class Meta:
        managed = False
        db_table = 'department'

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    def create_user(
        self,
        email,
        full_name=None,
        password=None,
        role='Employee',
        department=None,
        **extra_fields,
    ):
        if not email:
            raise ValueError('Users must have an email address')
        if department is None:
            raise ValueError('Users must belong to a department')

        first_name = extra_fields.pop('first_name', '')
        last_name = extra_fields.pop('last_name', '')
        if full_name:
            name_parts = full_name.strip().split(maxsplit=1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ''
        if not first_name:
            raise ValueError('Users must have a first name')
        if role == 'HR Professional':
            role = 'HR'

        user = self.model(
            email=self.normalize_email(email),
            first_name=first_name,
            last_name=last_name,
            role=role,
            department=department,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        requested_superuser = extra_fields.pop('is_superuser', False)
        extra_fields.pop('is_staff', None)
        if requested_superuser:
            raise ValueError(
                'The existing employee schema does not support superuser accounts.'
            )
        extra_fields.setdefault('role', 'HR')
        return self.create_user(
            email,
            full_name,
            password=password,
            **extra_fields,
        )


class SystemUser(AbstractBaseUser):
    id = models.AutoField(primary_key=True, db_column='employeeid')
    password = models.CharField(max_length=255, db_column='passwordhash')
    last_login = None
    email = models.EmailField(max_length=254, unique=True)
    first_name = models.CharField(max_length=100, db_column='firstname')
    last_name = models.CharField(max_length=100, blank=True, db_column='lastname')
    gender = models.CharField(max_length=20, blank=True, null=True)
    role = models.CharField(
        max_length=20,
        choices=[
            ('HR', 'HR Professional'),
            ('Manager', 'Manager'),
            ('Employee', 'Employee'),
        ],
        db_column='systemrole',
    )
    job_title = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        db_column='jobtitle',
    )
    hire_date = models.DateField(default=timezone.localdate, db_column='hiredate')
    allowed_absence_days = models.IntegerField(
        default=0,
        db_column='allowedabsencedays',
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name='employees',
        db_column='departmentid',
    )
    manager = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        related_name='direct_reports',
        db_column='managerid',
        blank=True,
        null=True,
    )

    objects = UserManager()

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'department']

    class Meta:
        managed = False
        db_table = 'employee'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @full_name.setter
    def full_name(self, value):
        name_parts = value.strip().split(maxsplit=1)
        self.first_name = name_parts[0] if name_parts else ''
        self.last_name = name_parts[1] if len(name_parts) > 1 else ''

    @property
    def organization(self):
        return self.department.organization

    @property
    def is_active(self):
        return True

    @property
    def is_staff(self):
        return self.role == 'HR'

    @property
    def is_superuser(self):
        return False

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.first_name

    def __str__(self):
        return self.email


class InvitationToken(models.Model):
    employee = models.ForeignKey(SystemUser, on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True, default=secrets.token_hex)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)


class CSVImportBatch(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    created_by = models.ForeignKey(SystemUser, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)


class CSVImportRecord(models.Model):
    class Status(models.TextChoices):
        IMPORTED = 'imported', 'Imported'
        INVITED = 'invited', 'Invited'

    batch = models.ForeignKey(
        CSVImportBatch,
        on_delete=models.CASCADE,
        related_name='records',
    )
    employee = models.ForeignKey(SystemUser, on_delete=models.CASCADE)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IMPORTED,
    )
    error = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['batch', 'employee'],
                name='unique_employee_per_csv_import',
            ),
        ]
