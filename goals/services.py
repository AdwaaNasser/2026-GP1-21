"""KPI calculations on top of the database."""
from django.db import transaction
from django.utils import timezone

from accounts.models import Employee, Goal

from . import rules


def team_of(manager_user):
    """A manager's team: the employees whose manager is this manager."""
    return Employee.objects.filter(manager_id=manager_user.pk).select_related('user')


def goals_for(employee_id, year):
    goals = list(
        Goal.objects.filter(employee_id=employee_id, evaluation_year=year)
        .prefetch_related('task_records__task')
    )
    return sorted(goals, key=lambda goal: (goal.period_start, goal.pk))


def goals_of(employee, year):
    return goals_for(employee.pk, year)


def _linked_tasks(goal):
    return [record.task for record in goal.task_records.all()]


def is_frozen_goal(goal, today):
    """A goal of a finished year is frozen once its rating has been saved."""
    return (
        goal.rating is not None
        and goal.evaluation_year is not None
        and rules.year_ended(goal.evaluation_year, today)
    )


def goal_result(goal, today):
    """Progress, rating and flags of one goal. A frozen goal shows what was
    saved when its year ended (rating and, for Task-based goals, the count)
    instead of a recalculated value."""
    frozen = is_frozen_goal(goal, today)
    if goal.type == rules.TASK_BASED:
        if frozen and goal.actual_value is not None:
            done = goal.actual_value
        else:
            done = rules.count_done_tasks(_linked_tasks(goal), goal.period_start, goal.period_end)
        percent = rules.progress_percent(goal.target_value, done)
        achieved = done
        no_value = False
    else:
        achieved = goal.actual_value
        no_value = goal.actual_value is None
        percent = rules.progress_percent(goal.target_value, achieved)
    shown_percent = percent if percent is not None else rules.progress_percent(goal.target_value, 0)
    rating = goal.rating if frozen else rules.rating_for(shown_percent)
    return {
        'achieved': achieved,
        'progress': shown_percent,
        'rating': int(rating),
        'no_value': no_value,
        'overdue': goal.period_end < today and shown_percent < 100,
    }


def goal_data(goal, today):
    result = goal_result(goal, today)
    return {
        'id': goal.pk,
        'name': goal.name,
        'description': goal.description,
        'type': goal.type,
        'period': goal.time_period,
        'period_start': goal.period_start,
        'period_end': goal.period_end,
        'target': float(goal.target_value),
        'achieved': None if result['achieved'] is None else float(result['achieved']),
        'weight': float(goal.weight),
        'progress': float(result['progress']),
        'rating': result['rating'],
        'no_value': result['no_value'],
        'overdue': result['overdue'],
        'task_ids': [r.task_id for r in goal.task_records.all()],
    }


def approval_status(goals, ended):
    """open (year not over or no goals), pending (over, not approved) or approved."""
    if not goals or not ended:
        return 'open'
    return 'approved' if all(g.approved_at is not None for g in goals) else 'pending'


def performance(employee, year, today=None, for_employee=False):
    """Everything the employee view needs for one evaluation year.

    The overall score is never stored: it is always calculated from the
    goal ratings. Once the year has ended the first view saves each goal's
    rating (and the task count of Task-based goals), so later task changes
    cannot alter the result.

    When the year has ended the manager still has to approve the evaluation.
    Until then (status "pending") the employee does not see the ratings or the
    score (for_employee=True); the manager always sees them.
    """
    today = today or timezone.localdate()
    goals = list(goals_of(employee, year))
    ended = rules.year_ended(year, today)
    if ended and any(goal.rating is None for goal in goals):
        _freeze(goals, today)

    rows = [goal_data(g, today) for g in goals]
    score = rules.overall_score([(r['rating'], r['weight']) for r in rows])
    _store_overall_score(goals, score)
    status = approval_status(goals, ended)
    approved = [g.approved_at for g in goals if g.approved_at is not None]
    data = {
        'year': year,
        'goals': rows,
        'overall_score': None if score is None else float(score),
        'is_final': bool(goals) and all(is_frozen_goal(g, today) for g in goals),
        'status': status,
        'approved_at': max(approved) if status == 'approved' else None,
    }
    if for_employee and status == 'pending':
        data['overall_score'] = None
        for row in rows:
            row['rating'] = None
    return data


class ApprovalError(Exception):
    """The evaluation cannot be approved (the message says why)."""


@transaction.atomic
def approve(employee, year, manager_user, today=None):
    """The manager approves the evaluation of one employee for a finished year."""
    today = today or timezone.localdate()
    if not rules.year_ended(year, today):
        raise ApprovalError('The evaluation year has not ended yet.')
    goals = list(goals_of(employee, year))
    if not goals:
        raise ApprovalError('This employee had no goals in that year.')
    if approval_status(goals, True) == 'approved':
        raise ApprovalError('This evaluation is already approved.')
    if any(goal.rating is None for goal in goals):
        _freeze(goals, today)
    Goal.objects.filter(pk__in=[g.pk for g in goals]).update(
        approved_at=timezone.now(), approved_by_id=manager_user.pk,
    )


def _store_overall_score(goals, score):
    """Keep the derived overall score on the goals (only writes when it changed)."""
    stale = [g.pk for g in goals if g.overall_score != score]
    if stale:
        Goal.objects.filter(pk__in=stale).update(overall_score=score)
        for goal in goals:
            goal.overall_score = score


def refresh_overall_score(employee_id, year, today=None):
    """Recalculate and store the overall score after a goal or a task changed."""
    today = today or timezone.localdate()
    goals = goals_for(employee_id, year)
    rows = [goal_data(g, today) for g in goals]
    _store_overall_score(goals, rules.overall_score([(r['rating'], r['weight']) for r in rows]))


@transaction.atomic
def _freeze(goals, today):
    for goal in goals:
        if goal.rating is not None:
            continue
        row = goal_result(goal, today)
        goal.rating = row['rating']
        fields = ['rating']
        if goal.type == rules.TASK_BASED:
            goal.actual_value = row['achieved']
            fields.append('actual_value')
        goal.save(update_fields=fields)


def is_frozen(year, today=None):
    """Goals of a year that has ended can no longer change."""
    return rules.year_ended(year, today or timezone.localdate())
