from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from . import services
from .views import BurnoutPredictionView

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
