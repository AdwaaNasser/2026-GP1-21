"""
Recommendation rules:

Filtering: mandatory conditions. An employee who fails one is excluded, with a reason.
Ranking: an average score for the employees who passed, with reasons for the manager.
"""
from datetime import timedelta

HOURS_PER_DAY = 8
WEEKEND_DAYS = {4, 5}  # Friday, Saturday 

# skill_level text -> number. Must match the values stored in employee_skills.
SKILL_LEVELS = {'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4}
MAX_LEVEL = 4


def level_value(text):
    """'Advanced' -> 3. Empty or unknown counts as the lowest level."""
    return SKILL_LEVELS.get((text or '').strip().lower(), 1)


def working_days(start, end, days_off=()):
    """Working days from start to end, both included, without weekends and days off."""
    days = 0
    day = start
    while day <= end:
        if day.weekday() not in WEEKEND_DAYS and day not in days_off:
            days += 1
        day += timedelta(days=1)
    return days


def capacity_hours(start, end, days_off=()):
    """Hours an employee can work in the period. days_off = their approved leave days."""
    return working_days(start, end, days_off) * HOURS_PER_DAY


def skill_gaps(has, required):
    """has = {skill_id: level number}, required = [(skill_id, name, level number)].
    Only required skills are checked here; optional skills never exclude anyone.
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
        return 'On approved leave for the whole task period'
    if gaps:
        return 'Skills: ' + ', '.join(gaps)
    if available < needed_hours:
        return f'Not enough time ({max(available, 0):g}h available, {needed_hours:g}h needed)'
    return None


def score(has, required, optional, past_tasks, most_past_tasks, busy_hours, capacity, meaning=None):
    """Score between 0 and 1 for an eligible employee, with the reasons behind it.

    Every factor is a number from 0 to 1, and the score is their average
    (all factors count the same):
      skill      = the employee's levels in the listed skills (required and optional)
                   / the highest level. A missing optional skill counts as 0.
      experience = their finished tasks with these skills / the most anyone in the team has
      free time  = 1 - (busy hours / their capacity hours)
                   busy = unfinished tasks + meetings, capacity = working days without leave
      meaning    = how similar their past work is to this task (Sentence Transformers),
                   only when there is text to compare
    """
    listed = required + optional
    if listed:
        skill = sum(has.get(s, 0) for s, _, _ in listed) / (len(listed) * MAX_LEVEL)
    else:
        skill = 1.0
    experience = past_tasks / most_past_tasks if most_past_tasks else 0.0
    workload = min(busy_hours / capacity, 1.0) if capacity else 1.0

    factors = [skill, experience, 1 - workload]
    if meaning is not None:
        factors.append(meaning)
    total = sum(factors) / len(factors)

    reasons = []
    if required:
        reasons.append('Has all required skills: ' + ', '.join(n for _, n, _ in required))
    if optional:
        has_optional = [n for s, n, needed in optional if has.get(s, 0) >= needed]
        reasons.append('Optional skills: ' + (', '.join(has_optional) if has_optional else 'none'))
    reasons.append(f'{past_tasks} finished task(s) using these skills')
    reasons.append(f'Workload {workload:.0%}, {max(capacity - busy_hours, 0):g}h available')
    if meaning is not None:
        reasons.append(f'Past work {meaning:.0%} similar to this task')
    return round(total, 2), reasons