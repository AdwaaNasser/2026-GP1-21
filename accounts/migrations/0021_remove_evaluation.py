from django.db import migrations


class Migration(migrations.Migration):
    """The overall score is derived from the goal ratings, so the evaluation
    table is no longer needed. Frozen results live on the goals themselves."""

    dependencies = [
        ('accounts', '0020_keep_task_counts_of_finished_years'),
    ]

    operations = [
        migrations.DeleteModel(name='Evaluation'),
    ]
