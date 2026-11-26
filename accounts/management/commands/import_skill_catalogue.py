"""Import the controlled skills catalogue.

    python manage.py import_skill_catalogue --esco skills_en.csv --dry-run
    python manage.py import_skill_catalogue --esco skills_en.csv

Reads accounts/data/skill_catalogue.txt (or --list), checks each line against the
official ESCO skills file (skills_en.csv from https://esco.ec.europa.eu, English, CSV),
and adds the skills that are not in the Skills table yet. Existing skills are reused in
any spelling (skill_key), so running it twice adds nothing.

Without --esco, the list is imported as it is, without checking it against ESCO.
"""
import csv
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.skill_names import clean_name, get_or_create_skill, skill_key

DEFAULT_LIST = Path(__file__).resolve().parents[2] / 'data' / 'skill_catalogue.txt'


def read_list(path):
    """[(display name, ESCO label or '')] from the catalogue file."""
    rows = []
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, _, label = (part.strip() for part in line.partition('|'))
        rows.append((clean_name(name), label or name))
    return rows


def without_brackets(text):
    """'Python (computer programming)' -> 'Python'."""
    return re.sub(r'\s*\([^)]*\)', '', text)


def read_esco(path):
    """{comparison key: ESCO preferred label}, from preferred and alternative labels."""
    labels = {}
    with open(path, encoding='utf-8', newline='') as handle:
        reader = csv.DictReader(handle)
        if 'preferredLabel' not in (reader.fieldnames or []):
            raise CommandError('This is not the ESCO skills file: there is no preferredLabel column.')
        for row in reader:
            preferred = row['preferredLabel'].strip()
            names = [preferred, without_brackets(preferred)]
            names += [alt for alt in (row.get('altLabels') or '').splitlines() if alt.strip()]
            for name in names:
                labels.setdefault(skill_key(name), preferred)
    return labels


class Command(BaseCommand):
    help = 'Import the controlled skills catalogue, checked against ESCO.'

    def add_arguments(self, parser):
        parser.add_argument('--esco', help='Path to the ESCO skills_en.csv file.')
        parser.add_argument('--list', default=str(DEFAULT_LIST), help='Catalogue file to import.')
        parser.add_argument('--dry-run', action='store_true', help='Show what would happen and change nothing.')

    def handle(self, *args, **options):
        rows = read_list(options['list'])
        esco = read_esco(options['esco']) if options['esco'] else None
        if esco is None:
            self.stdout.write(self.style.WARNING('No --esco file: the list is not checked against ESCO.'))

        missing, created, reused = [], 0, 0
        with transaction.atomic():
            for name, label in rows:
                if esco is not None and skill_key(label) not in esco:
                    missing.append(f'{name} | {label}')
                    continue
                if options['dry_run']:
                    continue
                _, was_created = get_or_create_skill(name)
                created += was_created
                reused += not was_created

        if missing:
            self.stdout.write(self.style.WARNING(f'{len(missing)} line(s) not found in ESCO (not imported):'))
            for line in missing:
                self.stdout.write(f'  {line}')
        if options['dry_run']:
            self.stdout.write(f'Dry run: {len(rows) - len(missing)} skill(s) would be imported. Nothing changed.')
        else:
            self.stdout.write(self.style.SUCCESS(f'Added {created} new skill(s); {reused} were already in the catalogue.'))