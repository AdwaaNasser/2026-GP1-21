from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from . import bat, services, surveys
from .views import BatSurveyView, BurnoutPredictionView, DepartmentBurnoutView, TeamBurnoutView

KEYS = {'status', 'score', 'level', 'top_factors', 'missing_inputs', 'predicted_at'}


class ServiceTests(SimpleTestCase):
    def test_predict_shape(self):
        result = services.predict(SimpleNamespace(pk=1))
        self.assertEqual(set(result), KEYS)
        self.assertEqual(result['status'], 'ok')
        self.assertTrue(0 <= result['score'] <= 10)
        self.assertIn(result['level'], services.LEVELS)
        for f in result['top_factors']:
            self.assertEqual(set(f), {'name', 'direction', 'contribution'})
            self.assertIn(f['direction'], ('increases', 'decreases'))

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
                patch('burnout.views.services.can_view', return_value=self.employee()):
            response = self.call(user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(KEYS | {'employee'}, set(response.data))

    def test_hr_allowed(self):
        user = SimpleNamespace(role='HR', is_authenticated=True, pk=9)
        with patch('burnout.views.is_manager', return_value=False), \
                patch('burnout.views.services.can_view', return_value=self.employee()):
            self.assertEqual(self.call(user).status_code, 200)


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

    def test_default_is_monthly(self):
        self.assertEqual(surveys.PERIOD_MONTHS, 1)


class SurveySaveTests(SimpleTestCase):
    """No database: the table access is replaced by mocks."""
    employee = SimpleNamespace(pk=7)
    answers = [5, 5, 5, 1, 1, 1, 3, 3, 3, 2, 2, 2]

    def test_saves_one_row_with_the_scores(self):
        row = SimpleNamespace(submission_date=date(2026, 11, 12))
        with patch.object(surveys, 'transaction', MagicMock()), \
                patch.object(surveys, 'Employee', MagicMock()), \
                patch.object(surveys, 'submission_in_period', return_value=None), \
                patch.object(surveys, 'BurnoutSurvey') as table:
            table.objects.create.return_value = row
            result = surveys.submit(self.employee, self.answers, today=date(2026, 11, 12))
        table.objects.create.assert_called_once_with(
            employee_id=7,
            submission_date=date(2026, 11, 12),
            exhaustion_score=Decimal('5.0'),
            mental_distance_score=Decimal('1.0'),
            cognitive_impairment_score=Decimal('3.0'),
            emotional_impairment_score=Decimal('2.0'),
            overall_score=Decimal('2.75'),
        )
        self.assertEqual(result, {'status': 'submitted', 'submitted_on': '2026-11-12', 'next_available': '2026-12-01'})
        self.assertNotIn('score', ' '.join(result))

    def test_second_survey_in_the_period_is_refused_and_nothing_is_saved(self):
        with patch.object(surveys, 'transaction', MagicMock()), \
                patch.object(surveys, 'Employee', MagicMock()), \
                patch.object(surveys, 'submission_in_period', return_value=SimpleNamespace()), \
                patch.object(surveys, 'BurnoutSurvey') as table:
            with self.assertRaises(surveys.AlreadySubmitted):
                surveys.submit(self.employee, self.answers, today=date(2026, 11, 12))
        table.objects.create.assert_not_called()

    def test_invalid_answers_save_nothing(self):
        with patch.object(surveys, 'BurnoutSurvey') as table:
            with self.assertRaises(ValueError):
                surveys.submit(self.employee, [1] * 5)
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
                patch('burnout.views.surveys.submit', return_value=status) as submit:
            response = self.call('post', self.user(), {'answers': [3] * 12})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data, status)
        submit.assert_called_once()

    def test_post_twice_in_a_period_is_409(self):
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit', side_effect=surveys.AlreadySubmitted):
            self.assertEqual(self.call('post', self.user(), {'answers': [3] * 12}).status_code, 409)

    def test_bad_answers_are_400_and_nothing_is_saved(self):
        with patch('burnout.views.employee_of', return_value=SimpleNamespace(pk=7)), \
                patch('burnout.views.surveys.submit') as submit:
            self.assertEqual(self.call('post', self.user(), {'answers': [3] * 5}).status_code, 400)
            self.assertEqual(self.call('post', self.user(), {}).status_code, 400)
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
                patch('burnout.views.services.team_of', return_value=team) as team_of:
            response = self.call(user)
        team_of.assert_called_once_with(user)
        self.assertEqual(response.status_code, 200)
        members = response.data['members']
        self.assertEqual([m['id'] for m in members], [10, 11])
        for m in members:
            self.assertTrue({'id', 'first_name', 'last_name', 'job_title'} | KEYS <= set(m))

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
