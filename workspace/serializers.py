from decimal import Decimal

from rest_framework import serializers

from accounts.models import Employee, Project, Skill, Task, TaskSkill
from recommendations.rules import HOURS_PER_DAY, working_days

from .permissions import PRIVATE, PUBLIC


class ProjectWriteSerializer(serializers.ModelSerializer):
    # The API keeps calling it "name"; it is stored in Project.title.
    name = serializers.CharField(source='title', max_length=255)  # required, cannot be blank

    class Meta:
        model = Project
        fields = ['name', 'description']


# Same choices as the task form (PRIORITIES and LEVELS in ui.jsx).
TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent']
SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert']

# Estimated hours of one task: at least 1, in steps of half an hour (1, 1.5, 2 ...).
# The real maximum depends on the task's dates (see hours_for_period_problem);
# 999.5 is only the most the database column can hold.
MIN_TASK_HOURS = Decimal('1')
MAX_TASK_HOURS = Decimal('999.5')


def task_hours_field(**kwargs):
    return serializers.DecimalField(
        max_digits=5, decimal_places=1,
        min_value=MIN_TASK_HOURS, max_value=MAX_TASK_HOURS, **kwargs,
    )


def hours_for_period_problem(hours, start, due):
    """The task's hours must fit its dates: at most working days (Sun-Thu) x 8.
    Returns the error message, or None when the hours fit."""
    if hours is None or not start or not due or due < start:
        return None
    days = working_days(start, due)
    if days == 0:
        return 'The task period has no working days (Sunday to Thursday).'
    most = days * HOURS_PER_DAY
    if hours > most:
        return (f'This period allows at most {most} hours '
                f'({days} working day(s) x {HOURS_PER_DAY}).')
    return None


def check_half_hours(value):
    if value is not None and (value * 2) % 1 != 0:
        raise serializers.ValidationError('Use whole or half hours, for example 1.5.')
    return value


class TaskSkillInputSerializer(serializers.Serializer):
    """One skill the task needs (chosen in the recommendation panel)."""

    skill = serializers.PrimaryKeyRelatedField(queryset=Skill.objects.all())
    level = serializers.ChoiceField(choices=SKILL_LEVELS, required=False, allow_blank=True)
    required = serializers.BooleanField(default=True)  # False = optional skill


class TaskWriteSerializer(serializers.ModelSerializer):
    """Used by managers to create and edit tasks.

    The task is stored with an `employee`; the API keeps calling that
    person the `assignee`. A new task is private unless the manager
    marks it public.
    """

    title = serializers.CharField(max_length=255)
    assignee = serializers.PrimaryKeyRelatedField(
        source='employee',
        queryset=Employee.objects.select_related('user'),
    )
    privacy = serializers.ChoiceField(choices=[PUBLIC, PRIVATE], required=False)
    priority = serializers.ChoiceField(choices=TASK_PRIORITIES, required=False)
    start_date = serializers.DateField()
    due_date = serializers.DateField()
    estimated_hours = task_hours_field()
    # Saved in task_skills, so the task counts as experience once it is completed.
    skills = TaskSkillInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Task
        fields = [
            'title', 'description', 'project', 'assignee',
            'start_date', 'due_date', 'priority', 'privacy', 'skills',
            'estimated_hours',
        ]

    def validate_estimated_hours(self, value):
        return check_half_hours(value)

    def validate_project(self, project):
        if project is None:
            return None

        manager = self.context['request'].user
        if project.manager_id != manager.pk:
            raise serializers.ValidationError(
                "You can only create tasks for your own projects."
            )
        return project

    def validate_assignee(self, employee):
        manager = self.context['request'].user
        if employee.user.role != 'Employee' or employee.user.org_id != manager.org_id:
            raise serializers.ValidationError(
                'Choose an employee from your organization.'
            )
        # Same people the Assignee list shows: only employees who report to this manager.
        if employee.manager_id != manager.pk:
            raise serializers.ValidationError(
                'Choose an employee from your team.'
            )
        return employee

    def validate_skills(self, skills):
        ids = [item['skill'].pk for item in skills]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Each skill can only be listed once.')
        return skills

    def validate(self, data):
        # For a partial update, fall back to the values already saved.
        start = data.get('start_date') or (self.instance and self.instance.start_date)
        due = data.get('due_date') or (self.instance and self.instance.due_date)
        if start and due and due < start:
            raise serializers.ValidationError(
                {'due_date': 'The due date cannot be before the start date.'}
            )
        hours = data.get('estimated_hours')
        if hours is None and self.instance is not None:
            hours = self.instance.estimated_hours
        problem = hours_for_period_problem(hours, start, due)
        if problem:
            raise serializers.ValidationError({'estimated_hours': problem})
        return data

    def create(self, validated_data):
        validated_data.setdefault('privacy', PRIVATE)
        skills = validated_data.pop('skills', [])
        task = super().create(validated_data)
        TaskSkill.objects.bulk_create([
            TaskSkill(
                task=task, skill=item['skill'], skill_level=item.get('level') or None,
                is_required=item.get('required', True),
            )
            for item in skills
        ])
        return task

    def update(self, instance, validated_data):
        validated_data.pop('skills', None)  # skills are only set when the task is created
        return super().update(instance, validated_data)