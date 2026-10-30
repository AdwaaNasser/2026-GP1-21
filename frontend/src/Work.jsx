import { useEffect, useState, useRef } from 'react';
import { displayName } from './api.js';
import {
  Shell,
  Banner,
  HeaderActions,
  EmptyState,
  Icon,
  Modal,
  ProgressBar,
  ProjectForm,
  TableSkeleton,
  formatDate,
  getJson,
  sendJson,
  useBanner,
  Drawer,
  Stats,
  TaskForm,
  TaskPanel,
  TaskTable,
  isOverdue,
  useEmployees,
  useTaskActions,
  deleteRequest,
  ConfirmDialog,
  DEFAULT_FILTERS,
  PRIORITIES,
  STATUSES,
  filterTasks,
  sortTasks,
  EMPLOYEE_ACTIONS,
  Tabs,
  today,
} from './ui.jsx';

// ==================== ManagerProjects ====================

function ProjectsContent() {
  const { banner, success, failure, clear } = useBanner();
  const [projects, setProjects] = useState(null); // null while loading
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadProjects() {
    try {
      setProjects(await getJson('/api/workspace/projects/'));
    } catch (error) {
      failure(error);
      setProjects((current) => current || []);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function createProject(body) {
    await sendJson('/api/workspace/projects/', 'POST', body);
    setCreating(false);
    success('Project created.');
    loadProjects();
  }

  function open(project) {
    window.location.assign(`/manager/project?id=${project.id}`);
  }

  const text = search.trim().toLowerCase();
  const shown = (projects || []).filter(
    (project) => !text || `${project.name} ${project.description}`.toLowerCase().includes(text),
  );

  return (
    <>
      <HeaderActions>
        <button className="ws-btn ws-btn-primary" type="button" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} />
          New project
        </button>
      </HeaderActions>

      <Banner message={banner.message} isError={banner.isError} onClose={clear} />

      <div className="ws-toolbar">
        <label className="ws-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search projects" />
        </label>
      </div>

      {projects === null ? (
        <TableSkeleton />
      ) : projects.length === 0 ? (
        <div className="ws-card">
          <EmptyState
            icon="folder"
            title="No projects yet"
            action={<button className="ws-btn ws-btn-primary" type="button" onClick={() => setCreating(true)}>Create your first project</button>}
          >
            Projects group related tasks and show how far your team has got.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="ws-card"><EmptyState icon="search" title="No projects match your search" /></div>
      ) : (
        <div className="ws-card ws-table-card">
          <table className="ws-table">
            <thead>
              <tr><th>Project Name</th><th>Progress</th><th>Created</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {shown.map((project) => (
                <tr
                  key={project.id}
                  className="ws-row"
                  tabIndex={0}
                  onClick={(event) => {
                    if (!event.target.closest('a')) open(project);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target === event.currentTarget) open(project);
                  }}
                >
                  <td>
                    <a className="ws-task-title ws-plain-link" href={`/manager/project?id=${project.id}`}>{project.name}</a>
                    {project.description && <div className="ws-task-sub ws-clamp">{project.description}</div>}
                  </td>
                  <td className="ws-progress-cell"><ProgressBar progress={project.progress} /></td>
                  <td>{formatDate(project.created_at)}</td>
                  <td className="ws-chevron-cell"><Icon name="chevron" size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <ProjectForm onSubmit={createProject} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </>
  );
}

export function ManagerProjects() {
  return (
    <Shell role="Manager" title="Projects">
      <ProjectsContent />
    </Shell>
  );
}

// ==================== ProjectDetails ====================

function DetailsContent({ role }) {
  const projectId = new URLSearchParams(window.location.search).get('id');
  const isManager = role === 'Manager';
  const { banner, success, failure, clear } = useBanner();
  const employees = useEmployees(isManager);

  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteInFlight = useRef(false); // blocks a second DELETE from repeated clicks

  async function loadProject() {
    try {
      setProject(await getJson(`/api/workspace/projects/${projectId}/`));
      setLoadError('');
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

  // Runs only after the manager confirms in the dialog. The dialog stays open
  // (buttons disabled) until the server answers; a failure is shown inside it
  // and nothing is deleted.
  async function deleteProject() {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteRequest(`/api/workspace/projects/${projectId}/`);
      window.location.assign('/manager/projects');
    } catch (error) {
      setDeleteError(error.message || 'The project could not be deleted. Please try again.');
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  function cancelDeleteProject() {
    setConfirmingDelete(false);
    setDeleteError('');
  }

  const backPath = isManager ? '/manager/projects' : '/employee/tasks';

  if (loadError) {
    return (
      <div className="ws-card">
        <EmptyState
          icon="alert"
          title="This project could not be opened"
          action={
            <a className="ws-btn ws-btn-secondary" href={backPath}>
              Back
            </a>
          }
        >
          {loadError}
        </EmptyState>
      </div>
    );
  }

  if (!project) return <TableSkeleton rows={4} />;

  const tasks = project.tasks || [];
  const selected =
    panel && panel.type === 'view'
      ? tasks.find((task) => task.id === panel.id)
      : null;

  const reviewCount = tasks.filter(
    (task) => task.status === 'in_review'
  ).length;

  const overdueCount = tasks.filter((task) => isOverdue(task)).length;

  // For the delete warning. A manager's project response lists every task,
  // so this is the number of tasks the DELETE will remove.
  const taskCount = project.progress?.total_tasks ?? tasks.length;
  const linkedTaskCount = tasks.filter((task) => (task.linked_goals || []).length > 0).length;

  const taskStats = [
    { label: 'Tasks', value: tasks.length },
    {
      label: 'Completed',
      value: tasks.filter((task) => task.status === 'completed').length,
    },
    {
      label: 'Awaiting review',
      value: reviewCount,
      tone: reviewCount ? 'warn' : '',
    },
    {
      label: 'Overdue',
      value: overdueCount,
      tone: overdueCount ? 'danger' : '',
    },
  ];

  const projectHref = (item) =>
    `${isManager ? '/manager' : '/employee'}/project?id=${item.id}`;

  return (
    <>
      {isManager && (
        <HeaderActions>
          <button
            className="ws-btn ws-btn-secondary"
            type="button"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={15} />
            Edit project
          </button>
           
<button
  className="ws-btn ws-btn-outline-danger"
  type="button"
  disabled={deleting}
  onClick={() => setConfirmingDelete(true)}
>
  <Icon name="x" size={15} />
  Delete project
</button>

          <button
            className="ws-btn ws-btn-primary"
            type="button"
            onClick={() => setPanel({ type: 'form', task: null })}
          >
            <Icon name="plus" size={15} />
            Add task
          </button>
        </HeaderActions>
      )}

      <Banner
        message={banner.message}
        isError={banner.isError}
        onClose={clear}
      />

      <section className="ws-card ws-project-head">
        <div>
          <h2>{project.name}</h2>
          <p className="ws-project-desc">
            {project.description || 'No description yet.'}
          </p>
          <p className="ws-meta">
            Managed by {displayName(project.manager)}
          </p>
        </div>
        <ProgressBar progress={project.progress} />
      </section>

      <Stats items={taskStats} />

      {tasks.length === 0 ? (
        <div className="ws-card">
          <EmptyState
            title="This project has no tasks yet"
            action={
              isManager ? (
                <button
                  className="ws-btn ws-btn-primary"
                  type="button"
                  onClick={() => setPanel({ type: 'form', task: null })}
                >
                  Add the first task
                </button>
              ) : null
            }
          >
            Tasks added to this project will appear here.
          </EmptyState>
        </div>
      ) : (
        <TaskTable
          tasks={tasks}
          showProject={false}
          selectedId={selected ? selected.id : null}
          onOpen={(task) => setPanel({ type: 'view', id: task.id })}
        />
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
  onDelete={
    isManager
      ? async (task) => {
          await actions.remove(task);
          setPanel(null);
        }
      : undefined
  }
/>
        </Drawer>
      )}

      {isManager && panel && panel.type === 'form' && (
        <Drawer
          title={panel.task ? 'Edit task' : 'Add task'}
          onClose={() =>
            setPanel(
              panel.task ? { type: 'view', id: panel.task.id } : null
            )
          }
        >
          <TaskForm
            task={panel.task}
            projects={[{ id: project.id, name: project.name }]}
            lockedProjectId={project.id}
            employees={employees}
            onSubmit={async (body) => {
              await actions.save(panel.task, body);
              setPanel(
                panel.task ? { type: 'view', id: panel.task.id } : null
              );
            }}
            onCancel={() =>
              setPanel(
                panel.task ? { type: 'view', id: panel.task.id } : null
              )
            }
          />
        </Drawer>
      )}

      {editing && (
        <Modal title="Edit project" onClose={() => setEditing(false)}>
          <ProjectForm
            project={project}
            onSubmit={saveProject}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
      {isManager && confirmingDelete && (
        <ConfirmDialog
          title={taskCount ? 'Delete this project and its tasks?' : 'Delete project'}
          message={
            taskCount
              ? `"${project.name}" has ${taskCount} task${taskCount === 1 ? '' : 's'}. Deleting the project will also permanently delete ${taskCount === 1 ? 'it' : 'all of them'}.${linkedTaskCount ? ` ${linkedTaskCount} of these tasks count toward employee goals, so those goals may lose progress.` : ''} This cannot be undone.`
              : `Delete "${project.name}"? This cannot be undone.`
          }
          confirmLabel="Delete project"
          busyLabel="Deleting…"
          busy={deleting}
          error={deleteError}
          onCancel={cancelDeleteProject}
          onConfirm={deleteProject}
        />
      )}



    </>
  );
}



export function ProjectDetails({ role }) {
  const crumbs =
    role === 'Manager'
      ? [['Projects', '/manager/projects'], ['Project details']]
      : [['My tasks', '/employee/tasks'], ['Project details']];

  return (
    <Shell role={role} title="Project details" breadcrumbs={crumbs}>
      <DetailsContent role={role} />
    </Shell>
  );
}

// ==================== ManagerTasks ====================

const SORTS = [['due', 'Due date'], ['priority', 'Priority'], ['status', 'Status'], ['title', 'Title']];

function TasksContent() {
  const { banner, success, failure, clear } = useBanner();
  const employees = useEmployees();
  const [tasks, setTasks] = useState(null); // null while loading
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('due');
  const [panel, setPanel] = useState(null); // { type: 'view', id } | { type: 'form', task }

  async function loadTasks() {
    try {
      setTasks(await getJson('/api/workspace/tasks/'));
    } catch (error) {
      failure(error);
      setTasks((current) => current || []);
    }
  }

  useEffect(() => {
    loadTasks();
    getJson('/api/workspace/projects/').then(setProjects).catch(failure);
    // Links from other pages: ?project=ID opens the new-task form, ?task=ID opens that task.
    const params = new URLSearchParams(window.location.search);
    if (params.get('project')) setPanel({ type: 'form', task: null });
    else if (params.get('task')) setPanel({ type: 'view', id: Number(params.get('task')) });
  }, []);

  const actions = useTaskActions({ reload: loadTasks, success });

  function setFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const all = tasks || [];
  const reviewCount = all.filter((task) => task.status === 'in_review').length;
  const overdueCount = all.filter((task) => isOverdue(task)).length;
  const shown = sortTasks(filterTasks(all, filters), sort);
  const filtering = filters.search || filters.status !== 'all' || filters.priority !== 'all'
    || filters.assignee !== 'all' || filters.project !== 'all' || filters.quick !== 'all';
  const selected = panel && panel.type === 'view' ? all.find((task) => task.id === panel.id) : null;

  async function saveTask(body) {
    await actions.save(panel.task, body);
    setPanel(panel.task ? { type: 'view', id: panel.task.id } : null);
  }

  const chips = [
    ['all', 'All', all.length],
    ['review', 'Awaiting review', reviewCount],
    ['overdue', 'Overdue', overdueCount],
  ];

  return (
    <>
      <HeaderActions>
        <button className="ws-btn ws-btn-primary" type="button" onClick={() => setPanel({ type: 'form', task: null })}>
          <Icon name="plus" size={15} />
          New task
        </button>
      </HeaderActions>

      <Banner message={banner.message} isError={banner.isError} onClose={clear} />

      <div className="ws-chips">
        {chips.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`ws-chip${filters.quick === key ? ' active' : ''}${key === 'review' && count > 0 ? ' attention' : ''}`}
            onClick={() => setFilter('quick', key)}
          >
            {label}<span className="ws-tab-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="ws-toolbar">
        <label className="ws-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Search tasks" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} aria-label="Search tasks" />
        </label>
        <select className="ws-select ws-select-sm" value={filters.status} onChange={(event) => setFilter('status', event.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <select className="ws-select ws-select-sm" value={filters.priority} onChange={(event) => setFilter('priority', event.target.value)} aria-label="Filter by priority">
          <option value="all">All priorities</option>
          {PRIORITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <select className="ws-select ws-select-sm" value={filters.assignee} onChange={(event) => setFilter('assignee', event.target.value)} aria-label="Filter by assignee">
          <option value="all">All assignees</option>
          {employees.map((person) => <option key={person.id} value={person.id}>{displayName(person)}</option>)}
        </select>
        <select className="ws-select ws-select-sm" value={filters.project} onChange={(event) => setFilter('project', event.target.value)} aria-label="Filter by project">
          <option value="all">All projects</option>
          <option value="none">No project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <span className="ws-spacer" />
        <label className="ws-sort">
          Sort by
          <select className="ws-select ws-select-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      </div>

      {tasks === null ? (
        <TableSkeleton />
      ) : all.length === 0 ? (
        <div className="ws-card">
          <EmptyState
            title="No tasks yet"
            action={<button className="ws-btn ws-btn-primary" type="button" onClick={() => setPanel({ type: 'form', task: null })}>Create your first task</button>}
          >
            Tasks you create and assign to your team will appear here.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="ws-card">
          <EmptyState icon="search" title="No tasks match these filters" action={filtering ? <button className="ws-btn ws-btn-secondary" type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button> : null} />
        </div>
      ) : (
        <TaskTable tasks={shown} selectedId={selected ? selected.id : null} onOpen={(task) => setPanel({ type: 'view', id: task.id })} />
      )}

      {selected && (
        <Drawer title="Task details" onClose={() => setPanel(null)}>
<TaskPanel
  task={selected}
  role="Manager"
  projectHref={(project) => `/manager/project?id=${project.id}`}
  onEdit={() => setPanel({ type: 'form', task: selected })}
  onReview={actions.review}
  onDelete={async (task) => {
    await actions.remove(task);
    setPanel(null);
  }}
/>
        </Drawer>
      )}

      {panel && panel.type === 'form' && (
        <Drawer title={panel.task ? 'Edit task' : 'New task'} onClose={() => setPanel(panel.task ? { type: 'view', id: panel.task.id } : null)}>
          <TaskForm
            task={panel.task}
            projects={projects}
            employees={employees}
            onSubmit={saveTask}
            onCancel={() => setPanel(panel.task ? { type: 'view', id: panel.task.id } : null)}
          />
        </Drawer>
      )}
    </>
  );
}

export function ManagerTasks() {
  return (
    <Shell role="Manager" title="Tasks">
      <TasksContent />
    </Shell>
  );
}

// ==================== EmployeeTasks ====================

// Tasks the employee can still act on.
const ACTIONABLE = ['todo', 'in_progress', 'changes_requested'];

function TasksContent_EmployeeTasks() {
  const { banner, success, failure, clear } = useBanner();
  const [tasks, setTasks] = useState(null); // null while loading
  const [projects, setProjects] = useState([]);
  const [tab, setTab] = useState('open');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('due');
  const [selectedId, setSelectedId] = useState(null);

  async function loadTasks() {
    try {
      setTasks(await getJson('/api/workspace/tasks/'));
      setProjects(await getJson('/api/workspace/projects/'));
    } catch (error) {
      failure(error);
      setTasks((current) => current || []);
    }
  }

  useEffect(() => {
    loadTasks();
    const wanted = new URLSearchParams(window.location.search).get('task');
    if (wanted) setSelectedId(Number(wanted));
  }, []);

  const actions = useTaskActions({ reload: loadTasks, success });

  async function advanceFromRow(task) {
    try {
      await actions.advance(task);
    } catch (error) {
      failure(error);
    }
  }

  const now = today();
  const all = tasks || [];
  const mine = all.filter((task) => task.is_mine);
  const actionable = mine.filter((task) => ACTIONABLE.includes(task.status));
  const lists = {
    open: actionable,
    today: actionable.filter((task) => task.due_date === now),
    upcoming: actionable.filter((task) => task.due_date > now),
    overdue: actionable.filter((task) => isOverdue(task, now)),
    review: mine.filter((task) => task.status === 'in_review'),
    completed: mine.filter((task) => task.status === 'completed'),
    project: all.filter((task) => !task.is_mine),
  };
  const tabs = [
    ['open', 'Open'], ['today', 'Due today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'],
    ['review', 'Submitted'], ['completed', 'Completed'], ['project', 'Project tasks'],
  ].map(([key, label]) => [key, label, lists[key].length]);

  const shown = sortTasks(filterTasks(lists[tab], filters), sort);
  const selected = all.find((task) => task.id === selectedId);
  const needChanges = mine.filter((task) => task.status === 'changes_requested');

  function showChanges() {
    setTab('open');
    setSelectedId(needChanges[0].id);
  }

  return (
    <>
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />

      {needChanges.length > 0 && (
        <div className="ws-callout">
          <Icon name="message" size={18} />
          <div>
            <strong>{needChanges.length === 1 ? '1 task needs changes' : `${needChanges.length} tasks need changes`}</strong>
            <span>Your manager left feedback. Read it, update the work, then submit it again.</span>
          </div>
          <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={showChanges}>View feedback</button>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="ws-toolbar">
        <label className="ws-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Search tasks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} aria-label="Search tasks" />
        </label>
        <select className="ws-select ws-select-sm" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })} aria-label="Filter by priority">
          <option value="all">All priorities</option>
          {PRIORITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <span className="ws-spacer" />
        <label className="ws-sort">
          Sort by
          <select className="ws-select ws-select-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      {tasks === null ? (
        <TableSkeleton />
      ) : shown.length === 0 ? (
        <div className="ws-card">
          <EmptyState icon={tab === 'completed' ? 'check' : 'tasks'} title={filters.search || filters.priority !== 'all' ? 'No tasks match these filters' : 'Nothing here'}>
            {tab === 'open' ? 'You have no open tasks right now.' : 'Tasks will show up in this tab when they apply.'}
          </EmptyState>
        </div>
      ) : (
        <TaskTable
          tasks={shown}
          showAssignee={tab === 'project'}
          selectedId={selectedId}
          onOpen={(task) => setSelectedId(task.id)}
          renderAction={(task) => {
            const action = EMPLOYEE_ACTIONS[task.status];
            if (!task.is_mine || !task.next_status || !action) return null;
            return (
              <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={() => advanceFromRow(task)}>
                <Icon name={action.icon} size={13} />
                {action.label}
              </button>
            );
          }}
        />
      )}

      {projects.length > 0 && (
        <section className="ws-card ws-side-card">
          <div className="ws-card-head"><h3>Projects</h3></div>
          <ul className="ws-member-list">
            {projects.map((project) => (
              <li key={project.id} className="ws-member-row">
                <a className="ws-plain-link ws-task-title" href={`/employee/project?id=${project.id}`}>{project.name}</a>
                <ProgressBar progress={project.progress} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <Drawer title="Task details" onClose={() => setSelectedId(null)}>
          <TaskPanel
            task={selected}
            role="Employee"
            projectHref={(project) => `/employee/project?id=${project.id}`}
            onAdvance={actions.advance}
          />
        </Drawer>
      )}
    </>
  );
}

export function EmployeeTasks() {
  return (
    <Shell role="Employee" title="My tasks">
      <TasksContent_EmployeeTasks />
    </Shell>
  );
}
