"""Demo data for trying the KPI screens.

Everything is created inside its own organization, so it never mixes with
real data:

    python manage.py seed_demo_kpi            # add the demo data
    python manage.py seed_demo_kpi --employees 20   # a bigger demo team
    python manage.py seed_demo_kpi --remove   # delete only the demo data

Demo accounts (password: Demo12345):
    demo.hr@demo.test, demo.manager@demo.test,
    demo.employee1@demo.test, demo.employee2@demo.test
"""
import random
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from goals import rules

from accounts.models import (
    Employee, Evaluation, Goal, Manager, Organization, Project, Task, TaskGoal, User,
)

ORG_NAME = 'Bayyinah Demo (KPI test)'
HIRED = date(2022, 1, 1)
PASSWORD = 'Demo12345'


class Command(BaseCommand):
    help = 'Add (or with --remove, delete) demo data for the KPI screens.'

    def add_arguments(self, parser):
        parser.add_argument('--remove', action='store_true', help='Delete the demo data.')
        parser.add_argument(
            '--employees', type=int, default=2,
            help='How many demo employees to create (default 2, at most 60).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['remove']:
            return self.remove()
        return self.create(min(max(options['employees'], 2), 60))

    def remove(self):
        org = Organization.objects.filter(name=ORG_NAME).first()
        if org is None:
            self.stdout.write('No demo data found.')
            return
        users = User.objects.filter(org=org)
        employees = Employee.objects.filter(user__in=users)
        Evaluation.objects.filter(employee__in=employees).delete()
        Goal.objects.filter(manager__user__in=users).delete()
        Task.objects.filter(employee__in=employees).delete()
        Project.objects.filter(manager__user__in=users).delete()
        users.delete()
        org.delete()
        self.stdout.write(self.style.SUCCESS('Demo data deleted.'))

    def create(self, count=2):
        if Organization.objects.filter(name=ORG_NAME).exists():
            self.stdout.write('Demo data already exists. Use --remove first to rebuild it.')
            return
        org = Organization.objects.create(name=ORG_NAME)

        def account(email, name, role):
            first, _, last = name.partition(' ')
            user = User.objects.create_user(
                email=email, password=PASSWORD, org=org,
                first_name=first, last_name=last, department='Operations',
            )
            if role:
                Employee.objects.create(user=user, system_role=role, hire_date=HIRED)
            return user

        account('demo.hr@demo.test', 'Hala HR', 'HR')
        boss = account('demo.manager@demo.test', 'Mona Manager', 'Manager')
        manager = Manager.objects.create(user=boss)
        people = []
        for email, name in (
            ('demo.employee1@demo.test', 'Sara Employee'),
            ('demo.employee2@demo.test', 'Noor Employee'),
        ):
            user = account(email, name, 'Employee')
            Employee.objects.filter(pk=user.pk).update(manager=manager)
            people.append(Employee.objects.get(pk=user.pk))

        year = timezone.localdate().year
        project = Project.objects.create(title='Demo project', manager=manager)
        tasks = [  # (title, status, month)
            ('Prepare report', 'completed', 1),
            ('Review contracts', 'completed', 2),
            ('Client call', 'completed', 3),
            ('Update handbook', 'completed', 5),
            ('Plan workshop', 'completed', 8),
            ('Draft proposal', 'in_progress', 11),
        ]
        for employee in people:
            for title, status, month in tasks:
                Task.objects.create(
                    title=title, status=status, project=project, employee=employee,
                    due_date=date(year, month, 15), start_date=date(year, month, 1),
                    privacy='public', priority='medium', created_at=timezone.now(),
                )
        # Last year's finished evaluation, so the year-over-year charts have data.
        last = year - 1
        previous_results = [  # (annual target, annual achieved, Q4 target, Q4 achieved)
            (10, 8, 5, 6),
            (10, 9, 5, 4),
        ]
        for employee, (t1, a1, t2, a2) in zip(people, previous_results):
            rated = []
            for name, period, target, actual in (
                ('Delivery quality', 'annual', t1, a1),
                ('Year-end sprint', 'Q4', t2, a2),
            ):
                start, end = rules.period_dates(period, last)
                rating = rules.rating_for(rules.progress_percent(target, actual))
                rated.append((rating, 50))
                Goal.objects.create(
                    name=name, type='Manual', time_period=period, weight=50,
                    target_value=target, actual_value=actual, rating=rating,
                    period_start=start, period_end=end, evaluation_year=last,
                    manager=manager, employee=employee,
                )
            Evaluation.objects.create(
                employee=employee, evaluation_year=last,
                overall_score=rules.overall_score(rated), is_final=True,
            )
        if count > 2:
            self.add_more(org, manager, boss, count - 2)
        self.stdout.write(self.style.SUCCESS(
            f'Demo data created in organization "{ORG_NAME}". Password for all: {PASSWORD}'
        ))

    def add_more(self, org, first_manager, first_boss, extra):
        """More employees for a fuller picture: a second manager, goals with
        different results, tasks, and two earlier years of final scores."""
        rng = random.Random(7)
        year = timezone.localdate().year
        boss2 = User.objects.create_user(
            email='demo.manager2@demo.test', password=PASSWORD, org=org,
            first_name='Khalid', last_name='Manager',
        )
        Employee.objects.create(user=boss2, system_role='Manager', hire_date=HIRED)
        manager2 = Manager.objects.create(user=boss2)
        teams = [(first_manager, 'Operations'), (manager2, 'Engineering')]
        User.objects.filter(pk=first_boss.pk).update(department='Operations')
        User.objects.filter(pk=boss2.pk).update(department='Engineering')
        first_names = [
            'Layla', 'Omar', 'Reem', 'Fahad', 'Dana', 'Yousef', 'Nada', 'Saud',
            'Hessa', 'Talal', 'Joud', 'Majed', 'Rana', 'Badr', 'Lama', 'Nawaf',
            'Maha', 'Ziyad', 'Aisha', 'Turki', 'Salma', 'Rakan', 'Ghada', 'Faisal',
        ]
        last_names = ['Alharbi', 'Alotaibi', 'Alqahtani', 'Alghamdi', 'Alzahrani', 'Alshehri']
        project = Project.objects.create(title='Demo project 2', manager=manager2)
        for number in range(extra):
            manager, department = teams[number % 2]
            name = f'{first_names[number % len(first_names)]} {last_names[number % len(last_names)]}'
            first, _, last = name.partition(' ')
            user = User.objects.create_user(
                email=f'demo.staff{number + 1}@demo.test', password=PASSWORD, org=org,
                first_name=first, last_name=last, department=department,
            )
            Employee.objects.create(user=user, system_role='Employee', hire_date=HIRED)
            Employee.objects.filter(pk=user.pk).update(manager=manager)
            employee = Employee.objects.get(pk=user.pk)
            strength = rng.choice([0.55, 0.7, 0.85, 0.95, 1.1, 1.25])  # how well this person does
            self.add_tasks(employee, project, year, rng, strength)
            if number % 7 != 6:  # a few people have no goals yet
                self.add_current_goals(employee, manager, year, rng, strength)
            for back in (1, 2):
                self.add_final_year(employee, manager, year - back, rng, strength)

    def add_tasks(self, employee, project, year, rng, strength):
        for month in range(1, 12):
            done = rng.random() < min(strength, 0.95)
            Task.objects.create(
                title=f'Task {month}', status='completed' if done else 'in_progress',
                project=project, employee=employee,
                due_date=date(year, month, 15), start_date=date(year, month, 1),
                privacy='public', priority='medium', created_at=timezone.now(),
            )

    def add_current_goals(self, employee, manager, year, rng, strength):
        today = timezone.localdate()
        specs = [  # (name, type, period, weight, target)
            ('Delivery quality', 'Manual', 'annual', 40, 10),
            ('Customer follow-ups', 'Manual', 'Q1', 30, 8),
            ('Completed tasks', 'Task-based', 'annual', 30, 8),
        ]
        for name, kind, period, weight, target in specs:
            start, end = rules.period_dates(period, year)
            goal = Goal.objects.create(
                name=name, type=kind, time_period=period, weight=weight,
                target_value=target,
                actual_value=None if kind == 'Task-based' else round(target * strength * rng.uniform(0.8, 1.15), 1),
                period_start=start, period_end=end, evaluation_year=year,
                manager=manager, employee=employee,
            )
            if kind == 'Task-based':
                for task in Task.objects.filter(employee=employee, due_date__gte=start, due_date__lte=end):
                    TaskGoal.objects.create(task=task, goal=goal)

    def add_final_year(self, employee, manager, year, rng, strength):
        rated = []
        for name, period, weight in (('Delivery quality', 'annual', 60), ('Year-end sprint', 'Q4', 40)):
            target = 10
            actual = round(target * strength * rng.uniform(0.7, 1.2), 1)
            start, end = rules.period_dates(period, year)
            rating = rules.rating_for(rules.progress_percent(target, actual))
            rated.append((rating, weight))
            Goal.objects.create(
                name=name, type='Manual', time_period=period, weight=weight,
                target_value=target, actual_value=actual, rating=rating,
                period_start=start, period_end=end, evaluation_year=year,
                manager=manager, employee=employee,
            )
        Evaluation.objects.create(
            employee=employee, evaluation_year=year,
            overall_score=rules.overall_score(rated), is_final=True,
        )
