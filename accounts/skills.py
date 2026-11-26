"""Skills of the employees (tables skills and employee_skills).

The employee chooses their skills from the controlled skills catalogue (a drop-down,
never free text, so "Python" and "python" are not two skills) and sets the level
of each one. Nobody adds skills from the website: the catalogue is filled with
`manage.py import_skill_catalogue` and grows only with `manage.py add_skill`. The level is never raised automatically: the employee or the
manager changes it by hand.

  GET  /api/accounts/skills/catalog/           the list to choose from
  GET  /api/accounts/skills/mine/              my skills
  PUT  /api/accounts/skills/mine/              replace my skills (employee)
  GET  /api/accounts/skills/employee/<id>/     a team member's skills (manager)
  PUT  /api/accounts/skills/employee/<id>/     change a team member's levels (manager)

PUT body: {"skills": [{"skill": <skill id>, "level": "beginner" | "intermediate" | "advanced" | "expert"}]}
"""
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Employee, EmployeeSkill, Skill
from recommendations import services as recommendation_services

LEVELS = ['beginner', 'intermediate', 'advanced', 'expert']


def clean_skills(items, valid_ids):
    """Check the list sent by the website. Returns (rows, problems):
    rows = [(skill_id, level)], problems = a list of messages (empty when fine)."""
    if not isinstance(items, list):
        return [], ['Send a list of skills.']
    rows, seen, problems = [], set(), []
    for item in items:
        skill_id = item.get('skill') if isinstance(item, dict) else None
        level = item.get('level') if isinstance(item, dict) else None
        if isinstance(skill_id, bool) or not isinstance(skill_id, int) or skill_id not in valid_ids:
            problems.append('Choose a skill from the list.')
        elif skill_id in seen:
            problems.append('Each skill can only be listed once.')
        elif level not in LEVELS:
            problems.append('Choose a level: beginner, intermediate, advanced or expert.')
        else:
            seen.add(skill_id)
            rows.append((skill_id, level))
    return rows, sorted(set(problems))


def skills_of(employee_id):
    return [
        {'skill': record.skill_id, 'name': record.skill.name, 'level': record.skill_level or ''}
        for record in EmployeeSkill.objects.filter(employee_id=employee_id)
        .select_related('skill').order_by('skill__name')
    ]


def replace_skills(employee, items):
    """Save the list. Returns (saved list, problems)."""
    rows, problems = clean_skills(items, set(Skill.objects.values_list('skill_id', flat=True)))
    if problems:
        return None, problems
    with transaction.atomic():
        EmployeeSkill.objects.filter(employee_id=employee.pk).delete()
        EmployeeSkill.objects.bulk_create([
            EmployeeSkill(employee_id=employee.pk, skill_id=skill_id, skill_level=level)
            for skill_id, level in rows
        ])
    return skills_of(employee.pk), []


class SkillCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('Employee', 'Manager'):
            return Response({'detail': 'Only employees and managers use skills.'}, status=status.HTTP_403_FORBIDDEN)
        skills = Skill.objects.order_by('name').values_list('skill_id', 'name')
        return Response([{'id': skill_id, 'name': name} for skill_id, name in skills])


class MySkillsView(APIView):
    permission_classes = [IsAuthenticated]

    def _employee(self, request):
        if request.user.role != 'Employee':
            return None
        return Employee.objects.filter(pk=request.user.pk).first()

    def get(self, request):
        employee = self._employee(request)
        if employee is None:
            return Response({'detail': 'Only employees have skills.'}, status=status.HTTP_403_FORBIDDEN)
        return Response({'skills': skills_of(employee.pk)})

    def put(self, request):
        employee = self._employee(request)
        if employee is None:
            return Response({'detail': 'Only employees have skills.'}, status=status.HTTP_403_FORBIDDEN)
        saved, problems = replace_skills(employee, request.data.get('skills') if hasattr(request.data, 'get') else None)
        if problems:
            return Response({'skills': problems}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'skills': saved})


class TeamMemberSkillsView(APIView):
    permission_classes = [IsAuthenticated]

    def _member(self, request, employee_id):
        if request.user.role != 'Manager':
            return None
        return next((e for e in recommendation_services.team_of(request.user) if e.pk == employee_id), None)

    def get(self, request, employee_id):
        member = self._member(request, employee_id)
        if member is None:
            return Response({'detail': 'This employee is not in your team.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'skills': skills_of(member.pk)})

    def put(self, request, employee_id):
        member = self._member(request, employee_id)
        if member is None:
            return Response({'detail': 'This employee is not in your team.'}, status=status.HTTP_404_NOT_FOUND)
        saved, problems = replace_skills(member, request.data.get('skills') if hasattr(request.data, 'get') else None)
        if problems:
            return Response({'skills': problems}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'skills': saved})