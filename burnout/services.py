"""Burnout prediction service.

predict() is the ONLY function the views call. Today it returns fixed dummy
values; when the two models are ready, only this function changes (the views,
the URLs and the React pages stay the same).

Response shape (agreed with the team):
    status          'ok' | 'insufficient_data'
    score           0-10, or None
    level           'Low' | 'Moderate' | 'High' | 'Severe', or None
    top_factors     [{'name', 'direction': 'increases'|'decreases', 'contribution'}]
    missing_inputs  names of the inputs we could not build
    predicted_at    'YYYY-MM-DD'
"""
from django.utils import timezone

from accounts.models import Employee
from goals.services import team_of

LEVELS = ('Low', 'Moderate', 'High', 'Severe')

# TODO(step 2): replace with the real input builder.
DUMMY_SCORE = 6.4
DUMMY_LEVEL = 'High'
DUMMY_FACTORS = [
    {'name': 'Weekly hours', 'direction': 'increases', 'contribution': 0.8},
    {'name': 'Meetings per week', 'direction': 'increases', 'contribution': 0.5},
    {'name': 'Leave days taken', 'direction': 'decreases', 'contribution': 0.3},
]


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


def predict(employee):
    """Return the prediction for one Employee row (dummy values for now)."""
    return {
        'status': 'ok',
        'score': DUMMY_SCORE,
        'level': DUMMY_LEVEL,
        'top_factors': [dict(f) for f in DUMMY_FACTORS],
        'missing_inputs': [],
        'predicted_at': _today(),
    }


def can_view(user, employee_id):
    """HR sees everyone; a manager sees only their own team."""
    from accounts.models import Employee

    if user.role == 'HR':
        return Employee.objects.filter(pk=employee_id).select_related('user').first()
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
