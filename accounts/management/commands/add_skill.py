"""Add one skill to the catalogue (for the system administrator).

    python manage.py add_skill "Power Automate"

Employees and managers cannot create skills; they only choose from the catalogue.
If the skill already exists in any spelling, nothing is added. A close name is shown
so a typo does not become a second skill.
"""
from django.core.management.base import BaseCommand, CommandError

from accounts.skill_names import get_or_create_skill, similar_skill_names


class Command(BaseCommand):
    help = 'Add one skill to the controlled skills catalogue.'

    def add_arguments(self, parser):
        parser.add_argument('name')
        parser.add_argument('--force', action='store_true', help='Add it even if a similar name exists.')

    def handle(self, *args, **options):
        similar = similar_skill_names(options['name'])
        if similar and not options['force']:
            raise CommandError(f'Similar skills already exist: {", ".join(similar)}. Use --force to add it anyway.')
        try:
            skill, created = get_or_create_skill(options['name'])
        except ValueError as error:
            raise CommandError(str(error)) from error
        if created:
            self.stdout.write(self.style.SUCCESS(f'Added "{skill.name}" (id {skill.pk}).'))
        else:
            self.stdout.write(f'"{skill.name}" is already in the catalogue (id {skill.pk}). Nothing added.')