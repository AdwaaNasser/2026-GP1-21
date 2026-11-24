from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0026_project_created_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='seniority_level',
            field=models.CharField(
                blank=True,
                choices=[
                    ('Junior', 'Junior'),
                    ('Mid', 'Mid'),
                    ('Senior', 'Senior'),
                    ('Lead', 'Lead'),
                    ('Principal', 'Principal'),
                    ('Manager', 'Manager'),
                ],
                max_length=20,
                null=True,
            ),
        ),
    ]
