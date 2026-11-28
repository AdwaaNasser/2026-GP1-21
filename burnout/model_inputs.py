"""The questions the burnout prediction model needs, asked in the well-being survey.

The survey has two parts: the 12 BAT-12 items (see bat.py) and the 10 questions
below. All of them are required. Each answer is stored in its own column of
the table burnoutsurvey (same name as the key used here).

The model was trained with the Mental Health & Burnout in Tech Workers 2026
dataset, so each question keeps the meaning and the range of its column in that
dataset. work_life_balance_score is asked so that a higher number means MORE
interference of work with personal life: this is the direction the model uses.
"""
from decimal import Decimal, InvalidOperation

# key, label shown in the survey, kind ('int' | 'decimal' | 'bool'), minimum, maximum
QUESTIONS = [
    {
        'key': 'stress_score',
        'label': 'How stressed have you felt at work this month? (1 = not at all, 10 = extremely)',
        'kind': 'int', 'min': 1, 'max': 10,
    },
    {
        'key': 'work_life_balance_score',
        'label': 'How much does your work interfere with your personal life? (1 = not at all, 10 = very much)',
        'kind': 'int', 'min': 1, 'max': 10,
    },
    {
        'key': 'meetings_per_day',
        'label': 'On average, how many meetings do you attend per working day?',
        'kind': 'int', 'min': 0, 'max': 12,
    },
    {
        'key': 'sleep_hours_per_night',
        'label': 'On average, how many hours do you sleep per night?',
        'kind': 'decimal', 'min': 3, 'max': 10,
    },
    {
        'key': 'vacation_days_taken',
        'label': 'How many vacation days did you take in the last 12 months? '
                 '(not counting weekends, official holidays or sick leave)',
        'kind': 'int', 'min': 0, 'max': 30,
    },
    {
        'key': 'social_support_score',
        'label': 'How much support do you get from your colleagues? (1 = none, 10 = a lot)',
        'kind': 'int', 'min': 1, 'max': 10,
    },
    {
        'key': 'manager_support_score',
        'label': 'How much support do you get from your direct manager? (1 = none, 10 = a lot)',
        'kind': 'int', 'min': 1, 'max': 10,
    },
    {
        'key': 'exercise_days_per_week',
        'label': 'In a typical week, how many days do you exercise?',
        'kind': 'int', 'min': 0, 'max': 7,
    },
    {
        'key': 'autonomy_score',
        'label': 'How much control do you have over how and when you do your work? (1 = none, 10 = full control)',
        'kind': 'int', 'min': 1, 'max': 10,
    },
    {
        'key': 'ai_tools_daily',
        'label': 'Do you use AI tools in your daily work?',
        'kind': 'bool', 'min': None, 'max': None,
    },
]

KEYS = [q['key'] for q in QUESTIONS]


def validate(values):
    """Check the answers. Returns (cleaned, problems).

    `cleaned` maps every key to int, Decimal or bool; `problems` maps a key to a
    message. Every question is required, so a missing key is a problem."""
    if not isinstance(values, dict):
        return {}, {'model_answers': 'Send the answers as an object.'}
    cleaned, problems = {}, {}
    for q in QUESTIONS:
        key = q['key']
        value = values.get(key)
        if value is None or value == '':
            problems[key] = 'This question is required.'
            continue
        if q['kind'] == 'bool':
            if not isinstance(value, bool):
                problems[key] = 'Answer true or false.'
            else:
                cleaned[key] = value
            continue
        if isinstance(value, bool):
            problems[key] = 'Answer with a number.'
            continue
        if q['kind'] == 'int':
            if not isinstance(value, int):
                problems[key] = 'Answer with a whole number.'
                continue
            number = value
        else:
            try:
                number = Decimal(str(value))
            except (InvalidOperation, ValueError):
                problems[key] = 'Answer with a number.'
                continue
            if number.as_tuple().exponent < -1:
                problems[key] = 'Use at most one decimal place.'
                continue
        if not q['min'] <= number <= q['max']:
            problems[key] = f"Answer a number from {q['min']} to {q['max']}."
            continue
        cleaned[key] = number
    return cleaned, problems
