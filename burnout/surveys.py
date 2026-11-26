"""Saving the BAT survey (table burnoutsurvey) and the one-survey-per-period rule.

How often the survey opens is set by HR per organization (see current_window).

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

# HR chooses how often the survey opens (Organization.survey_frequency).
# Length of one period in calendar months; 'manual' has no fixed length: the
# survey is open from the day HR sends it (Organization.survey_opened_on).
FREQUENCY_MONTHS = {'monthly': 1, 'quarterly': 3, 'semiannual': 6}
DEFAULT_FREQUENCY = 'quarterly'
PERIOD_MONTHS = FREQUENCY_MONTHS[DEFAULT_FREQUENCY]


class AlreadySubmitted(Exception):
    """The employee already submitted the survey in the current period."""


class SurveyClosed(Exception):
    """Manual mode and HR has not sent a survey yet."""


def period_start(day, months=PERIOD_MONTHS):
    """First day of the period that contains `day`."""
    index = day.year * 12 + day.month - 1
    index -= index % months
    return date(index // 12, index % 12 + 1, 1)


def next_period_start(day, months=PERIOD_MONTHS):
    index = period_start(day, months).year * 12 + period_start(day, months).month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def current_window(employee, today):
    """The period the employee's organization is in now, as
    {'since': first day of the period, 'next': first day of the next one}.
    Manual mode: 'since' is the day HR sent the survey and 'next' is None.
    Returns None when the mode is manual and nothing was sent yet. Read only."""
    org = employee.user.org
    frequency = org.survey_frequency or DEFAULT_FREQUENCY
    if frequency == 'manual':
        if org.survey_opened_on is None:
            return None
        return {'since': org.survey_opened_on, 'next': None}
    months = FREQUENCY_MONTHS.get(frequency, PERIOD_MONTHS)
    return {'since': period_start(today, months), 'next': next_period_start(today, months)}


def submission_in_period(employee, today, window=None):
    """The employee's survey row in the current period, or None. Read only."""
    window = window or current_window(employee, today)
    if window is None:
        return None
    return (
        BurnoutSurvey.objects
        .filter(employee_id=employee.pk, submission_date__gte=window['since'])
        .order_by('-submission_date', '-survey_id')
        .first()
    )


def _status(row, window):
    if window is None:
        return {'status': 'closed', 'submitted_on': None, 'next_available': None}
    if row is None:
        return {'status': 'available', 'submitted_on': None, 'next_available': None}
    return {
        'status': 'submitted',
        'submitted_on': row.submission_date.isoformat(),
        'next_available': window['next'].isoformat() if window['next'] else None,
    }


def status_for(employee, today=None):
    today = today or timezone.localdate()
    window = current_window(employee, today)
    return _status(submission_in_period(employee, today, window), window)


def submit(employee, answers, model_answers, today=None):
    """Score the BAT answers, add the model answers and save one row.

    `model_answers` is the cleaned dict from model_inputs.validate (all 10
    questions). Raises AlreadySubmitted / SurveyClosed / ValueError."""
    today = today or timezone.localdate()
    result = bat.score_answers(answers)          # ValueError if the answers are invalid
    window = current_window(employee, today)
    if window is None:
        raise SurveyClosed()
    scores = {name: Decimal(str(value)) for name, value in result['scores'].items()}

    with transaction.atomic():
        # Lock the employee row so a double click cannot save two surveys.
        Employee.objects.select_for_update().get(pk=employee.pk)
        if submission_in_period(employee, today, window) is not None:
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
    return _status(row, window)


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
