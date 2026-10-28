"""Gets the data from the database and hands it to the rules."""
from datetime import datetime, timedelta

from django.db.models import Count, Q, Sum

from accounts.models import (
    EmployeeSkill, LeaveRequest, MeetingSchedule, Skill, Task, TaskSkill,
)
from goals.services import team_of

from . import rules, semantic

DONE_STATUS = 'completed'      # Task.status of a finished task
APPROVED_LEAVE = 'approved'    # LeaveRequest.status of an approved leave
HISTORY_TASKS = 20             # how many recent finished tasks describe someone's past work


def work_histories(employee_ids):
    """{employee_id: titles and descriptions of their recent finished tasks}."""
    texts = {}
    tasks = (
        Task.objects.filter(employee_id__in=employee_ids, status=DONE_STATUS)
        .order_by('-due_date', '-pk')
        .values('employee_id', 'title', 'description')
    )
    for task in tasks:
        parts = texts.setdefault(task['employee_id'], [])
        if len(parts) < HISTORY_TASKS:
            parts.append(f"{task['title']}. {task['description'] or ''}".strip())
    return {emp_id: '\n'.join(parts) for emp_id, parts in texts.items()}


def overlaps(start_field, end_field, start, end):
    """Records whose period touches [start, end]. A missing date counts as open."""
    starts_before_end = Q(**{f'{start_field}__lte': end}) | Q(**{f'{start_field}__isnull': True})
    ends_after_start = Q(**{f'{end_field}__gte': start}) | Q(**{f'{end_field}__isnull': True})
    return starts_before_end & ends_after_start


def leave_days(employee_ids, start, end):
    """{employee_id: set of dates inside [start, end] covered by approved leave}."""
    days = {}
    leaves = (
        LeaveRequest.objects.filter(employee_id__in=employee_ids, status__iexact=APPROVED_LEAVE)
        .filter(overlaps('start_date', 'end_date', start, end))
        .values('employee_id', 'start_date', 'end_date')
    )
    for leave in leaves:
        day = max(leave['start_date'] or start, start)
        last = min(leave['end_date'] or end, end)
        while day <= last:
            days.setdefault(leave['employee_id'], set()).add(day)
            day += timedelta(days=1)
    return days


def meeting_hours(employee_ids, start, end, days_off=None):
    """Calculate meeting hours, excluding approved leave days."""
    hours = {}
    days_off = days_off or {}
    meetings = MeetingSchedule.objects.filter(
        employee_id__in=employee_ids,
        date__gte=start,
        date__lte=end,
        starts_at__isnull=False,
        ends_at__isnull=False,
    ).values(
        'employee_id', 'date', 'starts_at', 'ends_at'
    )
    for m in meetings:
        emp_id = m['employee_id']
        # Don't count meetings on approved leave days.
        if m['date'] in days_off.get(emp_id, set()):
            continue
        length = (
            datetime.combine(m['date'], m['ends_at'])
            - datetime.combine(m['date'], m['starts_at'])
        )
        duration = max(length.total_seconds() / 3600, 0)
        hours[emp_id] = hours.get(emp_id, 0) + duration
    return hours


def recommend(manager_user, skills, start, end, hours, task_text=''):
    """skills = [{'skill_id': 1, 'level': 'intermediate', 'required': True}, ...]
    task_text = title and description of the new task (for the meaning match).
    Returns (recommended, excluded), both lists of dicts ready for JSON."""
    team = list(team_of(manager_user))
    ids = [e.pk for e in team]

    # 1. Skills of every team member: {employee_id: {skill_id: level number}}
    has = {}
    for row in EmployeeSkill.objects.filter(employee_id__in=ids).values(
        'employee_id', 'skill_id', 'skill_level'
    ):
        has.setdefault(row['employee_id'], {})[row['skill_id']] = rules.level_value(row['skill_level'])

    # 2. Busy hours: unfinished tasks in the same period, plus meetings
    busy = dict(
        Task.objects.filter(employee_id__in=ids)
        .exclude(status=DONE_STATUS)
        .filter(overlaps('start_date', 'due_date', start, end))
        .values('employee_id')
        .annotate(hours=Sum('estimated_hours'))
        .values_list('employee_id', 'hours')
    )

    # 3. Approved leave days
    away = leave_days(ids, start, end)
    # 4. Meeting hours, excluding leave days
    meetings = meeting_hours(ids, start, end, away)

    # 5. Experience: finished tasks that used one of the listed skills
    skill_ids = [s['skill_id'] for s in skills]
    past = dict(
        TaskSkill.objects.filter(
            task__employee_id__in=ids, task__status=DONE_STATUS, skill_id__in=skill_ids,
        )
        .values('task__employee_id')
        .annotate(n=Count('task_id', distinct=True))
        .values_list('task__employee_id', 'n')
    )

    names = dict(Skill.objects.filter(pk__in=skill_ids).values_list('pk', 'name'))

    def described(s):
        return (s['skill_id'], names.get(s['skill_id'], f"skill {s['skill_id']}"), rules.level_value(s.get('level')))

    required = [described(s) for s in skills if s.get('required', True)]
    optional = [described(s) for s in skills if not s.get('required', True)]
    hours = float(hours)

    # 6. Filter: keep only the eligible members
    eligible, excluded = [], []
    for emp in team:
        person = {
            'employee_id': emp.pk,
            'first_name': emp.user.first_name or '',
            'last_name': emp.user.last_name or '',
        }
        days_off = away.get(emp.pk, set())
        capacity = rules.capacity_hours(start, end, days_off)
        emp_busy = float(busy.get(emp.pk) or 0) + meetings.get(emp.pk, 0)
        reason = rules.exclusion_reason(
            on_leave=bool(days_off) and capacity == 0,
            gaps=rules.skill_gaps(has.get(emp.pk, {}), required),
            available=capacity - emp_busy,
            needed_hours=hours,
        )
        if reason:
            excluded.append({**person, 'reason': reason})
        else:
            eligible.append((emp, person, emp_busy, capacity))

    # 7. Meaning match (Sentence Transformers), only for the eligible members
    meaning = semantic.similarities(task_text, work_histories([e[0].pk for e in eligible]))

    # 8. Score and rank
    most_past = max((past.get(e[0].pk, 0) for e in eligible), default=0)
    recommended = []
    for emp, person, emp_busy, capacity in eligible:
        score, reasons = rules.score(
            has.get(emp.pk, {}), required, optional, past.get(emp.pk, 0), most_past,
            emp_busy, capacity,
            # Same factors for everyone: no past work counts as 0% similar.
            meaning=meaning.get(emp.pk, 0.0) if meaning else None,
        )
        recommended.append({**person, 'score': score, 'reasons': reasons})
    recommended.sort(key=lambda r: r['score'], reverse=True)
    return recommended, excluded