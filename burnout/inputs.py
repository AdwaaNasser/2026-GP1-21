"""Builds the inputs of the burnout prediction model.

The model (burnout/ml) uses 14 inputs in Bayyinah:
  from the system (4):  gender, seniority_level, work_hours_per_week,
                        deadline_pressure_score
  from the well-being survey (10): the questions in model_inputs.py
The other 13 inputs of the model are not collected; the model fills them in
itself (see burnout_predictor.py), which lowers the accuracy a little
(R2 0.868 instead of 0.869 on the test set of the training data).

An input that cannot be built is left out and listed in `missing`.
"""
from datetime import timedelta
from decimal import Decimal

from accounts.models import Task
from recommendations import rules as work_rules

from . import model_inputs

FINISHED = 'completed'
SOON_DAYS = 3                       # a task due within these days counts as close to its deadline
MODEL_GENDERS = {'female': 'Female', 'male': 'Male'}
SYSTEM_INPUTS = ['gender', 'seniority_level', 'work_hours_per_week', 'deadline_pressure_score']


def gender_for_model(value):
    """'Female' and 'Male' as the model knows them; anything else or empty is
    'Prefer not to say' (the third value the model was trained with)."""
    return MODEL_GENDERS.get((value or '').strip().lower(), 'Prefer not to say')


def week_of(today):
    """Sunday to Saturday week that contains `today`."""
    start = today - timedelta(days=(today.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def weekly_hours(tasks, today):
    """Hours of work planned in the current week for the given open tasks.

    Each task's estimated hours are spread evenly over the working days between
    its start and due date; only the working days that fall in this week count.
    Tasks without estimated hours or dates are ignored. Returns None when no task
    gives any hours (the input is then missing)."""
    week_start, week_end = week_of(today)
    total = Decimal('0')
    counted = False
    for task in tasks:
        if task.estimated_hours is None or task.start_date is None or task.due_date is None:
            continue
        if task.due_date < task.start_date:
            continue
        all_days = work_rules.working_days(task.start_date, task.due_date)
        start, end = max(task.start_date, week_start), min(task.due_date, week_end)
        if all_days == 0 or start > end:
            continue
        counted = True
        total += Decimal(task.estimated_hours) * work_rules.working_days(start, end) / all_days
    return float(total) if counted else None


def deadline_pressure(tasks, today):
    """1 to 10 from the share of open tasks that are overdue or due within
    SOON_DAYS days: 1 = none of them, 10 = all of them. None when there is no
    open task with a due date (the input is then missing)."""
    dated = [t for t in tasks if t.due_date is not None]
    if not dated:
        return None
    close = sum(1 for t in dated if t.due_date <= today + timedelta(days=SOON_DAYS))
    return round(1 + 9 * close / len(dated), 1)


def system_inputs(employee, today):
    """The inputs that come from the system. Returns (values, missing)."""
    user = employee.user
    tasks = list(Task.objects.filter(employee_id=employee.pk).exclude(status=FINISHED))
    values = {'gender': gender_for_model(user.gender)}
    if user.seniority_level:
        values['seniority_level'] = user.seniority_level
    hours = weekly_hours(tasks, today)
    if hours is not None:
        values['work_hours_per_week'] = hours
    pressure = deadline_pressure(tasks, today)
    if pressure is not None:
        values['deadline_pressure_score'] = pressure
    return values, [name for name in SYSTEM_INPUTS if name not in values]


def survey_inputs(survey):
    """The answers of one survey row. Empty or missing columns are left out."""
    values = {}
    for key in model_inputs.KEYS:
        value = getattr(survey, key, None) if survey is not None else None
        if value is None:
            continue
        values[key] = float(value) if isinstance(value, Decimal) else (int(value) if isinstance(value, bool) else value)
    return values


def build(employee, survey, today):
    """All inputs for one employee. Returns (values, missing)."""
    values, missing = system_inputs(employee, today)
    answered = survey_inputs(survey)
    values.update(answered)
    missing += [key for key in model_inputs.KEYS if key not in answered]
    return values, missing
