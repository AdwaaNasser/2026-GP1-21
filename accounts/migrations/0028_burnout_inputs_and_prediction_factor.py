import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Burnout model inputs + history of predictions.

    1. burnoutsurvey: 10 nullable columns for the questions asked to the burnout
       prediction model (stress, work-life balance, meetings, sleep, vacation,
       social support, manager support, exercise, autonomy, AI tools).
    2. predictionfactor: was keyed by factor_name alone and not linked to a
       prediction. It becomes a weak entity: primary key (predictionID, factorName)
       and a foreign key to burnoutprediction. The table was never written to, so
       it is dropped and created again.
    """

    dependencies = [
        ('accounts', '0027_user_seniority_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='burnoutsurvey',
            name='ai_tools_daily',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='autonomy_score',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='exercise_days_per_week',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='manager_support_score',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='meetings_per_day',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='sleep_hours_per_night',
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=3, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='social_support_score',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='stress_score',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='vacation_days_taken',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='burnoutsurvey',
            name='work_life_balance_score',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.DeleteModel(
            name='PredictionFactor',
        ),
        migrations.CreateModel(
            name='PredictionFactor',
            fields=[
                ('pk', models.CompositePrimaryKey('prediction', 'factor_name', blank=True, editable=False, primary_key=True, serialize=False)),
                ('factor_name', models.CharField(max_length=255)),
                ('contribution', models.DecimalField(decimal_places=2, max_digits=5)),
                ('prediction', models.ForeignKey(db_column='predictionID', on_delete=django.db.models.deletion.CASCADE, related_name='factors', to='accounts.burnoutprediction')),
            ],
            options={
                'db_table': 'predictionfactor',
            },
        ),
    ]
