from rest_framework import serializers

from accounts.models import SystemUser

from .models import Project, Task


class ProjectWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=255)  # required, cannot be blank

    class Meta:
        model = Project
        fields = ['name', 'description']


class TaskWriteSerializer(serializers.ModelSerializer):
    """Used by managers to create and edit tasks.

    A new task always starts as To Do. The status and the feedback are not
    edited here: they change through the review flow in views.py.
    """

    title = serializers.CharField(max_length=255)

    class Meta:
        model = Task
        fields = [
            'title', 'description', 'project', 'assignee',
            'start_date', 'due_date', 'priority',
        ]

    def validate_project(self, project):
        manager = self.context['request'].user
        if project is not None and project.manager_id != manager.pk:
            raise serializers.ValidationError('Choose one of your own projects.')
        return project

    def validate_assignee(self, assignee):
        manager = self.context['request'].user
        if assignee.role != 'Employee' or assignee.department_id != manager.department_id:
            raise serializers.ValidationError(
                'Choose an employee from your department.'
            )
        return assignee

    def validate(self, data):
        # For a partial update, fall back to the values already saved.
        start = data.get('start_date') or (self.instance and self.instance.start_date)
        due = data.get('due_date') or (self.instance and self.instance.due_date)
        if start and due and due < start:
            raise serializers.ValidationError(
                {'due_date': 'The due date cannot be before the start date.'}
            )
        return data