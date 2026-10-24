from django.db import migrations, models


def require_existing_hire_dates(apps, schema_editor):
    Employee = apps.get_model('accounts', 'Employee')
    database = schema_editor.connection.alias
    missing_dates = Employee.objects.using(database).filter(
        hire_date__isnull=True,
    ).count()
    if missing_dates:
        raise RuntimeError(
            f'Cannot require employee hire dates: {missing_dates} employee '
            'record(s) have no hire date. Update those records with their '
            'actual hire dates, then run migrations again.'
        )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_remove_user_full_name'),
    ]

    operations = [
        migrations.RunPython(
            require_existing_hire_dates,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='employee',
            name='hire_date',
            field=models.DateField(),
        ),
    ]
