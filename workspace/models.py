from django.conf import settings
from django.db import models

PRIORITY_CHOICES = [
    ('low', 'Low'),
    ('medium', 'Medium'),
    ('high', 'High'),
    ('urgent', 'Urgent'),
]

# Task life cycle:
#   employee: To Do -> In Progress -> Submitted for Review
#   manager:  Submitted for Review -> Completed (approve) or Changes Requested
#   employee: Changes Requested -> In Progress (then submits again)
STATUS_CHOICES = [
    ('todo', 'To Do'),
    ('in_progress', 'In Progress'),
    ('in_review', 'Submitted for Review'),
    ('changes_requested', 'Changes Requested'),
    ('completed', 'Completed'),
]


class Project(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # The manager who created and owns the project.
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='managed_projects',
    )
    # Members see the whole project and all its tasks.
    # An employee who is not a member only sees the tasks assigned to them.
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='member_projects',
        db_table='project_member',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'project'


class Task(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)  # description and instructions
    # A task can exist without a project.
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tasks',
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='assigned_tasks',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_tasks',
    )
    start_date = models.DateField()
    due_date = models.DateField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='todo')
    # The manager's feedback. Required when the manager requests changes.
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

    class Meta:
        db_table = 'task'