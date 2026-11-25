"""Saving the BAT survey (table burnoutsurvey) and the one-survey-per-period rule.

Writes ONE row per submitted survey into the existing table burnoutsurvey
(no schema change). The row holds the four dimension scores, the overall score,
the submission date and the 10 answers used by the burnout prediction model
(model_inputs.py). The 12 raw BAT answers are not stored (the table has no
columns for them).
"""
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import BurnoutSurvey, Employee

from . import bat

# Length of one survey period, in calendar months: 1 = monthly, 3 = quarterly.
PERIOD_MONTHS = 1


class AlreadySubmitted(Exception):
    """The employee already submitted the survey in the current period."""


def period_start(day, months=PERIOD_MONTHS):
    """First day of the period that contains `day`."""
    index = day.year * 12 + day.month - 1
    index -= index % months
    return date(index // 12, index % 12 + 1, 1)


def next_period_start(day, months=PERIOD_MONTHS):
    index = period_start(day, months).year * 12 + period_start(day, months).month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def submission_in_period(employee, today):
    """The employee's survey row in the current period, or None. Read only."""
    return (
        BurnoutSurvey.objects
        .filter(employee_id=employee.pk, submission_date__gte=period_start(today))
        .order_by('-submission_date', '-survey_id')
        .first()
    )


def _status(row, today):
    if row is None:
        return {'status': 'available', 'submitted_on': None, 'next_available': None}
    return {
        'status': 'submitted',
        'submitted_on': row.submission_date.isoformat(),
        'next_available': next_period_start(today).isoformat(),
    }


def status_for(employee, today=None):
    today = today or timezone.localdate()
    return _status(submission_in_period(employee, today), today)


def submit(employee, answers, model_answers, today=None):
    """Score the BAT answers, add the model answers and save one row.

    `model_answers` is the cleaned dict from model_inputs.validate (all 10
    questions). Raises AlreadySubmitted / ValueError."""
    today = today or timezone.localdate()
    result = bat.score_answers(answers)          # ValueError if the answers are invalid
    scores = {name: Decimal(str(value)) for name, value in result['scores'].items()}

    with transaction.atomic():
        # Lock the employee row so a double click cannot save two surveys.
        Employee.objects.select_for_update().get(pk=employee.pk)
        if submission_in_period(employee, today) is not None:
            raise AlreadySubmitted()
        row = BurnoutSurvey.objects.create(
            employee_id=employee.pk,
            submission_date=today,
            exhaustion_score=scores['exhaustion'],
            mental_distance_score=scores['mental_distance'],
            cognitive_impairment_score=scores['cognitive_impairment'],
            emotional_impairment_score=scores['emotional_impairment'],
            overall_score=scores['total'],
            **model_answers,
        )
    return _status(row, today)


def bat_history(employee, limit=12):
    """The BAT result of the employee's latest surveys, newest first. Read only.
    Only a manager of the employee's team may see this (checked by the view)."""
    rows = (
        BurnoutSurvey.objects.filter(employee_id=employee.pk)
        .order_by('-submission_date', '-survey_id')[:limit]
    )
    return [
        {
            'date': row.submission_date.isoformat() if row.submission_date else None,
            'score': float(row.overall_score) if row.overall_score is not None else None,
            'zone': bat.zone('total', row.overall_score) if row.overall_score is not None else None,
        }
        for row in rows
    ]
