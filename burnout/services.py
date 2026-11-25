"""Burnout prediction service.

predict() is the ONLY function the views call to read a prediction. The model
runs once per survey, when the employee submits the monthly survey
(run_prediction); the result is saved in burnoutprediction and its main factors
in predictionfactor, so predict() only reads the latest saved prediction and the
history of an employee can be shown.

Response shape (agreed with the team):
    status          'ok' | 'insufficient_data'
    score           0-10, or None
    level           'Low' | 'Moderate' | 'High' | 'Severe', or None
    top_factors     [{'name', 'direction': 'increases'|'decreases', 'contribution'}]
    missing_inputs  names of the inputs we could not build
    predicted_at    'YYYY-MM-DD'
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import BurnoutPrediction, BurnoutSurvey, Employee, PredictionFactor
from goals.services import team_of

from . import bat, combined, inputs

logger = logging.getLogger(__name__)

LEVELS = ('Low', 'Moderate', 'High', 'Severe')
MAIN_FACTORS = 3
HISTORY_LIMIT = 12

# model input name -> name shown to the manager
FACTOR_LABELS = {
    'age': 'Age',
    'gender': 'Gender',
    'country': 'Country',
    'job_role': 'Job role',
    'seniority_level': 'Seniority level',
    'years_experience': 'Years of experience',
    'years_at_company': 'Years at the company',
    'company_size': 'Company size',
    'industry': 'Industry',
    'work_mode': 'Work mode',
    'salary_usd': 'Salary',
    'team_size': 'Team size',
    'therapy_access': 'Therapy access',
    'uses_therapy': 'Uses therapy',
    'work_hours_per_week': 'Weekly work hours',
    'deadline_pressure_score': 'Deadline pressure',
    'stress_score': 'Stress',
    'work_life_balance_score': 'Work interfering with personal life',
    'meetings_per_day': 'Meetings per day',
    'sleep_hours_per_night': 'Sleep hours',
    'vacation_days_taken': 'Vacation days taken',
    'social_support_score': 'Support from colleagues',
    'manager_support_score': 'Support from manager',
    'exercise_days_per_week': 'Exercise days per week',
    'autonomy_score': 'Control over own work',
    'ai_tools_daily': 'Uses AI tools',
}


def _today():
    return timezone.localdate().isoformat()


def insufficient(missing):
    return {
        'status': 'insufficient_data',
        'score': None,
        'level': None,
        'top_factors': [],
        'missing_inputs': list(missing),
        'predicted_at': _today(),
    }


def _factor(name, contribution):
    contribution = float(contribution)
    return {
        'name': FACTOR_LABELS.get(name, name),
        'direction': 'increases' if contribution > 0 else 'decreases',
        'contribution': round(abs(contribution), 2),
    }


def _latest_survey(employee):
    return (
        BurnoutSurvey.objects.filter(employee_id=employee.pk)
        .order_by('-submission_date', '-survey_id')
        .first()
    )


def run_prediction(employee, survey=None, today=None):
    """Run the model for one employee with the answers of the latest survey and
    save the prediction and its main factors. Returns the BurnoutPrediction, or
    None when stress_score is missing (without it the model is not reliable).

    Writes to burnoutprediction and predictionfactor (one prediction per survey)."""
    from .predictor import get_predictor

    today = today or timezone.localdate()
    survey = survey if survey is not None else _latest_survey(employee)
    values, _missing = inputs.build(employee, survey, today)
    if 'stress_score' not in values:
        return None

    result = get_predictor().predict(values, top_n=MAIN_FACTORS)
    with transaction.atomic():
        prediction = BurnoutPrediction.objects.create(
            employee_id=employee.pk,
            prediction_date=today,
            risk_score=Decimal(str(result['burnout_score'])),
            risk_level=result['burnout_level'],
        )
        PredictionFactor.objects.bulk_create([
            PredictionFactor(
                prediction=prediction,
                factor_name=factor['feature'],
                contribution=Decimal(str(factor['impact'])),   # signed: + raises the risk, - lowers it
            )
            for factor in result['top_factors']
        ])
    return prediction


def run_prediction_safely(employee, survey=None):
    """run_prediction, but a failure is logged and never breaks the survey that
    has already been saved."""
    try:
        return run_prediction(employee, survey)
    except Exception:
        logger.exception('Burnout prediction failed for employee %s', employee.pk)
        return None


def _latest_prediction(employee):
    return (
        BurnoutPrediction.objects.filter(employee_id=employee.pk)
        .order_by('-prediction_date', '-predicted_id')
        .first()
    )


def _as_dict(prediction, missing):
    factors = list(prediction.factors.all())
    factors.sort(key=lambda f: abs(f.contribution), reverse=True)
    return {
        'status': 'ok',
        'score': float(prediction.risk_score),
        'level': prediction.risk_level,
        'top_factors': [_factor(f.factor_name, f.contribution) for f in factors],
        'missing_inputs': list(missing),
        'predicted_at': prediction.prediction_date.isoformat(),
    }


def predict(employee):
    """The latest saved prediction of one Employee row (reads only).

    Employees who have not sent the monthly survey have none: the answer is then
    'insufficient_data'."""
    prediction = _latest_prediction(employee)
    if prediction is None:
        return insufficient(['monthly survey'])
    _values, system_missing = inputs.system_inputs(employee, timezone.localdate())
    return _as_dict(prediction, system_missing)


def assessment(employee, prediction):
    """The latest BAT result and the overall reading for a manager's list. Reads
    only. `prediction` is the dict returned by predict(employee)."""
    survey = _latest_survey(employee)
    if survey is None or survey.overall_score is None:
        return {'bat': None, 'combined': None}
    zone = bat.zone('total', survey.overall_score)
    return {
        'bat': {
            'score': float(survey.overall_score),
            'zone': zone,
            'date': survey.submission_date.isoformat() if survey.submission_date else None,
        },
        'combined': combined.combine(prediction.get('level'), zone),
    }


def history(employee, limit=HISTORY_LIMIT):
    """The saved predictions of one employee, newest first, with the BAT result
    of the same survey period when there is one. Reads only."""
    rows = list(
        BurnoutPrediction.objects.filter(employee_id=employee.pk)
        .order_by('-prediction_date', '-predicted_id')[:limit]
    )
    return [{**_as_dict(row, []), 'id': row.pk} for row in rows]


def can_view(user, employee_id):
    """A manager sees only their own team. HR never sees one person's result:
    HR works with the department totals only (see departments_for_org)."""
    if user.role != 'Manager':
        return None
    return team_of(user).filter(pk=employee_id).first()


NO_DEPARTMENT = 'No department'


def _summary(predictions):
    """Counts and the average score for a list of prediction dicts."""
    ok = [p for p in predictions if p['status'] == 'ok']
    scores = [p['score'] for p in ok]
    return {
        'employees': len(predictions),
        'assessed': len(ok),
        'insufficient': len(predictions) - len(ok),
        'average_score': round(sum(scores) / len(scores), 1) if scores else None,
        'levels': {level: sum(1 for p in ok if p['level'] == level) for level in LEVELS},
    }


def summarize_departments(rows):
    """rows: (department name, prediction dict) pairs.

    Returns the organization summary and one summary per department, highest
    average first (departments with no assessed employee go last). Only totals
    are returned, never one person's result."""
    rows = list(rows)
    by_department = {}
    for department, prediction in rows:
        by_department.setdefault((department or '').strip() or NO_DEPARTMENT, []).append(prediction)
    departments = [{'department': name, **_summary(items)} for name, items in by_department.items()]
    departments.sort(key=lambda d: (d['average_score'] is None, -(d['average_score'] or 0), d['department']))
    return {'organization': _summary([p for _, p in rows]), 'departments': departments}


def departments_for_org(org_id):
    """Department comparison for one organization. Read only."""
    employees = Employee.objects.filter(user__org_id=org_id).select_related('user')
    return summarize_departments((e.user.department, predict(e)) for e in employees)
