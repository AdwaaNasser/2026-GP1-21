from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts import skills


class CleanSkillsTests(SimpleTestCase):
    valid = {1, 2, 3}

    def test_good_list(self):
        rows, problems = skills.clean_skills(
            [{'skill': 1, 'level': 'beginner'}, {'skill': 2, 'level': 'expert'}], self.valid)
        self.assertEqual(rows, [(1, 'beginner'), (2, 'expert')])
        self.assertEqual(problems, [])

    def test_empty_list_clears_the_skills(self):
        self.assertEqual(skills.clean_skills([], self.valid), ([], []))

    def test_bad_lists(self):
        bad = [
            None, 'x', {'skill': 1},
            [{'skill': 99, 'level': 'beginner'}],                      # not in the list
            [{'skill': 'Python', 'level': 'beginner'}],                # free text
            [{'skill': True, 'level': 'beginner'}],
            [{'skill': 1, 'level': 'master'}],                         # unknown level
            [{'skill': 1}],                                            # no level
            [{'skill': 1, 'level': 'beginner'}, {'skill': 1, 'level': 'advanced'}],
            ['x'],
        ]
        for items in bad:
            self.assertTrue(skills.clean_skills(items, self.valid)[1], items)

    def test_levels_match_the_recommendation_rules(self):
        from recommendations.rules import SKILL_LEVELS
        self.assertEqual(set(skills.LEVELS), set(SKILL_LEVELS))


class SkillViewTests(SimpleTestCase):
    def call(self, view, method, role, data=None, **kwargs):
        factory = APIRequestFactory()
        request = factory.get('/x/') if method == 'get' else getattr(factory, method)('/x/', data, format='json')
        force_authenticate(request, user=SimpleNamespace(role=role, is_authenticated=True, pk=5, org_id=1, department='IT'))
        return view.as_view()(request, **kwargs)

    def test_only_managers_add_a_skill_to_the_list(self):
        self.assertEqual(self.call(skills.SkillCatalogView, 'post', 'Employee', {'name': 'Go'}).status_code, 403)
        self.assertEqual(self.call(skills.SkillCatalogView, 'post', 'HR', {'name': 'Go'}).status_code, 403)

    def test_duplicate_or_empty_skill_name_is_refused(self):
        with patch.object(skills, 'Skill') as table:
            table.objects.filter.return_value.exists.return_value = True
            self.assertEqual(self.call(skills.SkillCatalogView, 'post', 'Manager', {'name': 'python'}).status_code, 400)
            self.assertEqual(self.call(skills.SkillCatalogView, 'post', 'Manager', {'name': '  '}).status_code, 400)
        table.objects.create.assert_not_called()

    def test_new_skill_is_added(self):
        with patch.object(skills, 'Skill') as table:
            table.objects.filter.return_value.exists.return_value = False
            table.objects.create.return_value = SimpleNamespace(pk=9, name='Go')
            response = self.call(skills.SkillCatalogView, 'post', 'Manager', {'name': ' Go '})
        self.assertEqual(response.status_code, 201)
        table.objects.create.assert_called_once_with(name='Go')

    def test_only_employees_have_their_own_skills(self):
        for role in ('Manager', 'HR'):
            self.assertEqual(self.call(skills.MySkillsView, 'get', role).status_code, 403)
            self.assertEqual(self.call(skills.MySkillsView, 'put', role, {'skills': []}).status_code, 403)

    def test_employee_saves_skills(self):
        saved = [{'skill': 1, 'name': 'SQL', 'level': 'advanced'}]
        with patch.object(skills.Employee, 'objects') as employees, \
                patch.object(skills, 'replace_skills', return_value=(saved, [])) as replace:
            employees.filter.return_value.first.return_value = SimpleNamespace(pk=5)
            response = self.call(skills.MySkillsView, 'put', 'Employee', {'skills': [{'skill': 1, 'level': 'advanced'}]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'skills': saved})
        replace.assert_called_once()

    def test_manager_can_only_change_their_own_team(self):
        team = [SimpleNamespace(pk=7)]
        with patch.object(skills.recommendation_services, 'team_of', return_value=team):
            self.assertEqual(self.call(skills.TeamMemberSkillsView, 'get', 'Manager', employee_id=8).status_code, 404)
            self.assertEqual(self.call(skills.TeamMemberSkillsView, 'put', 'Manager', {'skills': []}, employee_id=8).status_code, 404)
        self.assertEqual(self.call(skills.TeamMemberSkillsView, 'get', 'Employee', employee_id=7).status_code, 404)
