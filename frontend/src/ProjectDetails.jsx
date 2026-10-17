import { useEffect, useState } from 'react';
import Shell, { Banner, HeaderActions } from './Shell.jsx';
import {
  Avatar,
  Drawer,
  EmptyState,
  Icon,
  Modal,
  ProgressBar,
  ProjectForm,
  Stats,
  Switch,
  TableSkeleton,
  Tabs,
  TaskForm,
  TaskPanel,
  TaskTable,
  formatDate,
  getJson,
  isOverdue,
  sendJson,
  useBanner,
  useEmployees,
  useTaskActions,
} from './taskUi.jsx';

// Shared by the manager (can edit the project, add tasks, choose members)
// and the employee (can view the project and work on their own tasks).
function DetailsContent({ role }) {
  const projectId = new URLSearchParams(window.location.search).get('id');
  const isManager = role === 'Manager';
  const { banner, success, failure, clear } = useBanner();
  const employees = useEmployees(isManager);
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState('tasks');
  const [panel, setPanel] = useState(null); // { type: 'view', id } | { type: 'form', task }
  const [editing, setEditing] = useState(false);
  const [savingMember, setSavingMember] = useState(null);

  async function loadProject() {
    try {
      setProject(await getJson(`/api/workspace/projects/${projectId}/`));
      if (isManager) setMembers(await getJson(`/api/workspace/projects/${projectId}/members/`));
    } catch (error) {
      if (project === null) setLoadError(error.message);
      else failure(error);
    }
  }

  useEffect(() => {
    loadProject();
  }, []);

  const actions = useTaskActions({ reload: loadProject, success });

  async function saveProject(body) {
    await sendJson(`/api/workspace/projects/${projectId}/`, 'PATCH', body);
    setEditing(false);
    success('Project updated.');
    loadProject();
  }

  async function toggleMember(row, isMember) {
    setSavingMember(row.employee_id);
    try {
      await sendJson(`/api/workspace/projects/${projectId}/members/`, 'PUT', {
        employee_id: row.employee_id,
        is_member: isMember,
      });
      setMembers((current) => current.map((item) => (
        item.employee_id === row.employee_id ? { ...item, is_member: isMember } : item
      )));
      success(isMember ? `${row.name} can now see the whole project.` : `${row.name} now only sees their assigned tasks.`);
    } catch (error) {
      failure(error);
    } finally {
      setSavingMember(null);
    }
  }

  const backPath = isManager ? '/manager/projects' : '/employee/tasks';

  if (loadError) {
    return (
      <div className="ws-card">
        <EmptyState icon="alert" title="This project could not be opened" action={<a className="ws-btn ws-btn-secondary" href={backPath}>Back</a>}>
          {loadError}
        </EmptyState>
      </div>
    );
  }
  if (!project) return <TableSkeleton rows={4} />;

  const tasks = project.tasks;
  const selected = panel && panel.type === 'view' ? tasks.find((task) => task.id === panel.id) : null;
  const memberCount = members.filter((row) => row.is_member).length;
  const reviewCount = tasks.filter((task) => task.status === 'in_review').length;
  const overdueCount = tasks.filter((task) => isOverdue(task)).length;
  const taskStats = [
    { label: 'Tasks', value: tasks.length },
    { label: 'Completed', value: tasks.filter((task) => task.status === 'completed').length },
    { label: 'Awaiting review', value: reviewCount, tone: reviewCount ? 'warn' : '' },
    { label: 'Overdue', value: overdueCount, tone: overdueCount ? 'danger' : '' },
  ];
  const projectHref = (item) => `${isManager ? '/manager' : '/employee'}/project?id=${item.id}`;

  return (
    <>
      {isManager && (
        <HeaderActions>
          <button className="ws-btn ws-btn-secondary" type="button" onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} />
            Edit project
          </button>
          <button className="ws-btn ws-btn-primary" type="button" onClick={() => setPanel({ type: 'form', task: null })}>
            <Icon name="plus" size={15} />
            Add task
          </button>
        </HeaderActions>
      )}

      <Banner message={banner.message} isError={banner.isError} onClose={clear} />

      <section className="ws-card ws-project-head">
        <div>
          <h2>{project.name}</h2>
          <p className="ws-project-desc">{project.description || 'No description yet.'}</p>
          <p className="ws-meta">Managed by {project.manager} · Created {formatDate(project.created_at)}</p>
        </div>
        <ProgressBar progress={project.progress} />
      </section>

      <Stats items={taskStats} />

      {isManager && (
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[['tasks', 'Tasks', tasks.length], ['members', 'Members', memberCount]]}
        />
      )}

      {tab === 'tasks' && (
        tasks.length === 0 ? (
          <div className="ws-card">
            <EmptyState
              title="This project has no tasks yet"
              action={isManager ? <button className="ws-btn ws-btn-primary" type="button" onClick={() => setPanel({ type: 'form', task: null })}>Add the first task</button> : null}
            >
              Tasks added to this project will appear here.
            </EmptyState>
          </div>
        ) : (
          <TaskTable tasks={tasks} showProject={false} selectedId={selected ? selected.id : null} onOpen={(task) => setPanel({ type: 'view', id: task.id })} />
        )
      )}

      {isManager && tab === 'members' && (
        <section className="ws-card">
          <div className="ws-card-head">
            <h3>Who can see this project</h3>
            <p>
              Members see the whole project and every task in it. Other employees only see the tasks
              assigned to them.
            </p>
          </div>
          {members.length === 0 ? (
            <EmptyState icon="users" title="No employees in your department yet" />
          ) : (
            <ul className="ws-member-list">
              {members.map((row) => (
                <li key={row.employee_id} className="ws-member-row">
                  <span className="ws-person"><Avatar name={row.name} size={28} />{row.name}</span>
                  <span className="ws-member-state">{row.is_member ? 'Full project access' : 'Assigned tasks only'}</span>
                  <Switch
                    checked={row.is_member}
                    disabled={savingMember === row.employee_id}
                    label={`${row.name} can see the whole project`}
                    onChange={(value) => toggleMember(row, value)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selected && (
        <Drawer title="Task details" onClose={() => setPanel(null)}>
          <TaskPanel
            task={selected}
            role={role}
            projectHref={projectHref}
            onEdit={isManager ? () => setPanel({ type: 'form', task: selected }) : undefined}
            onReview={actions.review}
            onAdvance={actions.advance}
          />
        </Drawer>
      )}

      {isManager && panel && panel.type === 'form' && (
        <Drawer title={panel.task ? 'Edit task' : 'Add task'} onClose={() => setPanel(panel.task ? { type: 'view', id: panel.task.id } : null)}>
          <TaskForm
            task={panel.task}
            projects={[{ id: project.id, name: project.name }]}
            lockedProjectId={project.id}
            employees={employees}
            onSubmit={async (body) => {
              await actions.save(panel.task, body);
              setPanel(panel.task ? { type: 'view', id: panel.task.id } : null);
            }}
            onCancel={() => setPanel(panel.task ? { type: 'view', id: panel.task.id } : null)}
          />
        </Drawer>
      )}

      {editing && (
        <Modal title="Edit project" onClose={() => setEditing(false)}>
          <ProjectForm project={project} onSubmit={saveProject} onCancel={() => setEditing(false)} />
        </Modal>
      )}
    </>
  );
}

export default function ProjectDetails({ role }) {
  const crumbs = role === 'Manager'
    ? [['Projects', '/manager/projects'], ['Project details']]
    : [['My tasks', '/employee/tasks'], ['Project details']];
  return (
    <Shell role={role} title="Project details" breadcrumbs={crumbs}>
      <DetailsContent role={role} />
    </Shell>
  );
}
