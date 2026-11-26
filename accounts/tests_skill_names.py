from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from .models import Skill
from .skill_names import get_or_create_skill, similar_skill_names, skill_key


class SkillNameTests(TestCase):
    def test_same_skill_in_any_spelling_has_one_key(self):
        self.assertEqual(skill_key('Django'), skill_key('  DJANGO  '))
        self.assertEqual(skill_key('React.js'), skill_key('ReactJS'))
        self.assertEqual(skill_key('JS'), skill_key('JavaScript'))
        self.assertNotEqual(skill_key('C++'), skill_key('C#'))

    def test_existing_skill_is_reused(self):
        django = Skill.objects.create(name='Django')
        skill, created = get_or_create_skill('  django ')
        self.assertFalse(created)
        self.assertEqual(skill.pk, django.pk)
        self.assertEqual(Skill.objects.count(), 1)

    def test_new_skill_is_saved_tidy(self):
        skill, created = get_or_create_skill('  Machine   learning ')
        self.assertTrue(created)
        self.assertEqual(skill.name, 'Machine learning')

    def test_typo_gets_a_suggestion(self):
        Skill.objects.create(name='Django')
        self.assertEqual(similar_skill_names('Djnago'), ['Django'])

    def test_merge_command_only_reports_without_apply(self):
        Skill.objects.create(name='Django')
        Skill.objects.create(name='django ')
        out = StringIO()
        call_command('merge_duplicate_skills', stdout=out)
        self.assertEqual(Skill.objects.count(), 2)
        call_command('merge_duplicate_skills', '--apply', stdout=out)
        self.assertEqual(Skill.objects.count(), 1)


class SkillCatalogueImportTests(TestCase):
    def write(self, name, text):
        import tempfile
        path = Path(tempfile.mkdtemp()) / name
        path.write_text(text, encoding='utf-8')
        return str(path)

    def test_import_checks_esco_and_skips_missing(self):
        esco = self.write('skills_en.csv', (
            'conceptUri,preferredLabel,altLabels\n'
            'u1,Python (computer programming),\n'
            'u2,manage budgets,"budget management\nbudgeting"\n'
        ))
        catalogue = self.write('list.txt', (
            '## Test\n'
            'Python | Python (computer programming)\n'
            'Budget management\n'
            'Made-up skill | not an esco label\n'
        ))
        out = StringIO()
        call_command('import_skill_catalogue', '--esco', esco, '--list', catalogue, stdout=out)
        self.assertEqual(sorted(Skill.objects.values_list('name', flat=True)), ['Budget management', 'Python'])
        self.assertIn('Made-up skill', out.getvalue())
        call_command('import_skill_catalogue', '--esco', esco, '--list', catalogue, stdout=out)
        self.assertEqual(Skill.objects.count(), 2)  # running twice adds nothing

    def test_add_skill_refuses_duplicates_and_typos(self):
        from django.core.management.base import CommandError
        Skill.objects.create(name='Django')
        call_command('add_skill', 'DJANGO ', stdout=StringIO())
        self.assertEqual(Skill.objects.count(), 1)
        with self.assertRaises(CommandError):
            call_command('add_skill', 'Djnago', stdout=StringIO())