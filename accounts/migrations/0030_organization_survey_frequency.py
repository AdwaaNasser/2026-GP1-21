from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0029_goal_approval'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='survey_frequency',
            field=models.CharField(
                choices=[
                    ('monthly', 'Every month'),
                    ('quarterly', 'Every 3 months'),
                    ('semiannual', 'Every 6 months'),
                    ('manual', 'Manual (HR sends it)'),
                ],
                default='quarterly',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='organization',
            name='survey_opened_on',
            field=models.DateField(blank=True, null=True),
        ),
    ]
