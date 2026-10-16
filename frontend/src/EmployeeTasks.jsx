import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { PriorityBadge, StatusBadge, getJson, sendJson, today } from './taskUi.jsx';

const NEXT_BUTTON = {
  in_progress: 'Start task',
  completed: 'Mark as completed',
};

const TABS = [
  ['mine', 'My tasks'],
  ['today', 'Due today'],
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['completed', 'Completed'],
  ['project', 'Project tasks'],
];

function TasksContent() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tab, setTab] = useState('mine');
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function loadTasks() {
    try {
      setTasks(await getJson('/api/workspace/tasks/'));
      setProjects(await getJson('/api/workspace/projects/'));
    } catch (error) {
      setIsError(true);
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function moveForward(task) {
    try {
      await sendJson(`/api/workspace/tasks/${task.id}/`, 'PATCH', { status: task.next_status });
      setIsError(false);
      setMessage('Status updated.');
      loadTasks();
    } catch (error) {
      setIsError(true);
      setMessage(error.message);
    }
  }

  const todayText = today();
  const mine = tasks.filter((task) => task.is_mine);
  const open = mine.filter((task) => task.status !== 'completed');

  const lists = {
    mine,
    today: open.filter((task) => task.due_date === todayText),
    upcoming: open.filter((task) => task.due_date > todayText),
    overdue: open.filter((task) => task.due_date < todayText),
    completed: mine.filter((task) => task.status === 'completed'),
    project: tasks.filter((task) => !task.is_mine),
  };
  const shown = lists[tab];
  const selected = tasks.find((task) => task.id === selectedId);

  return (
    <>
      <Banner message={message} isError={isError} />

      <section className="dashboard-panel">
        <div className="tab-row">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => setTab(key)}
            >
              {text} ({lists[key].length})
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="empty-state">No tasks here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Project</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.project ? task.project.name : '—'}</td>
                    <td>{task.assignee.name}</td>
                    <td>{task.due_date}</td>
                    <td><PriorityBadge priority={task.priority} /></td>
                    <td><StatusBadge status={task.status} /></td>
                    <td><button className="secondary-button" type="button" onClick={() => setSelectedId(task.id)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="dashboard-panel">
          <h2>{selected.title}</h2>
          <p className="description">{selected.description || 'No instructions were added.'}</p>
          <div className="detail-grid">
            <div><strong>Status</strong><StatusBadge status={selected.status} /></div>
            <div><strong>Priority</strong><PriorityBadge priority={selected.priority} /></div>
            <div><strong>Assignee</strong><span>{selected.assignee.name}</span></div>
            <div><strong>Start date</strong><span>{selected.start_date}</span></div>
            <div><strong>Due date</strong><span>{selected.due_date}</span></div>
            <div>
              <strong>Project</strong>
              {selected.project
                ? <a href={`/employee/project?id=${selected.project.id}`}>{selected.project.name}</a>
                : <span>—</span>}
            </div>
          </div>
          {selected.next_status && (
            <button className="button button-primary" type="button" onClick={() => moveForward(selected)}>
              {NEXT_BUTTON[selected.next_status]}
            </button>
          )}
        </section>
      )}

      {projects.length > 0 && (
        <section className="dashboard-panel">
          <h2>Projects you can view</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Progress</th><th></th></tr></thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.progress.percent}%</td>
                    <td><a className="secondary-button link-button" href={`/employee/project?id=${project.id}`}>Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function EmployeeTasks() {
  return (
    <Shell role="Employee" title="My tasks">
      <TasksContent />
    </Shell>
  );
}
