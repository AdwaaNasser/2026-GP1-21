from datetime import date

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Organization
from .views import _create_account


@override_settings(ROOT_URLCONF='accounts.urls')
class ProfilePageTests(TestCase):
    """The profile page reads /employees/<own id>/ for every role."""

    def setUp(self):
        self.org = Organization.objects.create(name='Bayyinah Co')
        self.hr, _ = _create_account(
            email='hr@co.test', first_name='Hala', last_name='HR', password='Pass12345',
            role='HR', organization=self.org, hire_date=date(2024, 1, 1), job_title='HR Lead')
        self.manager, manager_record = _create_account(
            email='m@co.test', first_name='Majed', last_name='M', password='Pass12345',
            role='Manager', organization=self.org, hire_date=date(2024, 1, 1), job_title='Team Lead')
        self.employee, _ = _create_account(
            email='e@co.test', first_name='Eman', last_name='E', password='Pass12345',
            role='Employee', organization=self.org, hire_date=date(2024, 2, 1), job_title='Developer',
            manager=self.manager.manager_record)

    def own_profile(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(reverse('employee-detail', args=[user.pk]))

    def test_every_role_sees_their_own_profile(self):
        for user in (self.hr, self.manager, self.employee):
            response = self.own_profile(user)
            self.assertEqual(response.status_code, 200, user.email)
            self.assertEqual(response.data['email'], user.email)

    def test_employee_profile_shows_the_manager(self):
        self.assertEqual(self.own_profile(self.employee).data['manager']['id'], self.manager.pk)