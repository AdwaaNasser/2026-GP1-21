from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase

from .views import employee_can_set_status, progress_of, review_error, task_data


def make_task(project_id=None, status='todo', assignee_id=5, feedback=''):
    return SimpleNamespace(
        pk=1,
        title='Write report',
        description='',
        project_id=project_id,
        project=SimpleNamespace(name='Website') if project_id else None,
        assignee_id=assignee_id,
        assignee=SimpleNamespace(full_name='Sara Ali'),
        start_date=date(2026, 10, 1),
        due_date=date(2026, 10, 9),
        priority='high',
        status=status,
        feedback=feedback,
        created_at=date(2026, 9, 30),
    )


class EmployeeStatusTests(SimpleTestCase):
    def test_employee_moves_one_step_forward_and_submits_for_review(self):
        self.assertTrue(employee_can_set_status('todo', 'in_progress'))
        self.assertTrue(employee_can_set_status('in_progress', 'in_review'))

    def test_employee_restarts_work_after_changes_are_requested(self):
        self.assertTrue(employee_can_set_status('changes_requested', 'in_progress'))

    def test_employee_cannot_skip_steps_or_go_back(self):
        self.assertFalse(employee_can_set_status('todo', 'in_review'))
        self.assertFalse(employee_can_set_status('in_progress', 'todo'))
        self.assertFalse(employee_can_set_status('changes_requested', 'in_review'))

    def test_employee_cannot_complete_a_task(self):
        self.assertFalse(employee_can_set_status('in_progress', 'completed'))
        self.assertFalse(employee_can_set_status('in_review', 'completed'))
        self.assertFalse(employee_can_set_status('in_review', 'changes_requested'))

    def test_nothing_moves_after_completion(self):
        self.assertFalse(employee_can_set_status('completed', 'todo'))
        self.assertFalse(employee_can_set_status('completed', 'in_progress'))


class ManagerReviewTests(SimpleTestCase):
    def test_manager_can_approve_a_submitted_task(self):
        self.assertIsNone(review_error('in_review', 'completed', ''))

    def test_manager_can_request_changes_with_feedback(self):
        self.assertIsNone(review_error('in_review', 'changes_requested', 'Fix the totals'))

    def test_requesting_changes_needs_feedback(self):
        error = review_error('in_review', 'changes_requested', '')
        self.assertIn('feedback', error)

    def test_only_submitted_tasks_can_be_reviewed(self):
        for current in ('todo', 'in_progress', 'changes_requested', 'completed'):
            error = review_error(current, 'completed', '')
            self.assertIn('status', error)

    def test_review_only_accepts_the_two_decisions(self):
        self.assertIn('status', review_error('in_review', 'in_progress', 'x'))
        self.assertIn('status', review_error('in_review', 'todo', 'x'))


class TaskDataTests(SimpleTestCase):
    def test_non_member_employee_does_not_get_project_info(self):
        employee = SimpleNamespace(pk=5, role='Employee')
        data = task_data(make_task(project_id=3), employee, visible_project_ids=set())
        self.assertIsNone(data['project'])

    def test_member_employee_gets_project_info(self):
        employee = SimpleNamespace(pk=5, role='Employee')
        data = task_data(make_task(project_id=3), employee, visible_project_ids={3})
        self.assertEqual(data['project'], {'id': 3, 'name': 'Website'})

    def test_next_status_only_offered_to_the_assignee(self):
        assignee = SimpleNamespace(pk=5, role='Employee')
        colleague = SimpleNamespace(pk=6, role='Employee')
        task = make_task(project_id=3)
        self.assertEqual(task_data(task, assignee, {3})['next_status'], 'in_progress')
        self.assertIsNone(task_data(task, colleague, {3})['next_status'])

    def test_next_status_follows_the_review_flow(self):
        assignee = SimpleNamespace(pk=5, role='Employee')
        expected = {
            'todo': 'in_progress',
            'in_progress': 'in_review',
            'in_review': None,
            'changes_requested': 'in_progress',
            'completed': None,
        }
        for current, next_status in expected.items():
            data = task_data(make_task(status=current), assignee)
            self.assertEqual(data['next_status'], next_status)

    def test_feedback_is_returned_with_the_task(self):
        assignee = SimpleNamespace(pk=5, role='Employee')
        task = make_task(status='changes_requested', feedback='Fix the totals')
        self.assertEqual(task_data(task, assignee)['feedback'], 'Fix the totals')

    def test_only_the_manager_can_review_a_submitted_task(self):
        manager = SimpleNamespace(pk=9, role='Manager')
        employee = SimpleNamespace(pk=5, role='Employee')
        submitted = make_task(status='in_review')
        self.assertTrue(task_data(submitted, manager)['can_review'])
        self.assertFalse(task_data(submitted, employee)['can_review'])
        self.assertFalse(task_data(make_task(status='todo'), manager)['can_review'])


class ProgressTests(SimpleTestCase):
    def test_progress_percent(self):
        tasks = [make_task(status='completed'), make_task(status='todo')]
        self.assertEqual(progress_of(tasks)['percent'], 50)
        self.assertEqual(progress_of([])['percent'], 0)

    def test_only_completed_tasks_count_as_done(self):
        tasks = [make_task(status='completed'), make_task(status='in_review')]
        self.assertEqual(progress_of(tasks)['completed_tasks'], 1)