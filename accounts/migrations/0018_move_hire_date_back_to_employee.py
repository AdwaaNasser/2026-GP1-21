from django.db import migrations, models

ROLE_NAMES = {'HR', 'Employee', 'Manager'}


def move_hire_date_and_roles(apps, schema_editor):
    """Copy hire_date from the user to the employee row and keep the role in
    employee.system_role. Managers get an employee row again (system_role
    'Manager'). The user's job_title held only the role, so it is cleared and
    becomes a free-text job title.
    """
    User = apps.get_model('accounts', 'User')
    Employee = apps.get_model('accounts', 'Employee')
    Manager = apps.get_model('accounts', 'Manager')
    database = schema_editor.connection.alias

    manager_ids = set(
        Manager.objects.using(database).values_list('user_id', flat=True)
    )
    employees = {
        employee.user_id: employee
        for employee in Employee.objects.using(database).all()
    }

    for user in User.objects.using(database).all():
        employee = employees.get(user.user_id)
        if employee is None:
            employee = Employee(
                user_id=user.user_id,
                system_role='Manager' if user.user_id in manager_ids else 'HR',
            )
        elif user.user_id in manager_ids:
            employee.system_role = 'Manager'
        employee.hire_date = user.hire_date
        employee.save(using=database)

        if user.job_title in ROLE_NAMES:
            user.job_title = None
            user.save(using=database, update_fields=['job_title'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_finalize_role_and_hire_date_schema'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='hire_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(
            move_hire_date_and_roles,
            migrations.RunPython.noop,
        ),
    ]
