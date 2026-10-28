from decimal import Decimal

from rest_framework import serializers

from accounts.models import Skill

from . import rules


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
    estimated_hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.5'),
    )

    def validate_skills(self, skills):
        ids = [s['skill_id'] for s in skills]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Each skill can only be listed once.')
        found = set(Skill.objects.filter(pk__in=ids).values_list('pk', flat=True))
        unknown = [i for i in ids if i not in found]
        if unknown:
            raise serializers.ValidationError(f'Unknown skill: {unknown}')
        return skills

    def validate(self, data):
        if data['due_date'] < data['start_date']:
            raise serializers.ValidationError(
                {'due_date': 'The due date cannot be before the start date.'}
            )
        return data