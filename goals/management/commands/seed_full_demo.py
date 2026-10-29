"""A full demo: every KPI, team, task and skill case in one separate organization.

    python manage.py seed_full_demo            # create it
    python manage.py seed_full_demo --remove   # delete only this demo data

It only touches the organization "Bayyinah Full Demo", so real data is never
changed. It does not change the database structure (no migrations).
Password for every account: Demo12345

Accounts:
    full.hr@demo.test
    full.manager1@demo.test  (Engineering, 8 employees)
    full.manager2@demo.test  (Operations, 5 employees)
    full.manager3@demo.test  (no team yet)
    full.emp01@demo.test ... full.emp14@demo.test
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import (
    Employee, EmployeeSkill, Goal, Manager, Organization, Project,
    Skill, Task, TaskGoal, TaskSkill, User,
)
from goals import rules, services

ORG_NAME = 'Bayyinah Full Demo'
PASSWORD = 'Demo12345'

# key, first, last, job title, department, manager (1-3 or None), hire date, gender, skills, case
PEOPLE = [
    ('emp01', 'Layla', 'Alharbi', 'Senior Software Engineer', 'Engineering', 1, date(2019, 3, 1), 'Female',
     [('Python', 'expert'), ('Django', 'advanced'), ('SQL', 'advanced')],
     'Top performer: every rating 5, task-based goal fully linked, one task from ANOTHER manager project'),
    ('emp02', 'Omar', 'Alotaibi', 'Frontend Developer', 'Engineering', 1, date(2021, 6, 15), 'Male',
     [('React', 'advanced'), ('JavaScript', 'intermediate'), ('Design', 'beginner')],
     'Every rating 1 to 5 in one year (five goals, 20% each, three ended periods)'),
    ('emp03', 'Reem', 'Alqahtani', 'QA Engineer', 'Engineering', 1, date(2022, 9, 1), 'Female',
     [('Testing', 'intermediate')],
     'Low performer: ended goals with NO value entered (overdue), many overdue tasks'),
    ('emp04', 'Fahad', 'Alghamdi', 'Backend Developer', 'Engineering', 1, date(2020, 1, 20), 'Male',
     [('Python', 'intermediate'), ('SQL', 'intermediate')],
     'No goals this year yet (Set goals), 2 past final years'),
    ('emp05', 'Dana', 'Alzahrani', 'Junior Developer', 'Engineering', 1, None, 'Female',
     [],
     'Brand new: hired this year, no goals, no history, no tasks, no skills'),
    ('emp06', 'Yousef', 'Alshehri', 'DevOps Engineer', 'Engineering', 1, date(2021, 2, 10), 'Male',
     [('Docker', 'advanced'), ('Linux', 'advanced')],
     'Goals use only 60% of the weight (40% still free to add), all editable'),
    ('emp07', 'Nada', 'Aldosari', 'Data Analyst', 'Engineering', 1, date(2022, 4, 4), 'Female',
     [('SQL', 'advanced'), ('Data Analysis', 'advanced'), ('Excel', 'expert')],
     'Task-based goals with completed tasks that are NOT linked yet (Link tasks)'),
    ('emp08', 'Saud', 'Almutairi', 'Mobile Developer', 'Engineering', 1, date(2020, 8, 30), 'Male',
     [('React', 'intermediate'), ('JavaScript', 'advanced')],
     'Task-based goal with linked tasks: a done one, an unfinished one, and one done OUTSIDE the period (not counted)'),
    ('emp09', 'Hessa', 'Alharbi', 'Operations Lead', 'Operations', 2, date(2018, 5, 5), 'Female',
     [('Project Management', 'expert'), ('Communication', 'advanced')],
     'High performer with 3 past final years (rising chart)'),
    ('emp10', 'Talal', 'Alotaibi', 'Operations Analyst', 'Operations', 2, date(2019, 11, 11), 'Male',
     [('Excel', 'advanced'), ('Communication', 'intermediate')],
     'Declining: past scores go down, this year weak'),
    ('emp11', 'Joud', 'Alqahtani', 'Project Coordinator', 'Operations', 2, date(2023, 1, 8), 'Female',
     [('Project Management', 'intermediate')],
     'Heavy workload: many open tasks, overdue, in review, changes requested, urgent'),
    ('emp12', 'Majed', 'Alghamdi', 'Logistics Officer', 'Operations', 2, date(2021, 7, 19), 'Male',
     [('Excel', 'intermediate'), ('Communication', 'beginner')],
     'Private tasks and tasks with no project, one goal ending this month'),
    ('emp13', 'Rana', 'Alzahrani', 'Operations Assistant', 'Operations', 2, date(2024, 2, 2), 'Female',
     [],
     'No skills, a goal in the current month, everything on track'),
    ('emp14', 'Badr', 'Alshehri', 'Consultant', 'Operations', None, date(2023, 10, 1), 'Male',
     [('Communication', 'advanced')],
     'NO direct manager assigned (shows "Not assigned" for HR, hidden from every manager)'),
]
MANAGERS = [
    (1, 'full.manager1', 'Khalid', 'Alsubaie', 'Engineering Manager', 'Engineering', date(2017, 1, 1)),
    (2, 'full.manager2', 'Mona', 'Aljuhani', 'Operations Manager', 'Operations', date(2016, 6, 1)),
    (3, 'full.manager3', 'Turki', 'Alanazi', 'Sales Manager', 'Sales', date(2020, 3, 1)),
]


class Command(BaseCommand):
    help = 'Create (or with --remove, delete) a full demo with every KPI, team and task case.'

    def add_arguments(self, parser):
        parser.add_argument('--remove', action='store_true', help='Delete the demo data.')

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(f'Database: {connection.settings_dict["NAME"]}')
        if options['remove']:
            return self.remove()
        return self.create()

    # ---------- remove ----------

    def remove(self):
        org = Organization.objects.filter(name=ORG_NAME).first()
        if org is None:
            self.stdout.write('No demo data found.')
            return
        users = User.objects.filter(org=org)
        employees = Employee.objects.filter(user__in=users)
        Goal.objects.filter(manager__user__in=users).delete()
        TaskSkill.objects.filter(task__employee__in=employees).delete()
        Task.objects.filter(employee__in=employees).delete()
        EmployeeSkill.objects.filter(employee__in=employees).delete()
        Project.objects.filter(manager__user__in=users).delete()
        users.delete()
        org.delete()
        self.stdout.write(self.style.SUCCESS('Full demo data deleted.'))

    # ---------- create ----------

    def create(self):
        if Organization.objects.filter(name=ORG_NAME).exists():
            self.stdout.write('The full demo already exists. Run with --remove first to rebuild it.')
            return
        self.today = timezone.localdate()
        self.year = self.today.year
        self.org = Organization.objects.create(name=ORG_NAME)

        hr = self.user('full.hr', 'Hala', 'Alsaud', 'HR Specialist', 'People', 'Female')
        Employee.objects.create(user=hr, system_role='HR', hire_date=date(2015, 1, 1))

        self.managers = {}
        self.projects = {}
        for number, email, first, last, title, department, hired in MANAGERS:
            boss = self.user(email, first, last, title, department, 'Male' if number != 2 else 'Female')
            Employee.objects.create(user=boss, system_role='Manager', hire_date=hired)
            row = Manager.objects.create(user=boss)
            self.managers[number] = row
            self.projects[number] = [
                Project.objects.create(title=f'{department} Platform', manager=row),
                Project.objects.create(title=f'{department} Improvements', manager=row),
            ]

        self.skills = {}
        self.staff = {}
        for key, first, last, title, department, boss, hired, gender, skills, _case in PEOPLE:
            user = self.user(f'full.{key}', first, last, title, department, gender)
            hired = hired or self.today - timedelta(days=60)
            Employee.objects.create(
                user=user, system_role='Employee', hire_date=hired,
                manager=self.managers[boss] if boss else None,
            )
            employee = Employee.objects.get(pk=user.pk)
            self.staff[key] = employee
            for name, level in skills:
                EmployeeSkill.objects.create(employee=employee, skill=self.skill(name), skill_level=level)

        self.build_cases()
        self.report()

    def user(self, email, first, last, title, department, gender):
        address = email if '@' in email else f'{email}@demo.test'
        return User.objects.create_user(
            email=address, password=PASSWORD, org=self.org, first_name=first, last_name=last,
            department=department, job_title=title, gender=gender, allowed_absence_days=21,
        )

    def skill(self, name):
        if name not in self.skills:
            self.skills[name] = Skill.objects.filter(name=name).first() or Skill.objects.create(name=name)
        return self.skills[name]

    # ---------- building blocks ----------

    def task(self, employee, project, title, status, due, priority='medium', hours=None,
             privacy='public', feedback=None, skills=()):
        task = Task.objects.create(
            title=title, status=status, project=project, employee=employee,
            due_date=due, start_date=due - timedelta(days=10), priority=priority,
            estimated_hours=hours, privacy=privacy, feedback=feedback,
            created_at=timezone.now(), description=f'Demo task: {title}',
        )
        for name in skills:
            TaskSkill.objects.create(task=task, skill=self.skill(name), skill_level='intermediate')
        return task

    def monthly_tasks(self, employee, project, rate=0.8, skills=()):
        """One task per month: past months mostly completed, this month in progress, later ones to do."""
        for month in range(1, 13):
            due = date(self.year, month, 15)
            if month < self.today.month:
                status = 'completed' if (month * 7) % 10 < rate * 10 else 'in_progress'
            elif month == self.today.month:
                status = 'in_progress'
            else:
                status = 'todo'
            self.task(employee, project, f'Task {month:02d}', status, due,
                      priority=('high' if month % 4 == 0 else 'medium'), hours=month % 5 + 2, skills=skills)

    def goal(self, employee, name, kind, period, weight, target, actual=None, year=None, description=None):
        year = year or self.year
        final = year < self.year
        rating = None
        if final and actual is not None:
            rating = rules.rating_for(rules.progress_percent(target, actual))
        return Goal.objects.create(
            name=name, description=description, type=kind, time_period=period, weight=weight,
            target_value=target, actual_value=actual, rating=rating,
            evaluation_year=year,
            manager=employee.manager, employee=employee,
        )

    def link(self, goal, tasks):
        for task in tasks:
            TaskGoal.objects.get_or_create(task=task, goal=goal)

    def tasks_in(self, employee, goal, status='completed'):
        return list(Task.objects.filter(
            employee=employee, status=status,
            due_date__gte=goal.period_start, due_date__lte=goal.period_end,
        ))

    def history(self, employee, strengths):
        """Final years: strengths = {years_back: how well they did (1.0 = reached the target)}."""
        for back, strength in strengths.items():
            year = self.year - back
            for name, period, weight in (('Delivery quality', 'annual', 60), ('Year-end sprint', 'Q4', 40)):
                # A finished goal keeps its rating: that is how the year stays frozen.
                self.goal(employee, name, 'Manual', period, weight, 10, round(10 * strength, 1), year=year)

    # ---------- the cases ----------

    def build_cases(self):
        s, t = self.staff, self.today
        p1a, p1b = self.projects[1]
        p2a, p2b = self.projects[2]
        month = t.month

        # emp01: top performer
        e = s['emp01']
        self.monthly_tasks(e, p1a, rate=1.0, skills=('Python',))
        self.task(e, p2a, 'Cross-team API review', 'in_progress', t + timedelta(days=5), 'high', 6)  # hidden from manager1
        self.goal(e, 'Delivery quality', 'Manual', 'annual', 50, 10, 12.5)
        self.goal(e, 'Code reviews', 'Manual', f'Q{(month - 1) // 3 + 1}', 20, 20, 24)
        g = self.goal(e, 'Completed tasks', 'Task-based', 'annual', 30, 8)
        self.link(g, self.tasks_in(e, g))
        self.history(e, {1: 1.2, 2: 1.15, 3: 1.05})

        # emp02: every rating
        e = s['emp02']
        self.monthly_tasks(e, p1b, rate=0.7, skills=('React',))
        for name, period, actual in (
            ('Pages shipped', 'Q1', 12), ('Bug fixes', 'Q2', 9.2), ('Design reviews', 'Q3', 8.3),
            ('Accessibility score', 'Q4', 6.5), ('Team mentoring', 'annual', 3),
        ):
            self.goal(e, name, 'Manual', period, 20, 10, actual)
        self.history(e, {1: 0.9})

        # emp03: low performer
        e = s['emp03']
        self.monthly_tasks(e, p1a, rate=0.2)
        for i in range(3):
            self.task(e, p1a, f'Overdue regression {i + 1}', 'in_progress', t - timedelta(days=9 + i * 6), 'high', 5)
        self.goal(e, 'Test coverage', 'Manual', 'Q1', 40, 10, None)
        self.goal(e, 'Defects found', 'Manual', 'Q2', 30, 10, None)
        self.goal(e, 'Automation scripts', 'Manual', 'annual', 30, 10, 3)
        self.history(e, {1: 0.55, 2: 0.7})

        # emp04: no goals, two final years
        e = s['emp04']
        self.monthly_tasks(e, p1b, rate=0.8)
        self.history(e, {1: 0.95, 2: 0.85})

        # emp05: brand new -> nothing

        # emp06: 60% used
        e = s['emp06']
        self.monthly_tasks(e, p1a, rate=0.9, skills=('Docker',))
        self.goal(e, 'Uptime', 'Manual', 'annual', 40, 100, 99)
        self.goal(e, 'Deploy automation', 'Manual', f'M{month}', 20, 5, 3)
        self.history(e, {1: 1.0})

        # emp07: completed tasks not linked
        e = s['emp07']
        self.monthly_tasks(e, p1b, rate=1.0, skills=('SQL',))
        self.goal(e, 'Reports delivered', 'Task-based', 'annual', 60, 10)
        self.goal(e, 'Dashboards', 'Task-based', 'Q4', 40, 3)

        # emp08: linked tasks with edge cases
        e = s['emp08']
        done_in = self.task(e, p1a, 'Release 1', 'completed', date(self.year, month, 3), 'high', 8)
        open_in = self.task(e, p1a, 'Release 2', 'in_progress', date(self.year, month, 28), 'high', 8)
        outside = self.task(e, p1a, 'Early release', 'completed', date(self.year, 1, 20), 'medium', 4)
        self.task(e, p1a, 'Hotfix', 'completed', date(self.year, month, 10), 'urgent', 2)
        g = self.goal(e, 'Releases', 'Task-based', f'M{month}', 50, 3)
        self.link(g, [done_in, open_in, outside])
        self.goal(e, 'App rating', 'Manual', 'annual', 50, 5, 4.4)
        self.history(e, {1: 0.85})

        # emp09: high performer, 3 final years
        e = s['emp09']
        self.monthly_tasks(e, p2a, rate=1.0, skills=('Project Management',))
        self.goal(e, 'Projects delivered', 'Manual', 'annual', 60, 10, 11)
        g = self.goal(e, 'Completed tasks', 'Task-based', 'annual', 40, 8)
        self.link(g, self.tasks_in(e, g))
        self.history(e, {1: 1.1, 2: 0.95, 3: 0.8})

        # emp10: declining
        e = s['emp10']
        self.monthly_tasks(e, p2b, rate=0.4)
        self.goal(e, 'Reports on time', 'Manual', 'annual', 50, 10, 5)
        self.goal(e, 'Process improvements', 'Manual', 'Q3', 50, 6, 2)
        self.history(e, {1: 0.75, 2: 0.95, 3: 1.15})

        # emp11: heavy workload
        e = s['emp11']
        self.task(e, p2a, 'Vendor contract', 'in_progress', t - timedelta(days=14), 'urgent', 12)
        self.task(e, p2a, 'Budget review', 'in_progress', t - timedelta(days=3), 'high', 8)
        self.task(e, p2a, 'Audit pack', 'changes_requested', t + timedelta(days=2), 'high', 6,
                  feedback='Please add the missing totals for the last quarter.')
        self.task(e, p2b, 'Handover plan', 'in_review', t + timedelta(days=4), 'medium', 5)
        self.task(e, p2b, 'Kick-off deck', 'todo', t + timedelta(days=9), 'low', 3)
        self.task(e, p2b, 'Risk register', 'todo', t + timedelta(days=15), 'medium', 7)
        self.task(e, p2a, 'Status report', 'completed', t - timedelta(days=20), 'medium', 2)
        self.goal(e, 'Milestones met', 'Manual', 'annual', 70, 12, 6)
        self.goal(e, 'Stakeholder updates', 'Manual', 'Q4', 30, 6, 2)
        self.history(e, {1: 0.8})

        # emp12: private tasks, tasks without a project, goal ending this month
        e = s['emp12']
        self.task(e, None, 'Warehouse count', 'in_progress', t + timedelta(days=6), 'medium', 4)
        self.task(e, None, 'Supplier call', 'todo', t + timedelta(days=11), 'low', 1)
        self.task(e, p2b, 'Route planning', 'in_progress', t + timedelta(days=3), 'high', 6, privacy='private')
        self.task(e, p2b, 'Delivery audit', 'completed', t - timedelta(days=12), 'medium', 5)
        self.goal(e, 'Deliveries on time', 'Manual', f'M{month}', 60, 20, 15)
        self.goal(e, 'Stock accuracy', 'Manual', 'annual', 40, 100, 88)
        self.history(e, {1: 0.9, 2: 0.9})

        # emp13: no skills, on track
        e = s['emp13']
        self.monthly_tasks(e, p2a, rate=1.0)
        self.goal(e, 'Documents filed', 'Manual', f'M{month}', 50, 40, 36)
        self.goal(e, 'Requests answered', 'Manual', 'annual', 50, 300, 280)

        # emp14: no manager, only tasks without a project (no manager to own goals)
        e = s['emp14']
        self.task(e, None, 'Client workshop', 'todo', t + timedelta(days=12), 'medium', 6)

        # The stored overall score of every goal (derived from the ratings).
        for employee_id, year in set(Goal.objects.values_list('employee_id', 'evaluation_year')):
            services.refresh_overall_score(employee_id, year, self.today)

    def report(self):
        self.stdout.write(self.style.SUCCESS(f'Full demo created in "{ORG_NAME}". Password for all: {PASSWORD}'))
        self.stdout.write('\nHR      full.hr@demo.test')
        for number, email, first, last, title, department, _hired in MANAGERS:
            count = sum(1 for p in PEOPLE if p[5] == number)
            self.stdout.write(f'Manager {email}@demo.test  ({department}, {count} employees)')
        self.stdout.write('')
        for key, first, last, _title, _dep, boss, _h, _g, _s, case in PEOPLE:
            self.stdout.write(f'{first} {last} - full.{key}@demo.test (manager {boss or "none"}): {case}')
