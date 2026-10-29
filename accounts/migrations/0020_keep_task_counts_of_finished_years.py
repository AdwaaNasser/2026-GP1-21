from django.db import migrations

DONE = 'completed'


def keep_task_counts(apps, schema_editor):
    """Before the evaluation table goes away, make sure every Task-based goal of
    a finished year keeps the number of tasks it counted (in actual_value), so
    the final result no longer depends on the evaluation table."""
    Goal = apps.get_model('accounts', 'Goal')
    Evaluation = apps.get_model('accounts', 'Evaluation')
    TaskGoal = apps.get_model('accounts', 'TaskGoal')

    final_years = {
        (row['employee_id'], row['evaluation_year'])
        for row in Evaluation.objects.filter(is_final=True).values('employee_id', 'evaluation_year')
    }
    goals = Goal.objects.filter(type='Task-based', actual_value__isnull=True)
    for goal in goals:
        if (goal.employee_id, goal.evaluation_year) not in final_years:
            continue
        counted = TaskGoal.objects.filter(
            goal_id=goal.pk,
            task__status=DONE,
            task__due_date__gte=goal.period_start,
            task__due_date__lte=goal.period_end,
        ).count()
        goal.actual_value = counted
        goal.save(update_fields=['actual_value'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_finalize_employee_hire_date_and_roles'),
    ]

    operations = [
        migrations.RunPython(keep_task_counts, migrations.RunPython.noop),
    ]
