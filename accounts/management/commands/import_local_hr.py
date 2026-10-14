import sqlite3

from django.conf import settings
from django.contrib.auth.hashers import identify_hasher
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Department, SystemUser


class Command(BaseCommand):
    help = 'Copy the local SQLite HR account into PostgreSQL without exposing its password.'

    def handle(self, *args, **options):
        source_path = settings.BASE_DIR / 'db.sqlite3'
        if not source_path.exists():
            raise CommandError(f'Local SQLite database not found: {source_path}')

        with sqlite3.connect(source_path) as source:
            account = source.execute(
                '''
                SELECT email, full_name, password, role, job_title
                FROM accounts_systemuser
                WHERE role = ?
                ORDER BY is_superuser DESC, id
                LIMIT 1
                ''',
                ['HR Professional'],
            ).fetchone()

        if account is None:
            raise CommandError('No local HR Professional account was found.')

        email, full_name, password_hash, _role, job_title = account
        if not password_hash or password_hash.startswith('!'):
            raise CommandError(
                'The local HR account has no usable password hash; set a password before importing.'
            )
        try:
            identify_hasher(password_hash)
        except ValueError as error:
            raise CommandError(
                'The local HR password hash is not supported by Django.'
            ) from error

        with transaction.atomic(using='default'):
            existing = SystemUser.objects.using('default').filter(
                email__iexact=email
            ).first()
            if existing:
                self.stdout.write(
                    self.style.WARNING(
                        'An account with the HR email already exists in PostgreSQL; '
                        'left it unchanged.'
                    )
                )
                return

            try:
                department = Department.objects.using('default').get(
                    name='Human Resources'
                )
            except Department.DoesNotExist as error:
                raise CommandError(
                    'The PostgreSQL Human Resources department was not found.'
                ) from error

            name_parts = full_name.strip().split(maxsplit=1)
            if not name_parts:
                raise CommandError('The local HR account has no name.')
            if any(len(part) > 100 for part in name_parts):
                raise CommandError(
                    'The local HR account name does not fit the existing PostgreSQL columns.'
                )

            user = SystemUser(
                email=email,
                password=password_hash,
                first_name=name_parts[0],
                last_name=name_parts[1] if len(name_parts) > 1 else '',
                role='HR',
                job_title=job_title,
                hire_date=timezone.localdate(),
                department=department,
            )
            user.save(using='default', force_insert=True)

        self.stdout.write(
            self.style.SUCCESS(
                'Imported the local HR account into the PostgreSQL Human Resources department. '
                'Its existing Django password hash was preserved.'
            )
        )
