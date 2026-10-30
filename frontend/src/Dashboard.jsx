import { useEffect, useMemo, useState } from 'react';
import { apiRequest, displayName, getLogin, responseData } from './api.js';

import Shell, { Banner } from './Shell.jsx';
import {
  EmptyState,
  Icon,
  ProgressBar,
  Stats,
  StatusBadge,
  TableSkeleton,
  formatDate,
  getJson,
  isOverdue,
  sortTasks,
  useBanner,
} from './taskUi.jsx';

function dashboardPath(role) {
  if (role === 'HR' || role === 'HR Professional') return '/dashboard/hr';
  if (role === 'Manager') return '/dashboard/manager';
  return '/dashboard/employee';
}

// ---------- Overview hero (shared by every role) ----------

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// A greeting, one sentence about where things stand, the main actions, and a
// small column chart that rises into place once when the page opens.
function OverviewHero({ name, lead, actions, chartTitle, columns = [], emptyText }) {
  const max = Math.max(1, ...columns.map((column) => column.value));
  const hasData = columns.some((column) => column.value > 0);
  const withChart = columns.length > 0;
  return (
    <section className={`ov-hero${withChart ? '' : ' ov-hero-solo'}`}>
      <div className="ov-copy">
        <h2>{greeting()}, {name}.</h2>
        <p className="ov-lead">{lead}</p>
        <div className="ov-actions">{actions}</div>
      </div>
      {withChart && <figure className="ov-chart">
        <figcaption>{chartTitle}</figcaption>
        {hasData ? (
          <div className="ov-cols" role="img" aria-label={columns.map((column) => `${column.label}: ${column.value}`).join(', ')}>
            {columns.map((column, index) => (
              <div className={`ov-col${column.hot ? ' ov-hot' : ''}`} key={column.label} style={{ '--i': index }}>
                <span className="ov-val">{column.value}</span>
                <span className="ov-bar" style={{ '--h': column.value / max }} />
                <span className="ov-name" title={column.label}>{column.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ov-empty">{emptyText}</p>
        )}
      </figure>}
    </section>
  );
}

function firstName(user) {
  return user?.first_name || displayName(user).split(' ')[0];
}

// ---------- HR overview ----------
// A summary of the organization. Adding, importing and editing people lives on
// the People page, so nothing is done twice.

export default function Dashboard({ role }) {
  const [login, setLogin] = useState(null);
  const [employees, setEmployees] = useState(null);
  const { banner, failure, clear } = useBanner();

  useEffect(() => {
    const savedLogin = getLogin();
    if (!savedLogin) {
      window.location.replace('/login');
      return;
    }
    const actualRole = savedLogin.user.role === 'HR Professional' ? 'HR' : savedLogin.user.role;
    if (actualRole !== role) {
      window.location.replace(dashboardPath(actualRole));
      return;
    }
    setLogin(savedLogin);
    // The old overview kept its own import summary; it now lives on the People page.
    try { sessionStorage.removeItem('bayyinahCsvImportV2'); } catch { /* storage can be blocked */ }
    apiRequest('/api/accounts/employees/')
      .then(responseData)
      .then(setEmployees)
      .catch((error) => {
        failure(error);
        setEmployees([]);
      });
  }, [role]);

  const summary = useMemo(() => {
    const people = employees || [];
    const departments = {};
    people.forEach((person) => {
      const name = person.department?.name || 'No department';
      departments[name] = (departments[name] || 0) + 1;
    });
    return {
      total: people.length,
      managers: people.filter((person) => person.role === 'Manager').length,
      hr: people.filter((person) => person.role === 'HR').length,
      waiting: people.filter((person) => person.invitation_pending).sort((a, b) => b.id - a.id),
      departments: Object.entries(departments).sort((a, b) => b[1] - a[1]),
    };
  }, [employees]);

  if (!login) {
    return <main className="page"><section className="card">Opening your workspace…</section></main>;
  }

  return (
    <Shell role="HR" title="Overview">
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      {employees === null ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <OverviewHero
            name={firstName(login.user)}
            lead={summary.total === 0
              ? 'Your workspace is empty. Add your first employee or import a CSV file to get started.'
              : `${summary.total} ${summary.total === 1 ? 'employee' : 'employees'} across ${summary.departments.length} ${summary.departments.length === 1 ? 'department' : 'departments'}${summary.waiting.length ? `, and ${summary.waiting.length} ${summary.waiting.length === 1 ? 'has' : 'have'} not logged in yet` : ', all set up'}.`}
            actions={(
              <>
                <a className="ws-btn ws-btn-primary" href="/hr/team"><Icon name="users" size={16} />{summary.total === 0 ? 'Add employees' : 'Manage employees'}</a>
                <a className="ws-btn ws-btn-secondary" href="/hr/performance"><Icon name="flag" size={16} />View performance</a>
              </>
            )}
            chartTitle="Employees by department"
            columns={summary.departments.slice(0, 6).map(([name, count], index) => ({ label: name, value: count, hot: index === 0 }))}
            emptyText="Departments show up here once you add employees."
          />

          <Stats items={[
            { label: 'Employees', value: summary.total },
            { label: 'Managers', value: summary.managers },
            { label: 'HR professionals', value: summary.hr },
            { label: 'Departments', value: summary.departments.length },
            { label: 'Waiting for first login', value: summary.waiting.length, tone: summary.waiting.length ? 'warn' : '' },
          ]}
          />

          <section className="ws-card ws-side-card">
            <div className="ws-card-head">
              <h3>Waiting for first login</h3>
              <a className="ws-link" href="/hr/team">Open Employees</a>
            </div>
            {summary.waiting.length === 0 ? (
              <p className="ws-hint ws-list-empty">Everyone you added has set up their account.</p>
            ) : (
              <ul className="ws-mini-list">
                {summary.waiting.slice(0, 6).map((person) => (
                  <li key={person.id}>
                    <span className="ws-person">
                      <span className="ws-mini-title">{displayName(person)}</span>
                    </span>
                    <span className="ws-mini-meta">{person.department?.name || person.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}

// ---------- Manager and employee overview ----------

const ACTIONABLE = ['todo', 'in_progress', 'changes_requested'];

// A short list of tasks. Each row links to the page where the task can be opened.
function TaskList({ tasks, href, empty }) {
  if (tasks.length === 0) return <p className="ws-hint ws-list-empty">{empty}</p>;
  return (
    <ul className="ws-mini-list">
      {tasks.map((task) => (
        <li key={task.id}>
          <a className="ws-plain-link" href={href(task)}>
            <span className="ws-mini-title">{task.title}</span>
            <span className="ws-mini-meta">{displayName(task.assignee)} · {isOverdue(task) ? 'overdue since ' : 'due '}{formatDate(task.due_date)}</span>
          </a>
          <StatusBadge status={task.status} />
        </li>
      ))}
    </ul>
  );
}

function PeopleTable({ people }) {
  if (people.length === 0) {
    return <EmptyState icon="users" title="No employee records are available for this account yet" />;
  }
  return (
    <div className="ws-table-card">
      <table className="ws-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th></tr></thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <td className="ws-task-title">{displayName(person)}</td>
              <td>{person.email}</td>
              <td>{person.role}</td>
              <td>{person.department?.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewContent({ role }) {
  const isManager = role === 'Manager';
  const { banner, failure, clear } = useBanner();
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [tasks, projects, people] = await Promise.all([
          getJson('/api/workspace/tasks/'),
          getJson('/api/workspace/projects/'),
          getJson('/api/accounts/employees/'),
        ]);
        setData({ tasks, projects, people });
      } catch (error) {
        failure(error);
        setData({ tasks: [], projects: [], people: [] });
      }
    }
    load();
  }, []);

  if (!data) return <TableSkeleton rows={4} />;

  const { tasks, projects, people } = data;

  if (isManager) {
    const open = tasks.filter((task) => task.status !== 'completed');
    const review = sortTasks(tasks.filter((task) => task.status === 'in_review'), 'due');
    const overdue = sortTasks(tasks.filter((task) => isOverdue(task)), 'due');
    const taskHref = (task) => `/manager/tasks?task=${task.id}`;
    const done = tasks.filter((task) => task.status === 'completed').length;
    return (
      <>
        <Banner message={banner.message} isError={banner.isError} onClose={clear} />
        <OverviewHero
          name={firstName(getLogin()?.user)}
          lead={review.length + overdue.length === 0
            ? 'Nothing is waiting on you right now.'
            : `${review.length} ${review.length === 1 ? 'task is' : 'tasks are'} waiting for your review${overdue.length ? ` and ${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue` : ''}.`}
          actions={(
            <>
              <a className="ws-btn ws-btn-primary" href="/manager/tasks"><Icon name="tasks" size={16} />Open tasks</a>
              <a className="ws-btn ws-btn-secondary" href="/manager/goals"><Icon name="flag" size={16} />Team performance</a>
            </>
          )}
          chartTitle="Tasks by status"
          columns={[
            { label: 'To do', value: tasks.filter((task) => task.status === 'todo').length },
            { label: 'In progress', value: tasks.filter((task) => ['in_progress', 'changes_requested'].includes(task.status)).length },
            { label: 'In review', value: review.length, hot: true },
            { label: 'Completed', value: done },
          ]}
          emptyText="Create a task to see your workload here."
        />
        <Stats items={[
          { label: 'Projects', value: projects.length },
          { label: 'Open tasks', value: open.length },
          { label: 'Awaiting review', value: review.length, tone: review.length ? 'warn' : '' },
          { label: 'Overdue', value: overdue.length, tone: overdue.length ? 'danger' : '' },
        ]}
        />
        <div className="ws-two-col">
          <section className="ws-card ws-side-card">
            <div className="ws-card-head"><h3>Awaiting your review</h3><a className="ws-link" href="/manager/tasks">All tasks</a></div>
            <TaskList tasks={review.slice(0, 5)} href={taskHref} empty="Nothing is waiting for your review." />
          </section>
          <section className="ws-card ws-side-card">
            <div className="ws-card-head"><h3>Overdue</h3><a className="ws-link" href="/manager/tasks">All tasks</a></div>
            <TaskList tasks={overdue.slice(0, 5)} href={taskHref} empty="No overdue tasks." />
          </section>
        </div>
        <section className="ws-card ws-side-card">
          <div className="ws-card-head"><h3>Your projects</h3><a className="ws-link" href="/manager/projects">All projects</a></div>
          {projects.length === 0 ? (
            <p className="ws-hint ws-list-empty">You have not created any projects yet.</p>
          ) : (
            <ul className="ws-member-list">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id} className="ws-member-row">
                  <a className="ws-plain-link ws-task-title" href={`/manager/project?id=${project.id}`}>{project.name}</a>
                  <ProgressBar progress={project.progress} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ws-card ws-side-card">
          <div className="ws-card-head"><h3>Your team</h3></div>
          <PeopleTable people={people} />
        </section>
      </>
    );
  }


  const mine = tasks.filter((task) => task.is_mine);
  const actionable = mine.filter((task) => ACTIONABLE.includes(task.status));
  const changes = mine.filter((task) => task.status === 'changes_requested');
  const overdue = actionable.filter((task) => isOverdue(task));
  const attention = sortTasks(
    actionable.filter((task) => task.status === 'changes_requested' || isOverdue(task)),
    'due',
  );
  return (
    <>
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      <OverviewHero
        name={firstName(getLogin()?.user)}
        lead={attention.length === 0
          ? (actionable.length ? `You have ${actionable.length} open ${actionable.length === 1 ? 'task' : 'tasks'}, and none need urgent attention.` : 'You are all caught up.')
          : `${attention.length} ${attention.length === 1 ? 'task needs' : 'tasks need'} your attention${changes.length ? `, including ${changes.length} with changes requested` : ''}.`}
        actions={(
          <>
            <a className="ws-btn ws-btn-primary" href="/employee/tasks"><Icon name="tasks" size={16} />My tasks</a>
            <a className="ws-btn ws-btn-secondary" href="/employee/performance"><Icon name="flag" size={16} />My performance</a>
          </>
        )}
      />
      <Stats items={[
        { label: 'Open tasks', value: actionable.length },
        { label: 'Changes requested', value: changes.length, tone: changes.length ? 'danger' : '' },
        { label: 'Overdue', value: overdue.length, tone: overdue.length ? 'danger' : '' },
        { label: 'Submitted', value: mine.filter((task) => task.status === 'in_review').length },
        { label: 'Completed', value: mine.filter((task) => task.status === 'completed').length },
      ]}
      />
      <section className="ws-card ws-side-card">
        <div className="ws-card-head"><h3>Needs your attention</h3><a className="ws-link" href="/employee/tasks">My tasks</a></div>
        <TaskList tasks={attention.slice(0, 6)} href={(task) => `/employee/tasks?task=${task.id}`} empty="You are all caught up." />
      </section>
      <section className="ws-card ws-side-card">
        <div className="ws-card-head"><h3>Your employee profile</h3></div>
        <PeopleTable people={people} />
      </section>
    </>
  );
}

function WorkspaceOverview({ role }) {
  return (
    <Shell role={role} title="Overview">
      <OverviewContent role={role} />
    </Shell>
  );
}

export function DashboardRouter({ role }) {
  if (role === 'HR' || role === 'HR Professional') {
    return <Dashboard role="HR" />;
  }

  return <WorkspaceOverview role={role} />;
}

