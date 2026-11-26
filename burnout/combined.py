"""One overall reading from the two results of the monthly survey.

The BAT result and the model prediction are on different scales (1-5 and 0-10)
and there is no real data to choose weights, so they are NOT merged into one
number. Each result is turned into three levels and a fixed rule says how much
they agree. Nothing is stored: it is worked out when the manager opens the page.

BAT zone  -> level : green = low, orange = moderate, red = high
Model     -> level : Low = low, Moderate = moderate, High / Severe = high

The BAT is the employee's own answer, so when it is high and the model is not,
the survey wins ("check_in"). A high model result with a lower BAT is only
something to watch ("monitor").
"""
LOW, MODERATE, HIGH = 'low', 'moderate', 'high'

_BAT = {'green': LOW, 'orange': MODERATE, 'red': HIGH}
_MODEL = {'Low': LOW, 'Moderate': MODERATE, 'High': HIGH, 'Severe': HIGH}

STRONG_SIGNAL = {
    'key': 'strong_signal',
    'label': 'Strong signal',
    'message': 'The survey and the model both show a high risk. Follow up with this employee soon.',
}
CHECK_IN = {
    'key': 'check_in',
    'label': 'Check in',
    'message': (
        'The employee\'s own answers show a high burnout level, although the model does not. '
        'Trust the survey and check in with them.'
    ),
}
MONITOR_MODEL = {
    'key': 'monitor',
    'label': 'Monitor',
    'message': (
        'The model sees a high risk in the work data, but the employee\'s own answers do not. '
        'It may be an early sign or a coincidence. Look again after the next survey.'
    ),
}
MONITOR_MIDDLE = {
    'key': 'monitor',
    'label': 'Monitor',
    'message': 'At least one result is in the middle range. Look again after the next survey.',
}
NO_CONCERN = {
    'key': 'no_concern',
    'label': 'No concern',
    'message': 'Both results are low.',
}


def combine(model_level, bat_zone):
    """The overall reading, or None when one of the two results is missing."""
    model = _MODEL.get(model_level)
    survey = _BAT.get(bat_zone)
    if model is None or survey is None:
        return None
    if model == HIGH and survey == HIGH:
        return {**STRONG_SIGNAL, 'bat_level': survey, 'model_level': model}
    if survey == HIGH:
        return {**CHECK_IN, 'bat_level': survey, 'model_level': model}
    if model == HIGH:
        return {**MONITOR_MODEL, 'bat_level': survey, 'model_level': model}
    if MODERATE in (model, survey):
        return {**MONITOR_MIDDLE, 'bat_level': survey, 'model_level': model}
    return {**NO_CONCERN, 'bat_level': survey, 'model_level': model}
