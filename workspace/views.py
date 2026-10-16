from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import SystemUser

from .models import Project, Task
from .permissions import IsManagerOrEmployee
from .serializers import ProjectWriteSerializer, TaskWriteSerializer

# What an employee may do with their own task, one step at a time:
#   To Do -> In Progress -> Submitted for Review
#   Changes Requested -> In Progress (to start working on the feedback)
# Only a manager can approve a task or request changes.
NEXT_STATUS = {
    'todo': 'in_progress',
    'in_progress': 'in_review',
    'changes_requested': 'in_progress',
}

# The two decisions a manager can make on a task that was submitted for review.
REVIEW_RESULTS = ('completed', 'changes_requested')


def not_found(message):
    return Response({'detail': message}, status=status.HTTP_404_NOT_FOUND)


def only_managers():
    return Response(
        {'detail': 'Only managers can do this.'},
        status=status.HTTP_403_FORBIDDEN,
    )


# ---------- Who can see what (the visibility rules live here) ----------

def full_access_project_ids(user):
    """Projects where this employee is a member."""
    return set(user.member_projects.values_list('pk', flat=True))


def projects_for(user):
    if user.role == 'Manager':
        return Project.objects.filter(manager=user)
    # An employee only gets the projects they are a member of.
    return Project.objects.filter(pk__in=full_access_project_ids(user))


def tasks_for(user):
    tasks = Task.objects.select_related('project', 'assignee')
    if user.role == 'Manager':
        return tasks.filter(created_by=user)
    # An employee sees their own tasks, plus every task of the projects
    # they are a member of.
    own = tasks.filter(assignee=user)
    in_member_projects = tasks.filter(project_id__in=full_access_project_ids(user))
    return own | in_member_projects


# ---------- Status rules ----------

def employee_can_set_status(current_status, new_status):
    return NEXT_STATUS.get(current_status) == new_status


def review_error(current_status, new_status, feedback):
    """Check a manager's review.

    Returns an error dict, or None when the review is valid.
    `feedback` is the already-stripped text.
    """
    if current_status != 'in_review':
        return {'status': 'Only tasks submitted for review can be reviewed.'}
    if new_status not in REVIEW_RESULTS:
        return {'status': 'Choose completed or changes_requested.'}
    if new_status == 'changes_requested' and not feedback:
        return {'feedback': 'Write feedback explaining the changes you need.'}
    return None


# ---------- Turning models into JSON ----------

def progress_of(tasks):
    total = len(tasks)
    done = len([task for task in tasks if task.status == 'completed'])
    percent = round(done * 100 / total) if total else 0
    return {'total_tasks': total, 'completed_tasks': done, 'percent': percent}


def task_data(task, user, visible_project_ids=None):
    project = None
    if task.project_id:
        # Employees only get project info when they are members of the project.
        if user.role == 'Manager' or task.project_id in (visible_project_ids or set()):
            project = {'id': task.project_id, 'name': task.project.name}
    return {
        'id': task.pk,
        'title': task.title,
        'description': task.description,
        'project': project,
        'assignee': {'id': task.assignee_id, 'name': task.assignee.full_name},
        'start_date': task.start_date,
        'due_date': task.due_date,
        'priority': task.priority,
        'status': task.status,
        'feedback': task.feedback,
        'created_at': task.created_at,
        'is_mine': task.assignee_id == user.pk,
        'next_status': NEXT_STATUS.get(task.status) if task.assignee_id == user.pk else None,
        'can_review': user.role == 'Manager' and task.status == 'in_review',
    }


def project_data(project, user, with_tasks=False):
    tasks = list(project.tasks.select_related('assignee'))
    data = {
        'id': project.pk,
        'name': project.name,
        'description': project.description,
        'manager': project.manager.full_name,
        'created_at': project.created_at,
        'progress': progress_of(tasks),
    }
    if with_tasks:
        visible = {project.pk}
        for task in tasks:
            task.project = project  # avoids another database query
        data['tasks'] = [task_data(task, user, visible) for task in tasks]
    return data


# ---------- Projects ----------

class ProjectListView(APIView):
    permission_classes = [IsManagerOrEmployee]

    def get(self, request):
        projects = projects_for(request.user).select_related('manager').order_by('-created_at')
        return Response([project_data(project, request.user) for project in projects])

    def post(self, request):
        if request.user.role != 'Manager':
            return only_managers()
        serializer = ProjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = serializer.save(manager=request.user)
        return Response(project_data(project, request.user), status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    permission_classes = [IsManagerOrEmployee]

    def get_project(self, request, project_id):
        return projects_for(request.user).select_related('manager').filter(pk=project_id).first()

    def get(self, request, project_id):
        project = self.get_project(request, project_id)
        if project is None:
            return not_found('Project not found.')
        return Response(project_data(project, request.user, with_tasks=True))

    def patch(self, request, project_id):
        if request.user.role != 'Manager':
            return only_managers()
        project = self.get_project(request, project_id)
        if project is None:
            return not_found('Project not found.')
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(project_data(project, request.user, with_tasks=True))


class ProjectMembersView(APIView):
    """Manager adds or removes employees as members of the project.

    A member sees the whole project. Anyone else only sees the tasks
    assigned to them.
    """

    permission_classes = [IsManagerOrEmployee]

    def department_employees(self, manager):
        return SystemUser.objects.filter(
            department_id=manager.department_id, role='Employee'
        ).order_by('first_name', 'last_name')

    def get(self, request, project_id):
        if request.user.role != 'Manager':
            return only_managers()
        project = Project.objects.filter(pk=project_id, manager=request.user).first()
        if project is None:
            return not_found('Project not found.')
        member_ids = set(project.members.values_list('pk', flat=True))
        return Response([
            {
                'employee_id': employee.pk,
                'name': employee.full_name,
                'is_member': employee.pk in member_ids,
            }
            for employee in self.department_employees(request.user)
        ])

    def put(self, request, project_id):
        if request.user.role != 'Manager':
            return only_managers()
        project = Project.objects.filter(pk=project_id, manager=request.user).first()
        if project is None:
            return not_found('Project not found.')

        is_member = request.data.get('is_member')
        if not isinstance(is_member, bool):
            return Response(
                {'is_member': 'Send true or false.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        employee = self.department_employees(request.user).filter(
            pk=request.data.get('employee_id')
        ).first()
        if employee is None:
            return Response(
                {'employee_id': 'Choose an employee from your department.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if is_member:
            project.members.add(employee)
        else:
            project.members.remove(employee)
        return Response({'employee_id': employee.pk, 'is_member': is_member})


# ---------- Tasks ----------

class TaskListView(APIView):
    permission_classes = [IsManagerOrEmployee]

    def get(self, request):
        tasks = tasks_for(request.user).order_by('due_date', '-created_at')
        visible = full_access_project_ids(request.user)
        return Response([task_data(task, request.user, visible) for task in tasks])

    def post(self, request):
        if request.user.role != 'Manager':
            return only_managers()
        serializer = TaskWriteSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(created_by=request.user)
        return Response(task_data(task, request.user), status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [IsManagerOrEmployee]

    def get_task(self, request, task_id):
        return tasks_for(request.user).filter(pk=task_id).first()

    def get(self, request, task_id):
        task = self.get_task(request, task_id)
        if task is None:
            return not_found('Task not found.')
        visible = full_access_project_ids(request.user)
        return Response(task_data(task, request.user, visible))

    def patch(self, request, task_id):
        task = self.get_task(request, task_id)
        if task is None:
            return not_found('Task not found.')

        if request.user.role == 'Manager':
            if 'status' in request.data:
                return self.review(request, task)
            serializer = TaskWriteSerializer(
                task, data=request.data, partial=True, context={'request': request}
            )
            serializer.is_valid(raise_exception=True)
            task = serializer.save()
            return Response(task_data(task, request.user))

        # Employees: only their own tasks, only the status field, one step forward.
        if task.assignee_id != request.user.pk:
            return Response(
                {'detail': 'You can only update your own tasks.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if set(request.data) != {'status'}:
            return Response(
                {'detail': 'Employees can only update the task status.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        new_status = request.data['status']
        if not employee_can_set_status(task.status, new_status):
            return Response(
                {'status': 'You can move a task from To Do to In Progress, then submit it '
                           'for review. Only your manager can complete it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task.status = new_status
        task.save(update_fields=['status'])
        visible = full_access_project_ids(request.user)
        return Response(task_data(task, request.user, visible))

    def review(self, request, task):
        """Manager approves a submitted task, or requests changes with feedback."""
        if not set(request.data) <= {'status', 'feedback'}:
            return Response(
                {'detail': 'To review a task, send only status and feedback.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        feedback = request.data.get('feedback') or ''
        if not isinstance(feedback, str):
            return Response(
                {'feedback': 'Feedback must be text.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        feedback = feedback.strip()
        new_status = request.data['status']

        error = review_error(task.status, new_status, feedback)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        task.status = new_status
        fields = ['status']
        if feedback:
            task.feedback = feedback
            fields.append('feedback')
        task.save(update_fields=fields)
        return Response(task_data(task, request.user))