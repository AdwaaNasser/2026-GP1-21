from django.db import migrations


class Migration(migrations.Migration):
    """The start and end dates of a goal are derived from its period and year
    (properties on the model), so they are no longer stored."""

    dependencies = [
        ('accounts', '0023_fill_goal_overall_score'),
    ]

    operations = [
        migrations.RemoveField(model_name='goal', name='period_start'),
        migrations.RemoveField(model_name='goal', name='period_end'),
    ]
