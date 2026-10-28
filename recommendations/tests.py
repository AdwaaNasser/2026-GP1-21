from datetime import date, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from accounts.models import (
    Employee, EmployeeSkill, LeaveRequest, LeaveType, Manager, MeetingSchedule, Organization,
    Skill, Task, TaskSkill, User,
)

from . import rules, semantic

# A Sunday, so the period Sun -> Tue has 3 working days = 24 hours.
START = date(2026, 11, 1)
END = date(2026, 11, 3)


class RulesTests(SimpleTestCase):
    def test_level_value(self):
        self.assertEqual(rules.level_value('Advanced'), 3)
        self.assertEqual(rules.level_value(' expert '), 4)
        self.assertEqual(rules.level_value(None), 1)   # missing = lowest
        self.assertEqual(rules.level_value('guru'), 1)  # unknown = lowest

    def test_weekend_is_not_working_time(self):
        self.assertEqual(rules.working_days(START, END), 3)
        friday, saturday = date(2026, 11, 6), date(2026, 11, 7)
        self.assertEqual(rules.working_days(friday, saturday), 0)
        self.assertEqual(rules.capacity_hours(START, END), 24)

    def test_skill_gaps(self):
        required = [(1, 'Python', 2), (2, 'SQL', 1)]
        self.assertEqual(rules.skill_gaps({1: 3, 2: 1}, required), [])
        self.assertEqual(rules.skill_gaps({1: 1, 2: 1}, required), ['Python level too low'])
        self.assertEqual(rules.skill_gaps({}, required), ['missing Python', 'missing SQL'])

    def test_exclusion_reasons(self):
        self.assertIn('leave', rules.exclusion_reason(True, [], 24, 6))
        self.assertIn('Skills', rules.exclusion_reason(False, ['missing SQL'], 24, 6))
        self.assertIn('Not enough time', rules.exclusion_reason(False, [], 2, 6))
        self.assertIsNone(rules.exclusion_reason(False, [], 6, 6))

    def test_score_is_between_0_and_1_and_comes_with_reasons(self):
        required = [(1, 'Python', 2)]
        best, reasons = rules.score({1: 4}, required, [], 5, 5, 0, 24)
        worst, _ = rules.score({1: 1}, required, [], 0, 5, 24, 24)
        self.assertEqual(best, 1.0)
        self.assertGreaterEqual(worst, 0)
        self.assertEqual(len(reasons), 3)

    def test_meaning_adds_a_factor_and_a_reason(self):
        required = [(1, 'Python', 2)]
        without, reasons = rules.score({1: 3}, required, [], 1, 2, 0, 24)
        similar, more_reasons = rules.score({1: 3}, required, [], 1, 2, 0, 24, meaning=0.9)
        unrelated, _ = rules.score({1: 3}, required, [], 1, 2, 0, 24, meaning=0.0)
        self.assertGreater(similar, unrelated)
        self.assertEqual(len(more_reasons), len(reasons) + 1)
        self.assertIn('90% similar', more_reasons[-1])

    def test_lighter_workload_ranks_higher_when_all_else_is_equal(self):
        required = [(1, 'Python', 2)]
        free, _ = rules.score({1: 3}, required, [], 1, 2, 0, 24)
        busy, _ = rules.score({1: 3}, required, [], 1, 2, 18, 24)
        self.assertGreater(free, busy)


class SemanticTests(SimpleTestCase):
    def test_nothing_to_compare_gives_no_scores(self):
        self.assertEqual(semantic.similarities('', {1: 'Built a report'}), {})
        self.assertEqual(semantic.similarities('Sales report', {1: '   '}), {})

    def test_missing_model_does_not_break_the_recommendation(self):
        with patch.object(semantic, 'get_model', side_effect=ImportError):
            self.assertEqual(semantic.similarities('Sales report', {1: 'Built a report'}), {})


def make_user(org, email, role):
    return User.objects.create_user(
        email=email, password='Pass12345', org=org, hire_date=date(2024, 1, 1),
        first_name=email.split('@')[0].title(), last_name='Test', job_title=role,
    )


@override_settings(ROOT_URLCONF='recommendations.urls')
class RecommendApiTests(APITestCase):
    """manager1's team: sara, huda, noura, maha, reem. manager2's team: other."""

    @classmethod
    def setUpTestData(cls):
        org = Organization.objects.create(name='Acme')
        cls.manager1 = make_user(org, 'manager1@acme.test', 'Manager')
        cls.manager2 = make_user(org, 'manager2@acme.test', 'Manager')
        cls.hr = make_user(org, 'hr@acme.test', 'HR')
        boss1 = Manager.objects.create(user=cls.manager1)
        boss2 = Manager.objects.create(user=cls.manager2)

        def employee(name, boss):
            user = make_user(org, f'{name}@acme.test', 'Employee')
            return Employee.objects.create(user=user, system_role='Employee', manager=boss)

        cls.sara = employee('sara', boss1)
        cls.huda = employee('huda', boss1)
        cls.noura = employee('noura', boss1)
        cls.maha = employee('maha', boss1)
        cls.reem = employee('reem', boss1)
        cls.other = employee('other', boss2)

        cls.python = Skill.objects.create(name='Python')
        cls.react = Skill.objects.create(name='React')
        for person, level in [(cls.sara, 'advanced'), (cls.huda, 'intermediate'),
                              (cls.noura, 'expert'), (cls.reem, 'expert'), (cls.other, 'expert')]:
            EmployeeSkill.objects.create(employee=person, skill=cls.python, skill_level=level)
        EmployeeSkill.objects.create(employee=cls.maha, skill=cls.react, skill_level='expert')

        def task(person, hours, status='todo', start=START, end=END):
            return Task.objects.create(title='t', employee=person, estimated_hours=hours,
                                       status=status, start_date=start, due_date=end)

        task(cls.noura, 22)            # 2h left in the period
        task(cls.sara, 10)             # busier than huda
        task(cls.huda, 40, status='completed')                   # finished: not workload
        task(cls.huda, 40, start=date(2026, 12, 1), end=date(2026, 12, 5))  # other period
        for _ in range(3):             # huda's experience with Python
            done = task(cls.huda, 2, status='completed', start=date(2026, 9, 1), end=date(2026, 9, 2))
            TaskSkill.objects.create(task=done, skill=cls.python)

        annual = LeaveType.objects.create(name='Annual')
        LeaveRequest.objects.create(employee=cls.reem, leave_type=annual, status='Approved',
                                    start_date=date(2026, 10, 30), end_date=date(2026, 11, 5))
        LeaveRequest.objects.create(employee=cls.sara, leave_type=annual, status='Pending',
                                    start_date=START, end_date=END)  # not approved: ignored

    def ask(self, user, **changes):
        self.client.force_authenticate(user)
        body = {
            'skills': [{'skill_id': self.python.pk, 'level': 'intermediate'}],
            'start_date': str(START), 'due_date': str(END), 'estimated_hours': '6',
        }
        body.update(changes)
        return self.client.post(reverse('recommend-employees'), body, format='json')

    def test_manager_gets_eligible_team_members_ranked(self):
        response = self.ask(self.manager1)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['eligible_found'])
        names = [r['first_name'] for r in response.data['recommended']]
        self.assertEqual(names, ['Huda', 'Sara'])  # huda: free + more experience
        self.assertTrue(all(r['reasons'] for r in response.data['recommended']))

    def test_excluded_members_come_with_the_reason(self):
        excluded = {e['first_name']: e['reason'] for e in self.ask(self.manager1).data['excluded']}
        self.assertIn('Not enough time', excluded['Noura'])
        self.assertIn('missing Python', excluded['Maha'])
        self.assertIn('leave', excluded['Reem'])

    def test_only_the_managers_own_team_is_considered(self):
        data = self.ask(self.manager1).data
        everyone = [p['first_name'] for p in data['recommended'] + data['excluded']]
        self.assertNotIn('Other', everyone)
        data = self.ask(self.manager2).data
        self.assertEqual([r['first_name'] for r in data['recommended']], ['Other'])

    def test_finished_tasks_and_other_periods_are_not_workload(self):
        huda = self.ask(self.manager1).data['recommended'][0]
        self.assertIn('Workload 0%', huda['reasons'][2])

    def test_higher_level_excludes_lower_skilled_members(self):
        data = self.ask(self.manager1, skills=[
            {'skill_id': self.python.pk, 'level': 'advanced'},
        ]).data
        excluded = {e['first_name']: e['reason'] for e in data['excluded']}
        self.assertIn('Python level too low', excluded['Huda'])

    def test_similar_past_work_raises_the_score(self):
        # Pretend Sentence Transformers found sara's past work very close to the task.
        before = {r['first_name']: r['score'] for r in self.ask(self.manager1).data['recommended']}
        fake = {self.sara.pk: 1.0, self.huda.pk: 0.0}
        with patch('recommendations.services.semantic.similarities', return_value=fake) as similarities:
            data = self.ask(self.manager1, title='Sales dashboard', description='Charts of revenue').data
        after = {r['first_name']: r for r in data['recommended']}
        self.assertEqual(similarities.call_args.args[0], 'Sales dashboard. Charts of revenue')
        self.assertGreater(after['Sara']['score'], before['Sara'])
        self.assertLess(after['Huda']['score'], before['Huda'])
        self.assertIn('100% similar', after['Sara']['reasons'][-1])

    def test_without_the_model_ranking_still_works(self):
        with patch.object(semantic, 'get_model', side_effect=ImportError):
            data = self.ask(self.manager1, title='Sales dashboard').data
        self.assertEqual([r['first_name'] for r in data['recommended']], ['Huda', 'Sara'])

    def test_partial_leave_only_removes_those_days(self):
        annual = LeaveType.objects.get(name='Annual')
        LeaveRequest.objects.create(employee=self.huda, leave_type=annual, status='approved',
                                    start_date=date(2026, 11, 2), end_date=date(2026, 11, 3))
        data = self.ask(self.manager1).data  # huda keeps Sunday: 8h, the task needs 6h
        huda = next(r for r in data['recommended'] if r['first_name'] == 'Huda')
        self.assertIn('8h available', huda['reasons'][-1])
        excluded = {e['first_name']: e['reason'] for e in self.ask(self.manager1, estimated_hours='9').data['excluded']}
        self.assertIn('Not enough time', excluded['Huda'])

    def test_meetings_count_as_busy_time(self):
        from datetime import time
        MeetingSchedule.objects.create(employee=self.huda, date=START,
                                       starts_at=time(9, 0), ends_at=time(13, 0))
        huda = self.ask(self.manager1).data['recommended'][0]
        self.assertIn('20h available', huda['reasons'][-1])

    def test_meetings_on_leave_days_are_not_counted_twice(self):
        from datetime import time
        annual = LeaveType.objects.get(name='Annual')
        LeaveRequest.objects.create(employee=self.huda, leave_type=annual, status='approved',
                                    start_date=date(2026, 11, 2), end_date=date(2026, 11, 2))
        MeetingSchedule.objects.create(employee=self.huda, date=date(2026, 11, 2),
                                       starts_at=time(9, 0), ends_at=time(11, 0))
        huda = self.ask(self.manager1).data['recommended'][0]
        self.assertIn('16h available', huda['reasons'][-1])  # 24h - one leave day, no meeting

    def test_optional_skills_rank_but_never_exclude(self):
        EmployeeSkill.objects.create(employee=self.huda, skill=self.react, skill_level='advanced')
        data = self.ask(self.manager1, skills=[
            {'skill_id': self.python.pk, 'level': 'intermediate'},
            {'skill_id': self.react.pk, 'required': False},
        ]).data
        reasons = {r['first_name']: r['reasons'] for r in data['recommended']}
        self.assertIn('Optional skills: React', reasons['Huda'])
        self.assertIn('Optional skills: none', reasons['Sara'])  # still recommended
        only_optional = self.ask(self.manager1, skills=[{'skill_id': self.react.pk, 'required': False}]).data
        names = [r['first_name'] for r in only_optional['recommended']]
        self.assertIn('Sara', names)  # has no React, but it is optional

    def test_no_eligible_member_means_manual_assignment(self):
        data = self.ask(self.manager1, estimated_hours='500').data
        self.assertFalse(data['eligible_found'])
        self.assertEqual(data['recommended'], [])

    def test_bad_input_is_refused(self):
        bad = [
            {'due_date': '2026-10-01'},
            {'estimated_hours': '0'},
            {'skills': [{'skill_id': self.python.pk, 'level': 'guru'}]},
            {'skills': [{'skill_id': 999999}]},
            {'skills': [{'skill_id': self.python.pk}, {'skill_id': self.python.pk}]},
        ]
        for changes in bad:
            self.assertEqual(self.ask(self.manager1, **changes).status_code, 400, changes)

    def test_only_managers_can_ask(self):
        self.assertEqual(self.ask(self.sara.user).status_code, 403)
        self.assertEqual(self.ask(self.hr).status_code, 403)
        response = APIClient().post(reverse('recommend-employees'), {}, format='json')
        self.assertIn(response.status_code, (401, 403))