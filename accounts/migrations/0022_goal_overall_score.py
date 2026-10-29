from django.db import migrations, models


class Migration(migrations.Migration):
    """Goal.overall_score: a derived value (the employee's overall score for the
    year) that is stored and refreshed whenever a goal or a linked task changes."""

    dependencies = [
        ('accounts', '0021_remove_evaluation'),
    ]

    operations = [
        migrations.AddField(
            model_name='goal',
            name='overall_score',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
    ]
