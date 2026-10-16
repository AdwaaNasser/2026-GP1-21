import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { PriorityBadge, ProgressBar, StatusBadge, getJson, sendJson } from './taskUi.jsx';

// Shared by the manager (can edit, can set visibility) and the employee (read only).
function DetailsContent({ role }) {
  const projectId = new URLSearchParams(window.location.search).get('id');
  const isManager = role === 'Manager';
  const [project, setProject] = useState(null);
  const [access, setAccess] = useState([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function showError(error) {
    setIsError(true);
    setMessage(error.message);
  }

  async function loadProject() {
    try {
      const data = await getJson(`/api/workspace/projects/${projectId}/`);
      setProject(data);
      setName(data.name);
      setDescription(data.description);
      if (isManager) {
        setAccess(await getJson(`/api/workspace/projects/${projectId}/access/`));
      }
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    loadProject();
  }, []);

  async function saveProject(event) {
    event.preventDefault();
    if (!name.trim()) {
      setIsError(true);
      setMessage('Project name is required.');
      return;
    }
    try {
      await sendJson(`/api/workspace/projects/${projectId}/`, 'PATCH', { name: name.trim(), description });
      setEditing(false);
      setIsError(false);
      setMessage('Project updated.');
      loadProject();
    } catch (error) {
      showError(error);
    }
  }

  async function changeMode(employeeId, mode) {
    try {
      await sendJson(`/api/workspace/projects/${projectId}/access/`, 'PUT', {
        employee_id: employeeId,
        mode,
      });
      setAccess(access.map((row) => (row.employee_id === employeeId ? { ...row, mode } : row)));
      setIsError(false);
      setMessage('Visibility updated.');
    } catch (error) {
      showError(error);
    }
  }

  if (!project) {
    return <Banner message={message || 'Loading project…'} isError={isError} />;
  }

  const backLink = isManager ? '/manager/projects' : '/employee/tasks';

  return (
    <>
      <Banner message={message} isError={isError} />
      <a href={backLink}>← Back</a>

      <section className="dashboard-panel">
        <div className="dashboard-toolbar">
          <div>
            <h2>{project.name}</h2>
            <p className="description">{project.description || 'No description yet.'}</p>
            <p className="description">Managed by {project.manager}</p>
          </div>
          {isManager && (
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => setEditing(!editing)}>
                {editing ? 'Cancel' : 'Edit project'}
              </button>
              <a className="button button-primary" href={`/manager/tasks?project=${project.id}`}>Add task</a>
            </div>
          )}
        </div>
        <ProgressBar progress={project.progress} />

        {editing && (
          <form className="task-form" onSubmit={saveProject}>
            <label>
              Project name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
            </label>
            <label className="wide">
              Description
              <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <button className="button button-primary" type="submit">Save changes</button>
          </form>
        )}
      </section>

      <section className="dashboard-panel">
        <h2>Project tasks</h2>
        {project.tasks.length === 0 ? (
          <div className="empty-state">This project has no tasks yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th></tr>
              </thead>
              <tbody>
                {project.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.assignee.name}</td>
                    <td>{task.due_date}</td>
                    <td><PriorityBadge priority={task.priority} /></td>
                    <td><StatusBadge status={task.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isManager && (
        <section className="dashboard-panel">
          <h2>Who can see this project</h2>
          <p className="description">
            Full visibility lets an employee view this project and all its tasks (read only).
            Assigned tasks only lets them see just the tasks given to them.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Visibility</th></tr>
              </thead>
              <tbody>
                {access.map((row) => (
                  <tr key={row.employee_id}>
                    <td>{row.name}</td>
                    <td>
                      <select value={row.mode} onChange={(event) => changeMode(row.employee_id, event.target.value)}>
                        <option value="assigned_only">Assigned tasks only</option>
                        <option value="full">Full project visibility</option>
                      </select>
                    </td>
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

export default function ProjectDetails({ role }) {
  return (
    <Shell role={role} title="Project details">
      <DetailsContent role={role} />
    </Shell>
  );
}
