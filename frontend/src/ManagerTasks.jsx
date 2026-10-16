import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { PRIORITIES, STATUSES, PriorityBadge, StatusBadge, getJson, sendJson, today } from './taskUi.jsx';

function emptyForm() {
  const projectFromLink = new URLSearchParams(window.location.search).get('project') || '';
  return {
    title: '',
    description: '',
    project: projectFromLink,
    assignee: '',
    start_date: today(),
    due_date: '',
    priority: 'medium',
    status: 'todo',
  };
}

function TasksContent() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function showError(error) {
    setIsError(true);
    setMessage(error.message);
  }

  async function loadTasks() {
    try {
      setTasks(await getJson('/api/workspace/tasks/'));
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    async function loadLists() {
      try {
        setProjects(await getJson('/api/workspace/projects/'));
        const people = await getJson('/api/accounts/employees/');
        setEmployees(people.filter((person) => person.role === 'Employee'));
      } catch (error) {
        showError(error);
      }
    }
    loadLists();
    loadTasks();
  }, []);

  function setField(name, value) {
    setForm({ ...form, [name]: value });
  }

  // Same rules as the backend, so the manager sees problems before sending.
  function validate() {
    if (!form.title.trim()) return 'Task title is required.';
    if (!form.assignee) return 'Choose an employee to assign the task to.';
    if (!form.start_date) return 'Start date is required.';
    if (!form.due_date) return 'Due date is required.';
    if (form.due_date < form.start_date) return 'The due date cannot be before the start date.';
    return '';
  }

  async function saveTask(event) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setIsError(true);
      setMessage(problem);
      return;
    }

    const body = {
      title: form.title.trim(),
      description: form.description,
      project: form.project ? Number(form.project) : null,
      assignee: Number(form.assignee),
      start_date: form.start_date,
      due_date: form.due_date,
      priority: form.priority,
      status: form.status,
    };

    try {
      if (editingId) {
        await sendJson(`/api/workspace/tasks/${editingId}/`, 'PATCH', body);
      } else {
        await sendJson('/api/workspace/tasks/', 'POST', body);
      }
      setIsError(false);
      setMessage(editingId ? 'Task updated.' : 'Task created.');
      setEditingId(null);
      setForm(emptyForm());
      loadTasks();
    } catch (error) {
      showError(error);
    }
  }

  function startEditing(task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      project: task.project ? String(task.project.id) : '',
      assignee: String(task.assignee.id),
      start_date: task.start_date,
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm());
  }

  return (
    <>
      <Banner message={message} isError={isError} />

      <section className="dashboard-panel">
        <h2>{editingId ? 'Edit task' : 'New task'}</h2>
        <form className="task-form" onSubmit={saveTask}>
          <label>
            Title
            <input value={form.title} onChange={(event) => setField('title', event.target.value)} maxLength={255} />
          </label>
          <label>
            Project (optional)
            <select value={form.project} onChange={(event) => setField('project', event.target.value)}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Description and instructions
            <textarea rows={3} value={form.description} onChange={(event) => setField('description', event.target.value)} />
          </label>
          <label>
            Assignee
            <select value={form.assignee} onChange={(event) => setField('assignee', event.target.value)}>
              <option value="">Choose an employee</option>
              {employees.map((person) => (
                <option key={person.id} value={person.id}>{person.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(event) => setField('priority', event.target.value)}>
              {PRIORITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={form.start_date} onChange={(event) => setField('start_date', event.target.value)} />
          </label>
          <label>
            Due date
            <input type="date" value={form.due_date} onChange={(event) => setField('due_date', event.target.value)} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(event) => setField('status', event.target.value)}>
              {STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <div className="button-row">
            <button className="button button-primary" type="submit">
              {editingId ? 'Save changes' : 'Create task'}
            </button>
            {editingId && (
              <button className="secondary-button" type="button" onClick={cancelEditing}>Cancel</button>
            )}
          </div>
        </form>
      </section>

      <section className="dashboard-panel">
        <h2>Tasks you created</h2>
        {tasks.length === 0 ? (
          <div className="empty-state">No tasks yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th><th>Project</th><th>Assignee</th><th>Start</th>
                  <th>Due</th><th>Priority</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.project ? task.project.name : '—'}</td>
                    <td>{task.assignee.name}</td>
                    <td>{task.start_date}</td>
                    <td>{task.due_date}</td>
                    <td><PriorityBadge priority={task.priority} /></td>
                    <td><StatusBadge status={task.status} /></td>
                    <td><button className="secondary-button" type="button" onClick={() => startEditing(task)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function ManagerTasks() {
  return (
    <Shell role="Manager" title="Tasks">
      <TasksContent />
    </Shell>
  );
}
