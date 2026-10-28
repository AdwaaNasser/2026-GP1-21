from rest_framework import serializers

from accounts.models import Employee, Project, Skill, Task, TaskSkill

from .permissions import PRIVATE, PUBLIC


class ProjectWriteSerializer(serializers.ModelSerializer):
    # The API keeps calling it "name"; it is stored in Project.title.
    name = serializers.CharField(source='title', max_length=255)  # required, cannot be blank

    class Meta:
        model = Project
        fields = ['name', 'description']


class TaskSkillInputSerializer(serializers.Serializer):
    """One skill the task needs (chosen in the recommendation panel)."""

    skill = serializers.PrimaryKeyRelatedField(queryset=Skill.objects.all())
    level = serializers.CharField(required=False, allow_blank=True, max_length=50)


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
    # Saved in task_skills, so the task counts as experience once it is completed.
    skills = TaskSkillInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Task
        fields = [
            'title', 'description', 'project', 'assignee',
            'start_date', 'due_date', 'priority', 'privacy', 'skills',
        ]

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
        return data

    def create(self, validated_data):
        validated_data.setdefault('privacy', PRIVATE)
        skills = validated_data.pop('skills', [])
        task = super().create(validated_data)
        TaskSkill.objects.bulk_create([
            TaskSkill(task=task, skill=item['skill'], skill_level=item.get('level') or None)
            for item in skills
        ])
        return task

    def update(self, instance, validated_data):
        validated_data.pop('skills', None)  # skills are only set when the task is created
        return super().update(instance, validated_data)