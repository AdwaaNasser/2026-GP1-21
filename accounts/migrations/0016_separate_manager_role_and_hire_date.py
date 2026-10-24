from django.db import migrations, models


def migrate_roles_and_hire_dates(apps, schema_editor):
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
    users = list(User.objects.using(database).all())

    missing_hire_dates = [
        user.user_id
        for user in users
        if user.user_id not in employees or employees[user.user_id].hire_date is None
    ]
    if missing_hire_dates:
        raise RuntimeError(
            'Cannot migrate role data: actual hire dates are missing for user '
            f'IDs {missing_hire_dates[:20]}. Add their real hire dates before '
            'running migrations again.'
        )

    manager_employee_ids = []
    for user in users:
        employee = employees[user.user_id]
        is_manager = (
            user.user_id in manager_ids or employee.system_role == 'Manager'
        )
        if is_manager:
            if user.user_id not in manager_ids:
                Manager.objects.using(database).create(user_id=user.user_id)
            manager_employee_ids.append(user.user_id)
            role = 'Manager'
        else:
            role = employee.system_role
            if role not in {'HR', 'Employee'}:
                role = 'HR'

        user.job_title = role
        user.hire_date = employee.hire_date
        user.save(using=database, update_fields=['job_title', 'hire_date'])

    if manager_employee_ids:
        referencing_records = []
        for relation in Employee._meta.related_objects:
            related_model = relation.related_model
            relation_field = relation.field
            if related_model == Employee:
                continue
            if related_model.objects.using(database).filter(
                **{f'{relation_field.attname}__in': manager_employee_ids}
            ).exists():
                referencing_records.append(related_model._meta.db_table)
        if referencing_records:
            raise RuntimeError(
                'Cannot remove manager records from the employee table because '
                'they are referenced by existing records in: '
                f'{", ".join(sorted(set(referencing_records)))}. Reassign or '
                'resolve those records before running migrations again.'
            )

        Employee.objects.using(database).filter(
            user_id__in=manager_employee_ids,
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0015_require_employee_hire_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='hire_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(
            migrate_roles_and_hire_dates,
            migrations.RunPython.noop,
        ),
    ]
