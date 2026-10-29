from decimal import Decimal

from django.db import migrations

from goals import rules


def fill_overall_scores(apps, schema_editor):
    """Calculate the overall score of every existing goal with the same rules
    the application uses (frozen goals keep their saved rating)."""
    Goal = apps.get_model('accounts', 'Goal')
    TaskGoal = apps.get_model('accounts', 'TaskGoal')

    groups = {}
    for goal in Goal.objects.exclude(employee_id__isnull=True).exclude(evaluation_year__isnull=True):
        groups.setdefault((goal.employee_id, goal.evaluation_year), []).append(goal)

    for goals in groups.values():
        rated = []
        for goal in goals:
            if goal.rating is not None:
                rating = goal.rating
            else:
                if goal.type == rules.TASK_BASED:
                    achieved = Decimal(
                        TaskGoal.objects.filter(
                            goal_id=goal.pk,
                            task__status=rules.DONE_STATUS,
                            task__due_date__gte=goal.period_start,
                            task__due_date__lte=goal.period_end,
                        ).count()
                    )
                else:
                    achieved = goal.actual_value or Decimal('0')
                if not goal.target_value:
                    rating = 1
                else:
                    rating = rules.rating_for(rules.progress_percent(goal.target_value, achieved))
            rated.append((rating, goal.weight))
        score = rules.overall_score(rated)
        Goal.objects.filter(pk__in=[g.pk for g in goals]).update(overall_score=score)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0022_goal_overall_score'),
    ]

    operations = [
        migrations.RunPython(fill_overall_scores, migrations.RunPython.noop),
    ]
