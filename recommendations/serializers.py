from rest_framework import serializers

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

    def validate_skills(self, skills):
        ids = [s['skill_id'] for s in skills]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Each skill can only be listed once.')
        # Only skills that someone in the manager's team has (the skills table is shared).
        found = set(
            services.team_skills(self.context['manager'])
            .filter(pk__in=ids).values_list('pk', flat=True)
        )
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