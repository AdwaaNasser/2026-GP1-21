from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from . import bat, combined, inputs, model_inputs, services, surveys
from .views import (
    BatSurveyView,
    BurnoutHistoryView,
    BurnoutPredictionView,
    DepartmentBurnoutView,
    SurveyQuestionsView,
    TeamBurnoutView,
)

KEYS = {'status', 'score', 'level', 'top_factors', 'missing_inputs', 'predicted_at'}
ASSESSMENT = {'bat': {'score': 3.1, 'zone': 'red', 'date': '2026-11-25'}, 'combined': {'key': 'strong_signal'}}
MODEL_ANSWERS = {
    'stress_score': 8, 'work_life_balance_score': 6, 'meetings_per_day': 5,
    'sleep_hours_per_night': 5.5, 'vacation_days_taken': 8, 'social_support_score': 4,
    'manager_support_score': 5, 'exercise_days_per_week': 1, 'autonomy_score': 4,
    'ai_tools_daily': True,
}


class ServiceTests(SimpleTestCase):
    def saved(self, score='6.40', level='High'):
        factors = [
            SimpleNamespace(factor_name='stress_score', contribution=Decimal('0.94')),
            SimpleNamespace(factor_name='work_hours_per_week', contribution=Decimal('-1.12')),
            SimpleNamespace(factor_name='exercise_days_per_week', contribution=Decimal('0.30')),
        ]
        factor_manager = MagicMock()
        factor_manager.all.return_value = factors
        return SimpleNamespace(
            pk=3, risk_score=Decimal(score), risk_level=level,
            prediction_date=date(2026, 11, 25), factors=factor_manager,
        )

    def test_predict_reads_the_latest_saved_prediction(self):
        with patch.object(services, '_latest_prediction', return_value=self.saved()), \
                patch.object(services.inputs, 'system_inputs', return_value=({}, [])):
            result = services.predict(SimpleNamespace(pk=1))
        self.assertEqual(set(result), KEYS)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['score'], 6.4)
        self.assertEqual(result['level'], 'High')
        self.assertEqual(result['predicted_at'], '2026-11-25')
        self.assertTrue(0 <= result['score'] <= 10)
        self.assertIn(result['level'], services.LEVELS)
        for f in result['top_factors']:
            self.assertEqual(set(f), {'name', 'direction', 'contribution'})
            self.assertIn(f['direction'], ('increases', 'decreases'))

    def test_factors_are_readable_and_sorted_by_size(self):
        with patch.object(services, '_latest_prediction', return_value=self.saved()), \
                patch.object(services.inputs, 'system_inputs', return_value=({}, [])):
            factors = services.predict(SimpleNamespace(pk=1))['top_factors']
        self.assertEqual(
            factors,
            [
                {'name': 'Weekly work hours', 'direction': 'decreases', 'contribution': 1.12},
                {'name': 'Stress', 'direction': 'increases', 'contribution': 0.94},
                {'name': 'Exercise days per week', 'direction': 'increases', 'contribution': 0.3},
            ],
        )

    def test_no_saved_prediction_is_insufficient_data(self):
        with patch.object(services, '_latest_prediction', return_value=None):
            result = services.predict(SimpleNamespace(pk=1))
        self.assertEqual(result['status'], 'insufficient_data')
        self.assertEqual(result['missing_inputs'], ['monthly survey'])

    def test_missing_system_inputs_are_reported(self):
        with patch.object(services, '_latest_prediction', return_value=self.saved()), \
                patch.object(services.inputs, 'system_inputs', return_value=({}, ['work_hours_per_week'])):
            result = services.predict(SimpleNamespace(pk=1))
        self.assertEqual(result['missing_inputs'], ['work_hours_per_week'])

    def test_run_prediction_needs_stress(self):
        with patch.object(services.inputs, 'build', return_value=({'gender': 'Male'}, ['stress_score'])), \
                patch.object(services, '_latest_survey', return_value=None), \
                patch('burnout.predictor.get_predictor') as get_predictor:
            self.assertIsNone(services.run_prediction(SimpleNamespace(pk=1)))
        get_predictor.assert_not_called()

    def test_run_prediction_saves_the_prediction_and_its_main_factors(self):
        predictor = MagicMock()
        predictor.predict.return_value = {
            'burnout_score': 6.73, 'burnout_level': 'High',
            'top_factors': [
                {'feature': 'work_hours_per_week', 'impact': -1.12, 'effect': 'decreases'},
                {'feature': 'stress_score', 'impact': 0.94, 'effect': 'increases'},
            ],
        }
        created = SimpleNamespace(pk=11)
        with patch.object(services.inputs, 'build', return_value=({'stress_score': 8}, [])), \
                patch('burnout.predictor.get_predictor', return_value=predictor), \
                patch.object(services, 'transaction', MagicMock()), \
                patch.object(services, 'BurnoutPrediction') as prediction_table, \
                patch.object(services, 'PredictionFactor') as factor_table:
            prediction_table.objects.create.return_value = created
            result = services.run_prediction(SimpleNamespace(pk=7), survey=SimpleNamespace(), today=date(2026, 11, 25))
        self.assertIs(result, created)
        prediction_table.objects.create.assert_called_once_with(
            employee_id=7, prediction_date=date(2026, 11, 25),
            risk_score=Decimal('6.73'), risk_level='High',
        )
        rows = factor_table.call_args_list
        self.assertEqual([c.kwargs['factor_name'] for c in rows], ['work_hours_per_week', 'stress_score'])
        self.assertEqual([c.kwargs['contribution'] for c in rows], [Decimal('-1.12'), Decimal('0.94')])
        self.assertTrue(all(c.kwargs['prediction'] is created for c in rows))

    def test_a_failing_model_never_breaks_the_survey(self):
        with patch.object(services, 'run_prediction', side_effect=RuntimeError('model missing')), \
                self.assertLogs('burnout.services', level='ERROR'):
            self.assertIsNone(services.run_prediction_safely(SimpleNamespace(pk=1)))

    def test_insufficient_shape(self):
        result = services.insufficient(['weekly_hours'])
        self.assertEqual(set(result), KEYS)
        self.assertEqual(result['status'], 'insufficient_data')
        self.assertIsNone(result['score'])
        self.assertIsNone(result['level'])
        self.assertEqual(result['top_factors'], [])
        self.assertEqual(result['missing_inputs'], ['weekly_hours'])


class ViewTests(SimpleTestCase):
    def call(self, user, employee_id=5):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        return BurnoutPredictionView.as_view()(request, employee_id=employee_id)

    def employee(self):
        return SimpleNamespace(pk=5, user=SimpleNamespace(first_name='A', last_name='B'))

    def test_employee_role_is_forbidden(self):
        user = SimpleNamespace(role='Employee', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=False):
            self.assertEqual(self.call(user).status_code, 403)

    def test_manager_outside_team_gets_404(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=True), \
                patch('burnout.views.services.can_view', return_value=None):
            self.assertEqual(self.call(user).status_code, 404)

    def test_manager_in_team_gets_prediction(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=True), \
                patch('burnout.views.services.can_view', return_value=self.employee()), \
                patch('burnout.views.services.predict', return_value={'status': 'ok', 'score': 6.4, 'level': 'High', 'top_factors': [], 'missing_inputs': [], 'predicted_at': '2026-11-25'}), \
                patch('burnout.views.services.assessment', return_value=ASSESSMENT):
            response = self.call(user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(KEYS | {'employee', 'bat', 'combined'}, set(response.data))

    def test_hr_is_forbidden(self):
        user = SimpleNamespace(role='HR', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=False):
            self.assertEqual(self.call(user).status_code, 403)

    def test_can_view_refuses_hr(self):
        hr = SimpleNamespace(role='HR', pk=1)
        self.assertIsNone(services.can_view(hr, 5))


class BatScoringTests(SimpleTestCase):
    def test_all_ones_is_green_everywhere(self):
        result = bat.score_answers([1] * 12)
        self.assertEqual(result['scores']['total'], 1.0)
        self.assertEqual(result['overall_zone'], 'green')
        self.assertTrue(all(z == 'green' for z in result['zones'].values()))

    def test_all_fives_is_red_everywhere(self):
        result = bat.score_answers([5] * 12)
        self.assertEqual(result['scores']['total'], 5.0)
        self.assertTrue(all(z == 'red' for z in result['zones'].values()))

    def test_dimensions_use_their_own_three_items(self):
        # 5,5,5 | 1,1,1 | 3,3,3 | 2,2,2
        result = bat.score_answers([5, 5, 5, 1, 1, 1, 3, 3, 3, 2, 2, 2])
        self.assertEqual(result['scores']['exhaustion'], 5.0)
        self.assertEqual(result['scores']['mental_distance'], 1.0)
        self.assertEqual(result['scores']['cognitive_impairment'], 3.0)
        self.assertEqual(result['scores']['emotional_impairment'], 2.0)
        self.assertEqual(result['scores']['total'], 2.75)  # 33 / 12

    def test_rounding_to_two_decimals(self):
        result = bat.score_answers([4, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1])
        self.assertEqual(result['scores']['exhaustion'], 3.33)   # 10 / 3

    def test_total_zone_boundaries(self):
        # sums over 12 items: 30 -> 2.50 green, 31 -> 2.58 orange, 35 -> 2.92 orange, 36 -> 3.00 red
        def zone_for(total):
            answers = [1] * 12
            extra = total - 12
            for i in range(12):
                add = min(4, extra)
                answers[i] += add
                extra -= add
            return bat.score_answers(answers)['overall_zone']
        self.assertEqual(zone_for(30), 'green')
        self.assertEqual(zone_for(31), 'orange')
        self.assertEqual(zone_for(35), 'orange')
        self.assertEqual(zone_for(36), 'red')

    def test_zone_cutoffs_from_table_6(self):
        cases = [
            ('total', 2.53, 'green'), ('total', 2.54, 'orange'), ('total', 2.95, 'orange'), ('total', 2.96, 'red'),
            ('exhaustion', 3.16, 'green'), ('exhaustion', 3.17, 'orange'), ('exhaustion', 3.50, 'orange'), ('exhaustion', 3.51, 'red'),
            ('mental_distance', 2.16, 'green'), ('mental_distance', 2.17, 'orange'), ('mental_distance', 3.16, 'orange'), ('mental_distance', 3.17, 'red'),
            ('emotional_impairment', 2.16, 'green'), ('emotional_impairment', 2.17, 'orange'), ('emotional_impairment', 2.82, 'orange'), ('emotional_impairment', 2.83, 'red'),
            ('cognitive_impairment', 2.82, 'green'), ('cognitive_impairment', 2.83, 'orange'), ('cognitive_impairment', 3.16, 'orange'), ('cognitive_impairment', 3.17, 'red'),
        ]
        for name, score, expected in cases:
            self.assertEqual(bat.zone(name, score), expected, (name, score))

    def test_invalid_answers_are_refused(self):
        bad = [None, 'x', [1] * 11, [1] * 13, [0] * 12, [6] * 12, [1.5] * 12, ['3'] * 12, [True] * 12]
        for answers in bad:
            self.assertTrue(bat.validate_answers(answers), answers)
            with self.assertRaises(ValueError):
                bat.score_answers(answers)


class PeriodTests(SimpleTestCase):
    def test_monthly_period(self):
        self.assertEqual(surveys.period_start(date(2026, 11, 12), 1), date(2026, 11, 1))
        self.assertEqual(surveys.next_period_start(date(2026, 11, 12), 1), date(2026, 12, 1))
        self.assertEqual(surveys.next_period_start(date(2026, 12, 31), 1), date(2027, 1, 1))
        self.assertEqual(surveys.period_start(date(2026, 11, 1), 1), date(2026, 11, 1))

    def test_quarterly_period(self):
        self.assertEqual(surveys.period_start(date(2026, 11, 12), 3), date(2026, 10, 1))
        self.assertEqual(surveys.next_period_start(date(2026, 11, 12), 3), date(2027, 1, 1))
        self.assertEqual(surveys.period_start(date(2026, 2, 20), 3), date(2026, 1, 1))

    def test_default_is_every_three_months(self):
        self.assertEqual(surveys.DEFAULT_FREQUENCY, 'quarterly')
        self.assertEqual(surveys.FREQUENCY_MONTHS, {'monthly': 1, 'quarterly': 3, 'semiannual': 6})

    def test_half_year_period(self):
        self.assertEqual(surveys.period_start(date(2026, 11, 12), 6), date(2026, 7, 1))
        self.assertEqual(surveys.next_period_start(date(2026, 11, 12), 6), date(2027, 1, 1))


def employee_in(frequency, opened_on=None):
    org = SimpleNamespace(survey_frequency=frequency, survey_opened_on=opened_on)
    return SimpleNamespace(pk=7, user=SimpleNamespace(org=org))


class CurrentWindowTests(SimpleTestCase):
    today = date(2026, 11, 12)

    def test_each_frequency(self):
        cases = {
            'monthly': (date(2026, 11, 1), date(2026, 12, 1)),
            'quarterly': (date(2026, 10, 1), date(2027, 1, 1)),
            'semiannual': (date(2026, 7, 1), date(2027, 1, 1)),
        }
        for frequency, (since, nxt) in cases.items():
            window = surveys.current_window(employee_in(frequency), self.today)
            self.assertEqual(window, {'since': since, 'next': nxt}, frequency)

    def test_manual_is_closed_until_hr_sends(self):
        self.assertIsNone(surveys.current_window(employee_in('manual'), self.today))
        window = surveys.current_window(employee_in('manual', date(2026, 11, 10)), self.today)
        self.assertEqual(window, {'since': date(2026, 11, 10), 'next': None})

    def test_manual_status_closed_then_available(self):
        self.assertEqual(
            surveys.status_for(employee_in('manual'), today=self.today),
            {'status': 'closed', 'submitted_on': None, 'next_available': None},
        )
        with patch.object(surveys, 'submission_in_period', return_value=None):
            self.assertEqual(
                surveys.status_for(employee_in('manual', date(2026, 11, 10)), today=self.today)['status'],
                'available',
            )

    def test_manual_submit_refused_while_closed(self):
        with patch.object(surveys, 'BurnoutSurvey') as table:
            with self.assertRaises(surveys.SurveyClosed):
                surveys.submit(employee_in('manual'), [3] * 12, {'stress_score': 5}, today=self.today)
        table.objects.create.assert_not_called()


class SurveySaveTests(SimpleTestCase):
    """No database: the table access is replaced by mocks."""
    employee = employee_in('monthly')
    answers = [5, 5, 5, 1, 1, 1, 3, 3, 3, 2, 2, 2]
    model_answers = {'stress_score': 8, 'ai_tools_daily': True}

    def test_saves_one_row_with_the_scores(self):
        row = SimpleNamespace(submission_date=date(2026, 11, 12))
        with patch.object(surveys, 'transaction', MagicMock()), \
                patch.object(surveys, 'Employee', MagicMock()), \
                patch.object(surveys, 'submission_in_period', return_value=None), \
                patch.object(surveys, 'BurnoutSurvey') as table:
            table.objects.create.return_value = row
            result = surveys.submit(self.employee, self.answers, self.model_answers, today=date(2026, 11, 12))
        table.objects.create.assert_called_once_with(
            employee_id=7,
            submission_date=date(2026, 11, 12),
            exhaustion_score=Decimal('5.0'),
            mental_distance_score=Decimal('1.0'),
            cognitive_impairment_score=Decimal('3.0'),
            emotional_impairment_score=Decimal('2.0'),
            overall_score=Decimal('2.75'),
            stress_score=8,
            ai_tools_daily=True,
        )
        self.assertEqual(result, {'status': 'submitted', 'submitted_on': '2026-11-12', 'next_available': '2026-12-01'})
        self.assertNotIn('score', ' '.join(result))

    def test_second_survey_in_the_period_is_refused_and_nothing_is_saved(self):
        with patch.object(surveys, 'transaction', MagicMock()), \
                patch.object(surveys, 'Employee', MagicMock()), \
                patch.object(surveys, 'submission_in_period', return_value=SimpleNamespace()), \
                patch.object(surveys, 'BurnoutSurvey') as table:
            with self.assertRaises(surveys.AlreadySubmitted):
                surveys.submit(self.employee, self.answers, self.model_answers, today=date(2026, 11, 12))
        table.objects.create.assert_not_called()

    def test_invalid_answers_save_nothing(self):
        with patch.object(surveys, 'BurnoutSurvey') as table:
            with self.assertRaises(ValueError):
                surveys.submit(self.employee, [1] * 5, self.model_answers)
        table.objects.create.assert_not_called()

    def test_status_available_when_nothing_this_period(self):
        with patch.object(surveys, 'submission_in_period', return_value=None):
            self.assertEqual(
                surveys.status_for(self.employee, today=date(2026, 11, 12)),
                {'status': 'available', 'submitted_on': None, 'next_available': None},
            )

    def test_status_submitted(self):
        row = SimpleNamespace(submission_date=date(2026, 11, 3))
        with patch.object(surveys, 'submission_in_period', return_value=row):
            self.assertEqual(
                surveys.status_for(self.employee, today=date(2026, 11, 12)),
                {'status': 'submitted', 'submitted_on': '2026-11-03', 'next_available': '2026-12-01'},
            )


class BatSurveyViewTests(SimpleTestCase):
    def call(self, method, user, data=None):
        factory = APIRequestFactory()
        request = factory.get('/x/') if method == 'get' else factory.post('/x/', data, format='json')
        force_authenticate(request, user=user)
        return BatSurveyView.as_view()(request)

    def user(self, role='Employee'):
        return SimpleNamespace(role=role, is_authenticated=True, pk=7)

    def test_only_employees(self):
        with patch('burnout.views.employee_of', return_value=None):
            self.assertEqual(self.call('get', self.user('Manager')).status_code, 403)
            self.assertEqual(self.call('post', self.user('HR'), {'answers': [3] * 12}).status_code, 403)

    def test_get_status(self):
        status = {'status': 'available', 'submitted_on': None, 'next_available': None}
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.status_for', return_value=status):
            response = self.call('get', self.user())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, status)

    def test_post_saves_and_never_returns_a_score(self):
        status = {'status': 'submitted', 'submitted_on': '2026-11-12', 'next_available': '2026-12-01'}
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit', return_value=status) as submit, \
                patch('burnout.views.services.run_prediction_safely') as run:
            response = self.call('post', self.user(), {'answers': [3] * 12, 'model_answers': MODEL_ANSWERS})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data, status)
        submit.assert_called_once()
        run.assert_called_once()   # the prediction is made after the survey is saved

    def test_post_twice_in_a_period_is_409(self):
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit', side_effect=surveys.AlreadySubmitted), \
                patch('burnout.views.services.run_prediction_safely') as run:
            response = self.call('post', self.user(), {'answers': [3] * 12, 'model_answers': MODEL_ANSWERS})
        self.assertEqual(response.status_code, 409)
        run.assert_not_called()

    def test_bad_answers_are_400_and_nothing_is_saved(self):
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit') as submit:
            self.assertEqual(self.call('post', self.user(), {'answers': [3] * 5, 'model_answers': MODEL_ANSWERS}).status_code, 400)
            self.assertEqual(self.call('post', self.user(), {}).status_code, 400)
        submit.assert_not_called()

    def test_missing_or_wrong_model_answers_are_400_and_nothing_is_saved(self):
        without_stress = {k: v for k, v in MODEL_ANSWERS.items() if k != 'stress_score'}
        out_of_range = {**MODEL_ANSWERS, 'sleep_hours_per_night': 15}
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit') as submit:
            self.assertEqual(self.call('post', self.user(), {'answers': [3] * 12}).status_code, 400)
            response = self.call('post', self.user(), {'answers': [3] * 12, 'model_answers': without_stress})
            self.assertEqual(response.status_code, 400)
            self.assertIn('stress_score', response.data['model_answers'])
            response = self.call('post', self.user(), {'answers': [3] * 12, 'model_answers': out_of_range})
            self.assertEqual(response.status_code, 400)
            self.assertIn('sleep_hours_per_night', response.data['model_answers'])
        submit.assert_not_called()


class TeamBurnoutViewTests(SimpleTestCase):
    def call(self, user):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        return TeamBurnoutView.as_view()(request)

    def member(self, pk, first):
        return SimpleNamespace(pk=pk, user=SimpleNamespace(first_name=first, last_name='X', job_title='Analyst'))

    def test_only_managers(self):
        user = SimpleNamespace(role='Employee', is_authenticated=True, pk=9)
        with patch('goals.permissions.is_manager', return_value=False):
            self.assertEqual(self.call(user).status_code, 403)
        hr = SimpleNamespace(role='HR', is_authenticated=True, pk=9)
        with patch('goals.permissions.is_manager', return_value=False):
            self.assertEqual(self.call(hr).status_code, 403)

    def test_manager_gets_only_the_team_members_returned_by_team_of(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=3)
        team = [self.member(10, 'Sara'), self.member(11, 'Omar')]
        with patch('goals.permissions.is_manager', return_value=True), \
                patch('burnout.views.services.team_of', return_value=team) as team_of, \
                patch('burnout.views.services.predict', return_value={'status': 'ok', 'score': 6.4, 'level': 'High', 'top_factors': [], 'missing_inputs': [], 'predicted_at': '2026-11-25'}), \
                patch('burnout.views.services.assessment', return_value=ASSESSMENT):
            response = self.call(user)
        team_of.assert_called_once_with(user)
        self.assertEqual(response.status_code, 200)
        members = response.data['members']
        self.assertEqual([m['id'] for m in members], [10, 11])
        for m in members:
            self.assertTrue({'id', 'first_name', 'last_name', 'job_title', 'bat', 'combined'} | KEYS <= set(m))

    def test_empty_team(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=3)
        with patch('goals.permissions.is_manager', return_value=True), \
                patch('burnout.views.services.team_of', return_value=[]):
            self.assertEqual(self.call(user).data, {'members': []})


def ok(score, level):
    return {'status': 'ok', 'score': score, 'level': level}


NOT_OK = {'status': 'insufficient_data', 'score': None, 'level': None}


class DepartmentSummaryTests(SimpleTestCase):
    def test_averages_counts_and_order(self):
        result = services.summarize_departments([
            ('Design', ok(2.0, 'Low')), ('Design', ok(4.0, 'Moderate')),
            ('Engineering', ok(8.0, 'Severe')), ('Engineering', ok(6.0, 'High')), ('Engineering', NOT_OK),
            ('People', NOT_OK),
        ])
        names = [d['department'] for d in result['departments']]
        self.assertEqual(names, ['Engineering', 'Design', 'People'])  # highest average first, no data last
        eng = result['departments'][0]
        self.assertEqual(eng['average_score'], 7.0)
        self.assertEqual((eng['employees'], eng['assessed'], eng['insufficient']), (3, 2, 1))
        self.assertEqual(eng['levels'], {'Low': 0, 'Moderate': 0, 'High': 1, 'Severe': 1})
        self.assertIsNone(result['departments'][2]['average_score'])
        org = result['organization']
        self.assertEqual((org['employees'], org['assessed'], org['insufficient']), (6, 4, 2))
        self.assertEqual(org['average_score'], 5.0)

    def test_blank_department_is_grouped(self):
        result = services.summarize_departments([(None, ok(3.0, 'Low')), ('  ', ok(5.0, 'Moderate'))])
        self.assertEqual([d['department'] for d in result['departments']], [services.NO_DEPARTMENT])
        self.assertEqual(result['departments'][0]['average_score'], 4.0)

    def test_empty_organization(self):
        result = services.summarize_departments([])
        self.assertEqual(result['departments'], [])
        self.assertIsNone(result['organization']['average_score'])

    def test_no_person_level_data_is_returned(self):
        result = services.summarize_departments([('Design', ok(2.0, 'Low'))])
        counts = {'employees', 'assessed', 'insufficient', 'average_score', 'levels'}
        self.assertEqual(set(result), {'organization', 'departments'})
        self.assertEqual(set(result['organization']), counts)
        self.assertEqual(set(result['departments'][0]), counts | {'department'})


class DepartmentBurnoutViewTests(SimpleTestCase):
    def call(self, user):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        return DepartmentBurnoutView.as_view()(request)

    def test_only_hr(self):
        for role in ('Manager', 'Employee'):
            user = SimpleNamespace(role=role, is_authenticated=True, pk=3, org_id=1)
            self.assertEqual(self.call(user).status_code, 403, role)

    def test_hr_gets_the_summary_of_their_own_organization(self):
        user = SimpleNamespace(role='HR', is_authenticated=True, pk=1, org_id=42)
        summary = {'organization': {}, 'departments': []}
        with patch('burnout.views.services.departments_for_org', return_value=summary) as call:
            response = self.call(user)
        call.assert_called_once_with(42)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, summary)


class ModelQuestionsTests(SimpleTestCase):
    def test_ten_questions_matching_the_survey_columns(self):
        self.assertEqual(len(model_inputs.QUESTIONS), 10)
        self.assertEqual(set(model_inputs.KEYS), set(MODEL_ANSWERS))

    def test_valid_answers_are_accepted(self):
        cleaned, problems = model_inputs.validate(MODEL_ANSWERS)
        self.assertEqual(problems, {})
        self.assertEqual(set(cleaned), set(MODEL_ANSWERS))
        self.assertEqual(cleaned['sleep_hours_per_night'], Decimal('5.5'))
        self.assertIs(cleaned['ai_tools_daily'], True)

    def test_every_question_is_required(self):
        for key in model_inputs.KEYS:
            answers = {k: v for k, v in MODEL_ANSWERS.items() if k != key}
            self.assertEqual(set(model_inputs.validate(answers)[1]), {key})
            self.assertEqual(set(model_inputs.validate({**MODEL_ANSWERS, key: None})[1]), {key})

    def test_ranges(self):
        bad = {
            'stress_score': [0, 11], 'work_life_balance_score': [0, 11], 'meetings_per_day': [-1, 13],
            'sleep_hours_per_night': [2.9, 10.1], 'vacation_days_taken': [-1, 31],
            'social_support_score': [0, 11], 'manager_support_score': [0, 11],
            'exercise_days_per_week': [-1, 8], 'autonomy_score': [0, 11],
        }
        for key, values in bad.items():
            for value in values:
                self.assertIn(key, model_inputs.validate({**MODEL_ANSWERS, key: value})[1], (key, value))
        for key, value in {'stress_score': 1, 'stress_score ': 10, 'meetings_per_day': 0, 'sleep_hours_per_night': 3,
                           'vacation_days_taken': 30, 'exercise_days_per_week': 7}.items():
            key = key.strip()
            self.assertEqual(model_inputs.validate({**MODEL_ANSWERS, key: value})[1], {}, (key, value))

    def test_types(self):
        for answers in (
            {**MODEL_ANSWERS, 'stress_score': 7.5},        # whole number
            {**MODEL_ANSWERS, 'stress_score': True},       # a boolean is not a number
            {**MODEL_ANSWERS, 'stress_score': 'high'},
            {**MODEL_ANSWERS, 'ai_tools_daily': 1},        # must be true or false
            {**MODEL_ANSWERS, 'sleep_hours_per_night': 6.25},   # one decimal place
        ):
            self.assertNotEqual(model_inputs.validate(answers)[1], {}, answers)

    def test_not_an_object(self):
        self.assertIn('model_answers', model_inputs.validate([1, 2, 3])[1])
        self.assertIn('model_answers', model_inputs.validate(None)[1])

    def test_questions_view_lists_them(self):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=SimpleNamespace(role='Employee', is_authenticated=True, pk=7))
        response = SurveyQuestionsView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([q['key'] for q in response.data['questions']], model_inputs.KEYS)


def task(hours, start, due):
    return SimpleNamespace(estimated_hours=hours, start_date=start, due_date=due)


class SystemInputsTests(SimpleTestCase):
    wednesday = date(2026, 11, 25)         # week: Sunday 22 Nov to Saturday 28 Nov

    def test_week_is_sunday_to_saturday(self):
        self.assertEqual(inputs.week_of(self.wednesday), (date(2026, 11, 22), date(2026, 11, 28)))
        self.assertEqual(inputs.week_of(date(2026, 11, 22)), (date(2026, 11, 22), date(2026, 11, 28)))   # Sunday
        self.assertEqual(inputs.week_of(date(2026, 11, 28)), (date(2026, 11, 22), date(2026, 11, 28)))   # Saturday

    def test_weekly_hours_spreads_task_hours_over_working_days(self):
        # 5 working days (Sun to Thu) all inside this week
        self.assertEqual(inputs.weekly_hours([task(30, date(2026, 11, 22), date(2026, 11, 26))], self.wednesday), 30.0)
        # 10 working days over two weeks: half of it falls in this week
        self.assertEqual(inputs.weekly_hours([task(40, date(2026, 11, 22), date(2026, 12, 3))], self.wednesday), 20.0)

    def test_weekly_hours_ignores_other_weeks_and_incomplete_tasks(self):
        tasks = [
            task(16, date(2026, 11, 29), date(2026, 12, 3)),       # next week
            task(None, date(2026, 11, 22), date(2026, 11, 26)),    # no estimate
            task(8, None, date(2026, 11, 26)),                     # no start date
            task(8, date(2026, 11, 26), date(2026, 11, 22)),       # due before start
        ]
        self.assertIsNone(inputs.weekly_hours(tasks, self.wednesday))
        self.assertIsNone(inputs.weekly_hours([], self.wednesday))

    def test_weekly_hours_adds_the_tasks(self):
        tasks = [task(10, date(2026, 11, 22), date(2026, 11, 26)), task(5, date(2026, 11, 23), date(2026, 11, 23))]
        self.assertEqual(inputs.weekly_hours(tasks, self.wednesday), 15.0)

    def test_deadline_pressure(self):
        today = self.wednesday

        def due(*days):
            return [SimpleNamespace(due_date=today + timedelta(days=d)) for d in days]
        self.assertEqual(inputs.deadline_pressure(due(10, 20), today), 1.0)        # nothing close
        self.assertEqual(inputs.deadline_pressure(due(-2, 1), today), 10.0)        # all overdue or close
        self.assertEqual(inputs.deadline_pressure(due(3, 10), today), 5.5)         # exactly 3 days counts as close
        self.assertEqual(inputs.deadline_pressure(due(4, 10), today), 1.0)         # 4 days does not
        self.assertIsNone(inputs.deadline_pressure([], today))
        self.assertIsNone(inputs.deadline_pressure([SimpleNamespace(due_date=None)], today))

    def test_gender_for_model(self):
        self.assertEqual(inputs.gender_for_model('Female'), 'Female')
        self.assertEqual(inputs.gender_for_model(' male '), 'Male')
        for value in (None, '', 'Non-binary', 'أنثى', 'other'):
            self.assertEqual(inputs.gender_for_model(value), 'Prefer not to say')

    def test_survey_inputs_and_missing(self):
        survey = SimpleNamespace(**{k: None for k in model_inputs.KEYS})
        survey.stress_score = 8
        survey.sleep_hours_per_night = Decimal('5.5')
        survey.ai_tools_daily = False
        self.assertEqual(
            inputs.survey_inputs(survey),
            {'stress_score': 8, 'sleep_hours_per_night': 5.5, 'ai_tools_daily': False},
        )
        self.assertEqual(inputs.survey_inputs(None), {})

    def test_build_lists_every_missing_input(self):
        employee = SimpleNamespace(pk=1)
        with patch.object(inputs, 'system_inputs', return_value=({'gender': 'Male'}, ['seniority_level'])):
            values, missing = inputs.build(employee, None, self.wednesday)
        self.assertEqual(values, {'gender': 'Male'})
        self.assertEqual(missing, ['seniority_level'] + model_inputs.KEYS)


class HistoryViewTests(SimpleTestCase):
    def call(self, user, employee_id=5):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        return BurnoutHistoryView.as_view()(request, employee_id=employee_id)

    def test_hr_and_employees_are_forbidden(self):
        user = SimpleNamespace(role='HR', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=False):
            self.assertEqual(self.call(user).status_code, 403)

    def test_manager_outside_team_gets_404(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=True), \
                patch('burnout.views.services.can_view', return_value=None):
            self.assertEqual(self.call(user).status_code, 404)

    def test_manager_gets_the_history_of_a_team_member(self):
        user = SimpleNamespace(role='Manager', is_authenticated=True, pk=9)
        employee = SimpleNamespace(pk=5, user=SimpleNamespace(first_name='A', last_name='B'))
        with patch('burnout.views.is_manager', return_value=True), \
                patch('burnout.views.services.can_view', return_value=employee), \
                patch('burnout.views.services.history', return_value=[{'score': 6.4}]), \
                patch('burnout.views.surveys.bat_history', return_value=[{'score': 3.0}]):
            response = self.call(user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {'employee', 'predictions', 'bat'})
        self.assertEqual(response.data['predictions'], [{'score': 6.4}])

    def test_bat_history_has_score_and_zone(self):
        rows = [SimpleNamespace(submission_date=date(2026, 11, 25), overall_score=Decimal('3.00')),
                SimpleNamespace(submission_date=date(2026, 10, 25), overall_score=Decimal('2.00'))]
        manager = MagicMock()
        manager.order_by.return_value.__getitem__.return_value = rows
        with patch.object(surveys, 'BurnoutSurvey') as table:
            table.objects.filter.return_value = manager
            result = surveys.bat_history(SimpleNamespace(pk=5))
        self.assertEqual(result, [
            {'date': '2026-11-25', 'score': 3.0, 'zone': 'red'},
            {'date': '2026-10-25', 'score': 2.0, 'zone': 'green'},
        ])


class CombinedTests(SimpleTestCase):
    def key(self, model, zone):
        return combined.combine(model, zone)['key']

    def test_both_high_is_a_strong_signal(self):
        self.assertEqual(self.key('High', 'red'), 'strong_signal')
        self.assertEqual(self.key('Severe', 'red'), 'strong_signal')

    def test_high_survey_with_a_lower_model_result_wins(self):
        self.assertEqual(self.key('Low', 'red'), 'check_in')
        self.assertEqual(self.key('Moderate', 'red'), 'check_in')

    def test_high_model_with_a_lower_survey_is_only_monitored(self):
        self.assertEqual(self.key('High', 'green'), 'monitor')
        self.assertEqual(self.key('Severe', 'orange'), 'monitor')

    def test_middle_results_are_monitored(self):
        self.assertEqual(self.key('Moderate', 'green'), 'monitor')
        self.assertEqual(self.key('Low', 'orange'), 'monitor')

    def test_both_low_is_no_concern(self):
        self.assertEqual(self.key('Low', 'green'), 'no_concern')

    def test_nothing_without_both_results(self):
        self.assertIsNone(combined.combine(None, 'red'))
        self.assertIsNone(combined.combine('High', None))

    def test_result_has_the_two_levels(self):
        result = combined.combine('Severe', 'orange')
        self.assertEqual((result['model_level'], result['bat_level']), ('high', 'moderate'))


class AssessmentTests(SimpleTestCase):
    def test_no_survey_gives_nothing(self):
        with patch('burnout.services._latest_survey', return_value=None):
            result = services.assessment(SimpleNamespace(pk=1), {'level': 'High'})
        self.assertEqual(result, {'bat': None, 'combined': None})

    def test_survey_and_prediction_are_combined(self):
        survey = SimpleNamespace(overall_score=Decimal('3.40'), submission_date=date(2026, 11, 25))
        with patch('burnout.services._latest_survey', return_value=survey):
            result = services.assessment(SimpleNamespace(pk=1), {'level': 'High'})
        self.assertEqual(result['bat'], {'score': 3.4, 'zone': 'red', 'date': '2026-11-25'})
        self.assertEqual(result['combined']['key'], 'strong_signal')

    def test_no_prediction_means_no_combined_reading(self):
        survey = SimpleNamespace(overall_score=Decimal('3.40'), submission_date=date(2026, 11, 25))
        with patch('burnout.services._latest_survey', return_value=survey):
            result = services.assessment(SimpleNamespace(pk=1), {'level': None})
        self.assertEqual(result['bat']['zone'], 'red')
        self.assertIsNone(result['combined'])


class SurveySettingsViewTests(SimpleTestCase):
    def hr(self, frequency='quarterly', opened_on=None):
        org = SimpleNamespace(survey_frequency=frequency, survey_opened_on=opened_on, save=MagicMock())
        return SimpleNamespace(role='HR', is_authenticated=True, pk=1, org=org)

    def call(self, view, method, user, data=None):
        factory = APIRequestFactory()
        request = factory.get('/x/') if method == 'get' else getattr(factory, method)('/x/', data, format='json')
        force_authenticate(request, user=user)
        return view.as_view()(request)

    def test_only_hr(self):
        from burnout.views import SurveySettingsView
        for role in ('Manager', 'Employee'):
            user = SimpleNamespace(role=role, is_authenticated=True, pk=2)
            with patch('goals.permissions.is_hr', return_value=False):
                self.assertEqual(self.call(SurveySettingsView, 'get', user).status_code, 403)

    def test_hr_reads_and_changes_the_frequency(self):
        from burnout.views import SurveySettingsView
        user = self.hr()
        with patch('goals.permissions.is_hr', return_value=True):
            self.assertEqual(self.call(SurveySettingsView, 'get', user).data['frequency'], 'quarterly')
            response = self.call(SurveySettingsView, 'put', user, {'frequency': 'semiannual'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(user.org.survey_frequency, 'semiannual')
        user.org.save.assert_called_once()

    def test_unknown_frequency_is_refused(self):
        from burnout.views import SurveySettingsView
        user = self.hr()
        with patch('goals.permissions.is_hr', return_value=True):
            response = self.call(SurveySettingsView, 'put', user, {'frequency': 'weekly'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(user.org.survey_frequency, 'quarterly')

    def test_send_works_only_in_manual_mode(self):
        from burnout.views import SurveySendView
        with patch('goals.permissions.is_hr', return_value=True):
            auto = self.hr('monthly')
            self.assertEqual(self.call(SurveySendView, 'post', auto).status_code, 400)
            manual = self.hr('manual')
            response = self.call(SurveySendView, 'post', manual)
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(manual.org.survey_opened_on)
