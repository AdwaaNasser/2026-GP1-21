"""BAT-12 scoring (Burnout Assessment Tool, work-related short version).

Source: BAT User Manual 2.0 (Schaufeli, De Witte, Desart, 2019).
  - 12 items, answered 1 (never) .. 5 (always).
  - Each dimension score = sum of its 3 items / 3.
  - Total score = sum of all 12 items / 12.  Scores are rounded to 2 decimals.
  - Zones come from Table 6 (cut-off values for Flemish employees, BAT-12).

The manual recommends the TOTAL score for individual assessment; the
dimension zones are shown for information only. The BAT does not diagnose
burnout. The cut-offs come from a Flemish sample (limitation for the report).

Answer order (the order the questions are shown in the survey):
    1-3 exhaustion, 4-6 mental distance, 7-9 cognitive impairment,
    10-12 emotional impairment.
"""
from decimal import ROUND_HALF_UP, Decimal

ITEM_COUNT = 12
MIN_ANSWER = 1
MAX_ANSWER = 5

# name -> (first index, last index + 1) in the answers list
DIMENSIONS = {
    'exhaustion': (0, 3),
    'mental_distance': (3, 6),
    'cognitive_impairment': (6, 9),
    'emotional_impairment': (9, 12),
}

# Table 6: (highest score that is still green, highest score that is still orange)
CUTOFFS = {
    'total': (Decimal('2.53'), Decimal('2.95')),
    'exhaustion': (Decimal('3.16'), Decimal('3.50')),
    'mental_distance': (Decimal('2.16'), Decimal('3.16')),
    'emotional_impairment': (Decimal('2.16'), Decimal('2.82')),
    'cognitive_impairment': (Decimal('2.82'), Decimal('3.16')),
}

GREEN, ORANGE, RED = 'green', 'orange', 'red'


def validate_answers(answers):
    """Return a list of problems (empty when the answers are valid)."""
    if not isinstance(answers, list) or len(answers) != ITEM_COUNT:
        return [f'Send exactly {ITEM_COUNT} answers.']
    for number, value in enumerate(answers, start=1):
        if isinstance(value, bool) or not isinstance(value, int):
            return [f'Answer {number} must be a whole number from {MIN_ANSWER} to {MAX_ANSWER}.']
        if not MIN_ANSWER <= value <= MAX_ANSWER:
            return [f'Answer {number} must be from {MIN_ANSWER} to {MAX_ANSWER}.']
    return []


def _average(total, count):
    return (Decimal(total) / Decimal(count)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def zone(name, score):
    green_max, orange_max = CUTOFFS[name]
    score = Decimal(str(score))
    if score <= green_max:
        return GREEN
    if score <= orange_max:
        return ORANGE
    return RED


def score_answers(answers):
    """Scores and zones for 12 valid answers. Raises ValueError if invalid."""
    problems = validate_answers(answers)
    if problems:
        raise ValueError(problems[0])

    scores = {
        name: _average(sum(answers[start:end]), end - start)
        for name, (start, end) in DIMENSIONS.items()
    }
    scores['total'] = _average(sum(answers), ITEM_COUNT)
    return {
        'scores': {name: float(value) for name, value in scores.items()},
        'zones': {name: zone(name, value) for name, value in scores.items()},
        'overall_zone': zone('total', scores['total']),
    }
