import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { ProgressBar, getJson, sendJson } from './taskUi.jsx';

function ProjectsContent() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function loadProjects() {
    try {
      setProjects(await getJson('/api/workspace/projects/'));
    } catch (error) {
      setIsError(true);
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function createProject(event) {
    event.preventDefault();
    setMessage('');
    if (!name.trim()) {
      setIsError(true);
      setMessage('Project name is required.');
      return;
    }
    try {
      await sendJson('/api/workspace/projects/', 'POST', { name: name.trim(), description });
      setName('');
      setDescription('');
      setIsError(false);
      setMessage('Project created.');
      loadProjects();
    } catch (error) {
      setIsError(true);
      setMessage(error.message);
    }
  }

  return (
    <>
      <Banner message={message} isError={isError} />

      <section className="dashboard-panel">
        <h2>New project</h2>
        <form className="task-form" onSubmit={createProject}>
          <label>
            Project name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
          </label>
          <label className="wide">
            Description
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <button className="button button-primary" type="submit">Create project</button>
        </form>
      </section>

      <section className="dashboard-panel">
        <h2>Your projects</h2>
        {projects.length === 0 ? (
          <div className="empty-state">You have not created any projects yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Progress</th><th>Created</th><th></th></tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td><ProgressBar progress={project.progress} /></td>
                    <td>{project.created_at.slice(0, 10)}</td>
                    <td><a className="secondary-button link-button" href={`/manager/project?id=${project.id}`}>Open</a></td>
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

export default function ManagerProjects() {
  return (
    <Shell role="Manager" title="Projects">
      <ProjectsContent />
    </Shell>
  );
}
