from rest_framework import serializers

from workspace.serializers import check_half_hours, hours_for_period_problem, task_hours_field

from . import rules, services


class TaskSkillSerializer(serializers.Serializer):
    skill_id = serializers.IntegerField()
    required = serializers.BooleanField(default=True)  # False = optional skill
    # Only the levels the system knows, so every organization uses the same scale.
    level = serializers.ChoiceField(
        choices=list(rules.SKILL_LEVELS), required=False, allow_blank=True,
    )


class RecommendRequestSerializer(serializers.Serializer):
    """What the New task screen sends when the manager clicks Recommend."""

    title = serializers.CharField(required=False, allow_blank=True, default='')
    description = serializers.CharField(required=False, allow_blank=True, default='')
    skills = TaskSkillSerializer(many=True, required=False, default=list)
    start_date = serializers.DateField()
    due_date = serializers.DateField()
    # Hours the new task needs. Required: an employee whose free hours in the
    # period do not cover them is excluded.
    estimated_hours = task_hours_field()

    def validate_estimated_hours(self, value):
        return check_half_hours(value)

    def validate_skills(self, skills):
        ids = [s['skill_id'] for s in skills]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Each skill can only be listed once.')
        # Only skills from the controlled catalogue.
        found = set(services.catalogue_skills().filter(pk__in=ids).values_list('pk', flat=True))
        unknown = [i for i in ids if i not in found]
        if unknown:
            raise serializers.ValidationError(f'Unknown skill: {unknown}')
        return skills

    def validate(self, data):
        if data['due_date'] < data['start_date']:
            raise serializers.ValidationError(
                {'due_date': 'The due date cannot be before the start date.'}
            )
        problem = hours_for_period_problem(data['estimated_hours'], data['start_date'], data['due_date'])
        if problem:
            raise serializers.ValidationError({'estimated_hours': problem})
        return data