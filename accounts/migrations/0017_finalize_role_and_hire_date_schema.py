from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0016_separate_manager_role_and_hire_date'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='employee',
            name='hire_date',
        ),
        migrations.AlterField(
            model_name='user',
            name='hire_date',
            field=models.DateField(),
        ),
        migrations.AlterField(
            model_name='employee',
            name='system_role',
            field=models.CharField(
                choices=[('HR', 'HR Professional'), ('Employee', 'Employee')],
                max_length=100,
            ),
        ),
        migrations.AlterField(
            model_name='user',
            name='job_title',
            field=models.CharField(
                blank=True,
                choices=[
                    ('HR', 'HR Professional'),
                    ('Employee', 'Employee'),
                    ('Manager', 'Manager'),
                ],
                max_length=255,
                null=True,
            ),
        ),
    ]
