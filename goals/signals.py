"""Keep Goal.overall_score up to date when a task or a task link changes."""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from accounts.models import Goal, Task, TaskGoal


def _refresh(goals):
    from . import services

    for employee_id, year in {(g.employee_id, g.evaluation_year) for g in goals}:
        if employee_id is not None and year is not None:
            services.refresh_overall_score(employee_id, year)


@receiver(post_save, sender=Task)
def task_saved(sender, instance, **kwargs):
    _refresh(Goal.objects.filter(task_records__task_id=instance.pk).distinct())


@receiver([post_save, post_delete], sender=TaskGoal)
def link_changed(sender, instance, **kwargs):
    goal = Goal.objects.filter(pk=instance.goal_id).first()
    if goal is not None:
        _refresh([goal])
