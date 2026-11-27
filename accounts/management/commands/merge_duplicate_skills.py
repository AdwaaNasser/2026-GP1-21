"""Merge skills that are the same skill written differently.

    python manage.py merge_duplicate_skills          # shows what would change
    python manage.py merge_duplicate_skills --apply  # merges them

For each group of duplicates, the most used spelling is kept. Employee and task
skills are moved to it; if someone already has the kept skill, the higher level
stays. Nothing else in the database changes.
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import EmployeeSkill, Skill, TaskSkill
from accounts.skill_names import clean_name, skill_key

LEVELS = ['beginner', 'intermediate', 'advanced', 'expert']


def level_rank(level):
    text = str(level or '').strip().lower()
    return LEVELS.index(text) if text in LEVELS else -1


def higher_level(first, second):
    return first if level_rank(first) >= level_rank(second) else second


def move_records(model, owner_field, duplicate, keep):
    """Point every record of `duplicate` at `keep`, keeping the higher level."""
    moved = 0
    for record in list(model.objects.filter(skill=duplicate)):
        owner_id = getattr(record, f'{owner_field}_id')
        target = model.objects.filter(**{f'{owner_field}_id': owner_id}, skill=keep).first()
        if target is not None:
            best = higher_level(target.skill_level, record.skill_level)
            model.objects.filter(**{f'{owner_field}_id': owner_id}, skill=keep).update(skill_level=best)
        else:
            model.objects.create(**{f'{owner_field}_id': owner_id}, skill=keep, skill_level=record.skill_level)
        model.objects.filter(**{f'{owner_field}_id': owner_id}, skill=duplicate).delete()
        moved += 1
    return moved


class Command(BaseCommand):
    help = 'Merge skills that differ only in spelling (case, spaces, dots, short forms).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Merge them. Without it, only shows the plan.')

    def handle(self, *args, **options):
        groups = defaultdict(list)
        for skill in Skill.objects.order_by('skill_id'):
            groups[skill_key(skill.name)].append(skill)
        duplicates = {key: skills for key, skills in groups.items() if key and len(skills) > 1}

        if not duplicates:
            self.stdout.write(self.style.SUCCESS('No duplicate skills found.'))
            return

        def usage(skill):
            return skill.employee_records.count() + skill.task_records.count()

        with transaction.atomic():
            for skills in duplicates.values():
                keep = max(skills, key=lambda skill: (usage(skill), -skill.skill_id))
                others = [skill for skill in skills if skill.pk != keep.pk]
                names = ', '.join(f'"{skill.name}"' for skill in others)
                self.stdout.write(f'Keep "{clean_name(keep.name)}" (id {keep.pk}), merge {names}')
                if not options['apply']:
                    continue
                if keep.name != clean_name(keep.name):
                    keep.name = clean_name(keep.name)
                    keep.save(update_fields=['name'])
                for duplicate in others:
                    move_records(EmployeeSkill, 'employee', duplicate, keep)
                    move_records(TaskSkill, 'task', duplicate, keep)
                    duplicate.delete()

        if options['apply']:
            self.stdout.write(self.style.SUCCESS(f'Merged {len(duplicates)} group(s).'))
        else:
            self.stdout.write('Nothing changed. Run again with --apply to merge.')