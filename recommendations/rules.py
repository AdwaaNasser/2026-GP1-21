"""Recommendation rules as plain functions (no database), so they are easy to test.

Filtering: mandatory conditions. An employee who fails one is excluded, with a reason.
Ranking:   a weighted score for the employees who passed, with reasons for the manager.
"""
from datetime import timedelta

HOURS_PER_DAY = 8
WEEKEND_DAYS = {4, 5}  # Friday, Saturday (Python counts Monday as 0)

# skill_level text -> number. Must match the values stored in employee_skills.
SKILL_LEVELS = {'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4}
MAX_LEVEL = 4
MAX_PAST_TASKS = 5  # this many similar finished tasks = full experience score

W_SKILL = 0.4
W_EXPERIENCE = 0.3
W_WORKLOAD = 0.3


def level_value(text):
    """'Advanced' -> 3. Empty or unknown counts as the lowest level."""
    return SKILL_LEVELS.get((text or '').strip().lower(), 1)


def working_days(start, end):
    """Working days from start to end, both included."""
    days = 0
    day = start
    while day <= end:
        if day.weekday() not in WEEKEND_DAYS:
            days += 1
        day += timedelta(days=1)
    return days


def capacity_hours(start, end):
    return working_days(start, end) * HOURS_PER_DAY


def skill_gaps(has, required):
    """has = {skill_id: level number}, required = [(skill_id, name, level number)].
    Returns the problems, e.g. ['missing SQL', 'Python level too low']."""
    gaps = []
    for skill_id, name, needed in required:
        if skill_id not in has:
            gaps.append(f'missing {name}')
        elif has[skill_id] < needed:
            gaps.append(f'{name} level too low')
    return gaps


def exclusion_reason(on_leave, gaps, available, needed_hours):
    """Why an employee is excluded, or None if they are eligible."""
    if on_leave:
        return 'On approved leave during the task period'
    if gaps:
        return 'Skills: ' + ', '.join(gaps)
    if available < needed_hours:
                return f'Not enough time ({max(available, 0):g}h available, {needed_hours:g}h needed)'
    return None


def score(has, required, past_tasks, busy_hours, capacity):
    """Score between 0 and 1 for an eligible employee, with the reasons behind it."""
    if required:
        skill = sum(has[s] for s, _, _ in required) / (len(required) * MAX_LEVEL)
    else:
        skill = 1.0
    experience = min(past_tasks, MAX_PAST_TASKS) / MAX_PAST_TASKS
    workload = busy_hours / capacity if capacity else 1.0
    total = W_SKILL * skill + W_EXPERIENCE * experience + W_WORKLOAD * (1 - workload)

    reasons = []
    if required:
        reasons.append('Has all required skills: ' + ', '.join(n for _, n, _ in required))
    reasons.append(f'{past_tasks} finished task(s) using these skills')
    reasons.append(f'Workload {workload:.0%}, {capacity - busy_hours:g}h available')
    return round(total, 2), reasons