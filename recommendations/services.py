"""Gets the data from the database and hands it to the rules."""

from datetime import datetime, timedelta

from django.db.models import Count, Q

from accounts.models import (
    Employee,
    EmployeeSkill,
    LeaveRequest,
    MeetingSchedule,
    Skill,
    Task,
    TaskSkill,
)

from . import rules, semantic


DONE_STATUS = 'completed'
APPROVED_LEAVE = 'approved'
HISTORY_TASKS = 20
TOP_N = 5  # the manager sees the best 5 eligible employees


def team_of(manager_user):
    """The manager's team = the same people the task form lists under Assignee:
    employees in the manager's organization who report to this manager.
    Everything comes from the database, so people added through the website
    appear here too."""
    return list(
        Employee.objects.filter(
            user__org_id=manager_user.org_id,
            manager_id=manager_user.pk,
            system_role='Employee',
        ).select_related('user')
    )


def catalogue_skills():
    """The controlled skills catalogue: one shared list (imported from ESCO;
    new skills are added only with `manage.py add_skill`). Employees and managers only choose from it, so
    the skill an employee has and the skill a task needs are the same record.
    It holds no company data; each company's employees and tasks stay separate."""
    return Skill.objects.all()


def work_histories(employee_ids):
    """Get recent completed-task descriptions for each employee."""
    texts = {}

    tasks = (
        Task.objects.filter(
            employee_id__in=employee_ids,
            status=DONE_STATUS,
        )
        .order_by('-due_date', '-pk')
        .values('employee_id', 'title', 'description')
    )

    for task in tasks:
        parts = texts.setdefault(task['employee_id'], [])

        if len(parts) < HISTORY_TASKS:
            parts.append(
                f"{task['title']}. {task['description'] or ''}".strip()
            )

    return {
        emp_id: '\n'.join(parts)
        for emp_id, parts in texts.items()
    }


def overlaps(start_field, end_field, start, end):
    """Find records whose dates overlap the requested period."""
    starts_before_end = (
        Q(**{f'{start_field}__lte': end})
        | Q(**{f'{start_field}__isnull': True})
    )

    ends_after_start = (
        Q(**{f'{end_field}__gte': start})
        | Q(**{f'{end_field}__isnull': True})
    )

    return starts_before_end & ends_after_start


def task_hours_in_period(
    task_start,
    task_end,
    estimated_hours,
    start,
    end,
):
    """
    Estimate how many hours of an existing task fall
    within the requested period.

    Assumption:
    Task hours are distributed evenly across working days.

    Overdue tasks (due before the period starts and still not finished)
    count with their full estimated hours: the work is still owed and
    has to be done in the new period.

    A task without estimated hours counts as 0 here; recommend() reports
    it to the manager so the workload is not shown as certain.
    """
    if estimated_hours is None:
        return 0.0

    hours = float(estimated_hours)

    # Without complete dates, count the full task effort.
    if task_start is None or task_end is None:
        return hours

    # Invalid or non-working task period:
    # conservatively count the full effort.
    if task_start > task_end:
        return hours

    # Overdue and unfinished: all of it is still to do.
    if task_end < start:
        return hours

    total_days = rules.working_days(task_start, task_end)

    if total_days == 0:
        return hours

    overlap_start = max(task_start, start)
    overlap_end = min(task_end, end)

    if overlap_start > overlap_end:
        return 0.0

    overlap_days = rules.working_days(
        overlap_start,
        overlap_end,
    )

    return hours * overlap_days / total_days


def leave_days(employee_ids, start, end):
    """Get approved leave dates for each employee."""
    days = {}

    leaves = (
        LeaveRequest.objects.filter(
            employee_id__in=employee_ids,
            status__iexact=APPROVED_LEAVE,
        )
        .filter(overlaps('start_date', 'end_date', start, end))
        .values('employee_id', 'start_date', 'end_date')
    )

    for leave in leaves:
        day = max(leave['start_date'] or start, start)
        last = min(leave['end_date'] or end, end)

        while day <= last:
            days.setdefault(
                leave['employee_id'],
                set(),
            ).add(day)

            day += timedelta(days=1)

    return days


def merged_length(intervals):
    """Total hours covered by (start, end) datetime pairs, counting
    overlapping time once (the union of the intervals)."""
    total = 0.0
    current_start = current_end = None
    for begin, finish in sorted(intervals):
        if current_end is None or begin > current_end:
            if current_end is not None:
                total += (current_end - current_start).total_seconds() / 3600
            current_start, current_end = begin, finish
        elif finish > current_end:
            current_end = finish
    if current_end is not None:
        total += (current_end - current_start).total_seconds() / 3600
    return total


def meeting_hours(employee_ids, start, end, days_off=None):
    """Calculate meeting hours in working time.
    Skips approved leave days and weekends (not working time), and counts
    overlapping meetings on the same day once."""
    hours = {}
    days_off = days_off or {}
    per_day = {}

    meetings = (
        MeetingSchedule.objects.filter(
            employee_id__in=employee_ids,
            date__gte=start,
            date__lte=end,
            starts_at__isnull=False,
            ends_at__isnull=False,
        )
        .values(
            'employee_id',
            'date',
            'starts_at',
            'ends_at',
        )
    )

    for meeting in meetings:
        emp_id = meeting['employee_id']

        if meeting['date'] in days_off.get(emp_id, set()):
            continue

        if meeting['date'].weekday() in rules.WEEKEND_DAYS:
            continue

        begin = datetime.combine(meeting['date'], meeting['starts_at'])
        finish = datetime.combine(meeting['date'], meeting['ends_at'])

        if finish <= begin:
            continue

        per_day.setdefault((emp_id, meeting['date']), []).append((begin, finish))

    for (emp_id, _), intervals in per_day.items():
        hours[emp_id] = hours.get(emp_id, 0) + merged_length(intervals)

    return hours


def recommend(
    manager_user,
    skills,
    start,
    end,
    task_text='',
    new_task_hours=None,
):
    """
    Recommend eligible employees from the manager's team.
    new_task_hours = hours the new task needs (the API always sends it);
    when given, employees whose free hours do not cover it are excluded,
    and each recommended person gets a reason saying their free time covers it.

    Filtering:
    - Required skills
    - Approved leave for the whole period (no working hours left)
    - Free hours: excluded when no free hours are left, or when they
      are fewer than new_task_hours

    Ranking:
    - Skills
    - Relevant completed tasks
    - Workload
    - Semantic similarity, when available

    Returns:
        (recommended, excluded)
    """

    team = team_of(manager_user)
    ids = [employee.pk for employee in team]

    # 1. Employee skills
    has = {}

    employee_skills = (
        EmployeeSkill.objects.filter(
            employee_id__in=ids,
        )
        .values(
            'employee_id',
            'skill_id',
            'skill_level',
        )
    )

    for row in employee_skills:
        has.setdefault(
            row['employee_id'],
            {},
        )[row['skill_id']] = rules.level_value(
            row['skill_level']
        )

    # 2. Existing workload
    #
    # Count only the estimated portion of each unfinished
    # task that overlaps the requested period. Unfinished tasks
    # that are already overdue count in full.
    busy = {}
    no_estimate = {}  # unfinished tasks without estimated hours

    existing_tasks = (
        Task.objects.filter(
            employee_id__in=ids,
        )
        .exclude(status=DONE_STATUS)
        .filter(
            overlaps(
                'start_date',
                'due_date',
                start,
                end,
            )
            | Q(due_date__lt=start)
        )
        .values(
            'employee_id',
            'start_date',
            'due_date',
            'estimated_hours',
        )
    )

    for task in existing_tasks:
        task_hours = task_hours_in_period(
            task_start=task['start_date'],
            task_end=task['due_date'],
            estimated_hours=task['estimated_hours'],
            start=start,
            end=end,
        )

        emp_id = task['employee_id']

        if task['estimated_hours'] is None:
            no_estimate[emp_id] = no_estimate.get(emp_id, 0) + 1

        busy[emp_id] = (
            busy.get(emp_id, 0)
            + task_hours
        )

    # 3. Approved leave
    away = leave_days(ids, start, end)

    # 4. Meetings
    meetings = meeting_hours(
        ids,
        start,
        end,
        away,
    )

    # 5. Relevant experience
    skill_ids = [
        skill['skill_id']
        for skill in skills
    ]

    past = dict(
        TaskSkill.objects.filter(
            task__employee_id__in=ids,
            task__status=DONE_STATUS,
            skill_id__in=skill_ids,
        )
        .values('task__employee_id')
        .annotate(
            n=Count('task_id', distinct=True)
        )
        .values_list(
            'task__employee_id',
            'n',
        )
    )

    names = dict(
        Skill.objects.filter(
            pk__in=skill_ids,
        )
        .values_list('pk', 'name')
    )

    def described(skill):
        skill_id = skill['skill_id']

        return (
            skill_id,
            names.get(
                skill_id,
                f"skill {skill_id}",
            ),
            rules.level_value(
                skill.get('level')
            ),
        )

    required = [
        described(skill)
        for skill in skills
        if skill.get('required', True)
    ]

    optional = [
        described(skill)
        for skill in skills
        if not skill.get('required', True)
    ]

    # 6. Filter employees
    eligible = []
    excluded = []

    for emp in team:
        person = {
            'employee_id': emp.pk,
            'first_name': emp.user.first_name or '',
            'last_name': emp.user.last_name or '',
        }

        days_off = away.get(
            emp.pk,
            set(),
        )

        capacity = rules.capacity_hours(
            start,
            end,
            days_off,
        )

        emp_busy = (
            float(busy.get(emp.pk) or 0)
            + meetings.get(emp.pk, 0)
        )

        reason = rules.exclusion_reason(
            on_leave=bool(days_off),
            gaps=rules.skill_gaps(
                has.get(emp.pk, {}),
                required,
            ),
            capacity=capacity,
            busy_hours=emp_busy,
            task_hours=new_task_hours,
        )

        if reason:
            excluded.append({
                **person,
                'reason': reason,
            })
        else:
            eligible.append((
                emp,
                person,
                emp_busy,
                capacity,
            ))

    # 7. Semantic similarity
    meaning = semantic.similarities(
        task_text,
        work_histories([
            item[0].pk
            for item in eligible
        ]),
    )

    # 8. Score and rank eligible employees
    most_past = max(
        (
            past.get(item[0].pk, 0)
            for item in eligible
        ),
        default=0,
    )

    recommended = []

    for emp, person, emp_busy, capacity in eligible:
        score, reasons = rules.score(
            has.get(emp.pk, {}),
            required,
            optional,
            past.get(emp.pk, 0),
            most_past,
            emp_busy,
            capacity,
            # No past work means "unknown", not "unrelated":
            # the factor is left out for this employee instead of counting as 0.
            meaning=meaning.get(emp.pk),
        )
        if new_task_hours is not None:
            reasons.append(rules.task_hours_reason(new_task_hours, capacity - emp_busy))
        unknown = no_estimate.get(emp.pk, 0)
        if unknown:
            reasons.append(
                f'{unknown} open task(s) without estimated hours, so the real workload may be higher'
            )

        recommended.append({
            **person,
            'score': score,
            'reasons': reasons,
        })

    recommended.sort(
        key=lambda item: item['score'],
        reverse=True,
    )

    return recommended[:TOP_N], excluded