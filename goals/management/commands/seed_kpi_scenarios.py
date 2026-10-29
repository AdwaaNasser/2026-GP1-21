"""Many employees covering every KPI case, several times each.

Lives in its own organization, so it never touches real data or the other demo:

    python manage.py seed_kpi_scenarios                 # 40 employees, 3 managers
    python manage.py seed_kpi_scenarios --employees 60  # more people (10 to 90)
    python manage.py seed_kpi_scenarios --remove        # delete only this data

Accounts (password for all: Demo12345):
    kpi.hr@scen.test, kpi.manager1@scen.test ... kpi.manager3@scen.test,
    kpi.emp01@scen.test, kpi.emp02@scen.test, ...

The command prints which employee has which case. The cases repeat every 10
employees, so each one appears several times.
"""
import random
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import (
    Employee, Evaluation, Goal, Manager, Organization, Project, Task, TaskGoal, User,
)
from goals import rules

ORG_NAME = 'Bayyinah KPI Scenarios'
HIRED = date(2022, 1, 1)
PASSWORD = 'Demo12345'
FIRST = [
    'Layla', 'Omar', 'Reem', 'Fahad', 'Dana', 'Yousef', 'Nada', 'Saud', 'Hessa', 'Talal',
    'Joud', 'Majed', 'Rana', 'Badr', 'Lama', 'Nawaf', 'Maha', 'Ziyad', 'Aisha', 'Turki',
    'Salma', 'Rakan', 'Ghada', 'Faisal', 'Amal', 'Sultan', 'Retaj', 'Khalid', 'Shahad', 'Abdullah',
]
LAST = ['Alharbi', 'Alotaibi', 'Alqahtani', 'Alghamdi', 'Alzahrani', 'Alshehri', 'Aldosari', 'Almutairi']
DEPARTMENTS = ['Operations', 'Engineering', 'Sales']

CASES = [
    'No goals yet (2 past years)',
    'No goals and no history (brand new)',
    'Locked goals use the full 100% (no room to add)',
    'Locked goals use 60% (40% still free to set)',
    'Only upcoming goals (everything still editable)',
    'Mix: locked goal + upcoming goals',
    'High performer (ratings 4-5, 3 past years)',
    'Low performer (ratings 1-2, overdue goals without value)',
    'Task-based goals, tasks not linked yet',
    'Every rating 1 to 5 in one year',
]


class Command(BaseCommand):
    help = 'Create (or with --remove, delete) many employees that cover every KPI case.'

    def add_arguments(self, parser):
        parser.add_argument('--remove', action='store_true', help='Delete this data.')
        parser.add_argument('--employees', type=int, default=40, help='How many employees (10-90).')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['remove']:
            return self.remove()
        return self.create(min(max(options['employees'], 10), 90))

    def remove(self):
        org = Organization.objects.filter(name=ORG_NAME).first()
        if org is None:
            self.stdout.write('Nothing to remove.')
            return
        users = User.objects.filter(org=org)
        employees = Employee.objects.filter(user__in=users)
        Evaluation.objects.filter(employee__in=employees).delete()
        Goal.objects.filter(manager__user__in=users).delete()
        Task.objects.filter(employee__in=employees).delete()
        Project.objects.filter(manager__user__in=users).delete()
        users.delete()
        org.delete()
        self.stdout.write(self.style.SUCCESS('Scenario data deleted.'))

    # ------------------------------------------------------------------ create
    def create(self, count):
        if Organization.objects.filter(name=ORG_NAME).exists():
            self.stdout.write('Already exists. Run with --remove first to rebuild it.')
            return
        rng = random.Random(11)
        today = timezone.localdate()
        year = today.year
        org = Organization.objects.create(name=ORG_NAME)

        hr = User.objects.create_user(email='kpi.hr@scen.test', password=PASSWORD, org=org,
                                      first_name='Hind', last_name='HR')
        Employee.objects.create(user=hr, system_role='HR', hire_date=HIRED)
        managers = []
        for i, dept in enumerate(DEPARTMENTS, start=1):
            boss = User.objects.create_user(
                email=f'kpi.manager{i}@scen.test', password=PASSWORD, org=org,
                first_name='Manager', last_name=dept, department=dept,
            )
            Employee.objects.create(user=boss, system_role='Manager', hire_date=HIRED)
            managers.append((Manager.objects.create(user=boss), dept))
        projects = {m.pk: Project.objects.create(title=f'{d} project', manager=m) for m, d in managers}

        rows = []
        for n in range(count):
            manager, dept = managers[n % 3]
            name = f'{FIRST[n % len(FIRST)]} {LAST[(n // 3) % len(LAST)]}'
            first, _, last = name.partition(' ')
            user = User.objects.create_user(
                email=f'kpi.emp{n + 1:02d}@scen.test', password=PASSWORD, org=org,
                first_name=first, last_name=last, department=dept,
            )
            Employee.objects.create(user=user, system_role='Employee', hire_date=HIRED)
            Employee.objects.filter(pk=user.pk).update(manager=manager)
            employee = Employee.objects.get(pk=user.pk)
            case = n % len(CASES)
            self.make_tasks(employee, projects[manager.pk], year, rng, case)
            self.apply_case(case, employee, manager, today, rng)
            rows.append((f'kpi.emp{n + 1:02d}@scen.test', name, manager.user.email, CASES[case]))

        self.stdout.write(self.style.SUCCESS(
            f'Created {count} employees in "{ORG_NAME}". Password for all: {PASSWORD}'
        ))
        self.stdout.write(f'HR: {hr.email}   Managers: kpi.manager1/2/3@scen.test\n')
        for email, name, boss, label in rows:
            self.stdout.write(f'{email:24} {name:20} (team of {boss.split("@")[0]:13}) {label}')

    # ------------------------------------------------------------------- tasks
    def make_tasks(self, employee, project, year, rng, case):
        chance = 0.95 if case == 6 else 0.3 if case == 7 else 0.65
        for month in range(1, 13):
            done = month <= timezone.localdate().month and rng.random() < chance
            Task.objects.create(
                title=f'Task {month}', status='completed' if done else 'in_progress',
                project=project, employee=employee,
                due_date=date(year, month, 15), start_date=date(year, month, 1),
                privacy='public', priority='medium', created_at=timezone.now(),
            )

    # ------------------------------------------------------------------- goals
    def goal(self, employee, manager, year, period, weight, kind='Manual', target=10,
             value=None, link=False, name=None, final_rating=None):
        start, end = rules.period_dates(period, year)
        goal = Goal.objects.create(
            name=name or f'{period} {"tasks" if kind == "Task-based" else "goal"}',
            type=kind, time_period=period, weight=weight, target_value=target,
            actual_value=None if kind == 'Task-based' else value,
            rating=final_rating, period_start=start, period_end=end,
            evaluation_year=year, manager=manager, employee=employee,
        )
        if link:
            for task in Task.objects.filter(employee=employee, due_date__gte=start, due_date__lte=end):
                TaskGoal.objects.create(task=task, goal=goal)
        return goal

    def history(self, employee, manager, year, years_back, rng, strength):
        for back in range(1, years_back + 1):
            y = year - back
            rated = []
            for name, period, weight in (('Delivery quality', 'annual', 60), ('Year-end sprint', 'Q4', 40)):
                actual = round(10 * strength * rng.uniform(0.75, 1.2), 1)
                rating = rules.rating_for(rules.progress_percent(10, actual))
                rated.append((rating, weight))
                self.goal(employee, manager, y, period, weight, value=actual, name=name, final_rating=rating)
            Evaluation.objects.create(
                employee=employee, evaluation_year=y,
                overall_score=rules.overall_score(rated), is_final=True,
            )

    def upcoming(self, today, how_many):
        """The next months of this year that have not started yet."""
        return [f'M{m}' for m in range(today.month + 1, 13)][:how_many]

    def apply_case(self, case, employee, manager, today, rng):
        year = today.year
        g = lambda *a, **k: self.goal(employee, manager, year, *a, **k)
        coming = self.upcoming(today, 3)

        if case == 0:
            self.history(employee, manager, year, 2, rng, rng.choice([0.7, 0.9, 1.1]))
        elif case == 1:
            pass  # nothing at all
        elif case == 2:
            g('Q1', 30, value=9, name='Q1 follow-ups')
            g('annual', 40, kind='Task-based', target=8, link=True, name='Completed tasks')
            g('Q2', 30, value=7, name='Q2 quality')
            self.history(employee, manager, year, 1, rng, 0.9)
        elif case == 3:
            g('annual', 60, value=rng.choice([6, 8, 10, 12]), name='Delivery quality')
            self.history(employee, manager, year, 2, rng, 0.8)
        elif case == 4:
            if len(coming) >= 2:
                half = 50
                g(coming[0], half, target=5, value=None, name='Next month goal')
                g(coming[1], half, kind='Task-based', target=2, name='Next month tasks')
            self.history(employee, manager, year, 1, rng, 1.0)
        elif case == 5:
            g('Q1', 40, value=8, name='Q1 delivery')
            if len(coming) >= 2:
                g(coming[0], 30, target=6, name='Upcoming goal')
                g(coming[1], 30, kind='Task-based', target=2, name='Upcoming tasks')
            else:
                g('annual', 60, value=5, name='Delivery quality')
            self.history(employee, manager, year, 2, rng, 0.85)
        elif case == 6:
            g('annual', 40, value=12, name='Delivery quality')
            g('Q1', 30, value=9.5, name='Q1 follow-ups')
            g('annual', 30, kind='Task-based', target=6, link=True, name='Completed tasks')
            self.history(employee, manager, year, 3, rng, 1.2)
        elif case == 7:
            g('annual', 40, value=3, name='Delivery quality')
            g('Q1', 30, value=None, name='Q1 follow-ups (no value)')
            g('Q2', 30, value=None, name='Q2 quality (no value)')
            self.history(employee, manager, year, 2, rng, 0.55)
        elif case == 8:
            g('annual', 40, kind='Task-based', target=6, name='Tasks (none linked)')
            g('Q1', 30, kind='Task-based', target=2, name='Q1 tasks (none linked)')
            g('Q2', 30, kind='Task-based', target=2, link=False, name='Q2 tasks (none linked)')
            self.history(employee, manager, year, 1, rng, 0.8)
        else:
            for period, weight, value, label in (
                ('Q1', 20, 12, 'rating 5 (120%)'), ('Q2', 20, 9.5, 'rating 4 (95%)'),
                ('Q3', 20, 8.5, 'rating 3 (85%)'), ('M1', 20, 7, 'rating 2 (70%)'),
                ('annual', 20, 4, 'rating 1 (40%)'),
            ):
                g(period, weight, value=value, name=label)
            self.history(employee, manager, year, 2, rng, 0.95)
