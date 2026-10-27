"""Gets the data from the database and hands it to the rules."""
from django.db.models import Count, Q, Sum

from accounts.models import EmployeeSkill, LeaveRequest, Skill, Task, TaskSkill
from goals.services import team_of

from . import rules

DONE_STATUS = 'completed'      # Task.status of a finished task
APPROVED_LEAVE = 'approved'    # LeaveRequest.status of an approved leave


def overlaps(start_field, end_field, start, end):
    """Records whose period touches [start, end]. A missing date counts as open."""
    starts_before_end = Q(**{f'{start_field}__lte': end}) | Q(**{f'{start_field}__isnull': True})
    ends_after_start = Q(**{f'{end_field}__gte': start}) | Q(**{f'{end_field}__isnull': True})
    return starts_before_end & ends_after_start


def recommend(manager_user, required_skills, start, end, hours):
    """required_skills = [{'skill_id': 1, 'level': 'intermediate'}, ...]
    Returns (recommended, excluded), both lists of dicts ready for JSON."""
    team = list(team_of(manager_user))
    ids = [e.pk for e in team]

    # 1. Skills of every team member: {employee_id: {skill_id: level number}}
    has = {}
    for row in EmployeeSkill.objects.filter(employee_id__in=ids).values(
        'employee_id', 'skill_id', 'skill_level'
    ):
        has.setdefault(row['employee_id'], {})[row['skill_id']] = rules.level_value(row['skill_level'])

    # 2. Workload: hours of unfinished tasks in the same period
    busy = dict(
        Task.objects.filter(employee_id__in=ids)
        .exclude(status=DONE_STATUS)
        .filter(overlaps('start_date', 'due_date', start, end))
        .values('employee_id')
        .annotate(hours=Sum('estimated_hours'))
        .values_list('employee_id', 'hours')
    )

    # 3. Leave: approved leave in the same period
    on_leave = set(
        LeaveRequest.objects.filter(employee_id__in=ids, status__iexact=APPROVED_LEAVE)
        .filter(overlaps('start_date', 'end_date', start, end))
        .values_list('employee_id', flat=True)
    )

    # 4. Experience: finished tasks that used one of the required skills
    skill_ids = [s['skill_id'] for s in required_skills]
    past = dict(
        TaskSkill.objects.filter(
            task__employee_id__in=ids, task__status=DONE_STATUS, skill_id__in=skill_ids,
        )
        .values('task__employee_id')
        .annotate(n=Count('task_id', distinct=True))
        .values_list('task__employee_id', 'n')
    )

    names = dict(Skill.objects.filter(pk__in=skill_ids).values_list('pk', 'name'))
    required = [
        (s['skill_id'], names.get(s['skill_id'], f"skill {s['skill_id']}"), rules.level_value(s.get('level')))
        for s in required_skills
    ]
    capacity = rules.capacity_hours(start, end)
    hours = float(hours)

    # 5. Filter, then score
    recommended, excluded = [], []
    for emp in team:
        person = {
            'employee_id': emp.pk,
            'first_name': emp.user.first_name or '',
            'last_name': emp.user.last_name or '',
        }
        emp_has = has.get(emp.pk, {})
        emp_busy = float(busy.get(emp.pk) or 0)

        reason = rules.exclusion_reason(
            on_leave=emp.pk in on_leave,
            gaps=rules.skill_gaps(emp_has, required),
            available=capacity - emp_busy,
            needed_hours=hours,
        )
        if reason:
            excluded.append({**person, 'reason': reason})
            continue

        score, reasons = rules.score(emp_has, required, past.get(emp.pk, 0), emp_busy, capacity)
        recommended.append({**person, 'score': score, 'reasons': reasons})

    recommended.sort(key=lambda r: r['score'], reverse=True)
    return recommended, excluded
