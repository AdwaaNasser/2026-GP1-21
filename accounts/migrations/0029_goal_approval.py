import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0028_burnout_inputs_and_prediction_factor'),
    ]

    operations = [
        migrations.AddField(
            model_name='goal',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='goal',
            name='approved_by',
            field=models.ForeignKey(
                blank=True,
                db_column='approved_by_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approved_goals',
                to='accounts.manager',
            ),
        ),
    ]
