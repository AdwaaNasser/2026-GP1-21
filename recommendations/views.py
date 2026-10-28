from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Skill
from goals.permissions import IsManager

from . import services
from .serializers import RecommendRequestSerializer


class RecommendEmployeesView(APIView):
    """POST: the manager sends the task details and required skills, and gets
    back the eligible team members ranked, plus the excluded ones with reasons.
    Nothing is saved: the manager still picks the assignee and creates the task."""

    permission_classes = [IsManager]

    def post(self, request):
        serializer = RecommendRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        recommended, excluded = services.recommend(
            manager_user=request.user,
            skills=data['skills'],
            start=data['start_date'],
            end=data['due_date'],
            hours=data['estimated_hours'],
            task_text=f"{data['title']}. {data['description']}".strip(' .'),
        )
        return Response({
            'eligible_found': bool(recommended),
            'recommended': recommended,
            'excluded': excluded,
        })


class SkillListView(APIView):
    """GET: every skill the manager can choose from when asking for recommendations."""

    permission_classes = [IsManager]

    def get(self, request):
        skills = Skill.objects.order_by('name').values_list('skill_id', 'name')
        return Response([{'id': skill_id, 'name': name} for skill_id, name in skills])