import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { displayName } from './api.js';
import { CURRENT_YEAR, Panel, YearSelect } from './Goals.jsx';
import {
  Avatar,
  EmptyState,
  StatusBadge,
  TableSkeleton,
  formatDate,
  getJson,
  useBanner,
} from './taskUi.jsx';

// "My team": the people who report to this manager, and one page per person
// with their skills, their workload and their KPI performance.

function TeamList({ team, onOpen }) {
  return (
    <Panel title="Your team" hint={`${team.length} ${team.length === 1 ? 'person' : 'people'}`}>
      <div className="ws-table-card">
        <table className="ws-table">
          <thead><tr><th>Name</th><th>Job title</th><th>Department</th><th aria-label="Open" /></tr></thead>
          <tbody>
            {team.map((person) => (
              <tr key={person.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(person.id)}>
                <td>
                  <div className="hr-person">
                    <Avatar name={displayName(person)} size={28} />
                    <div className="ws-task-title">{displayName(person)}</div>
                  </div>
                </td>
                <td>{person.job_title || '—'}</td>
                <td>{person.department || '—'}</td>
                <td>
                  <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(person.id); }}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MemberDetails({ id, onBack }) {
  const { banner, failure, clear } = useBanner();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    getJson(`/api/goals/team/${id}/overview/?year=${year}`)
      .then(setData)
      .catch((error) => failure(error));
  }, [id, year, failure]);

  const name = data ? displayName(data.profile) : '';
  const perf = data ? data.performance : null;

  return (
    <div className="gl-page">
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      <div className="gl-bar">
        <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={onBack}>← Back to team</button>
        <YearSelect year={year} onChange={setYear} />
      </div>
      {data === null ? (
        <TableSkeleton />
      ) : (
        <>
          <section className="gl-panel">
            <div className="hr-person" style={{ padding: 16 }}>
              <Avatar name={name} size={48} />
              <div>
                <div className="ws-task-title">{name}</div>
                <div className="ws-task-sub">
                  {[data.profile.job_title, data.profile.department].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="ws-task-sub">{data.profile.email}</div>
              </div>
            </div>
          </section>

          <Panel title="Skills">
            {data.skills.length === 0 ? (
              <p className="ws-hint" style={{ padding: 16 }}>No skills added yet.</p>
            ) : (
              <div className="ws-chips" style={{ padding: 16 }}>
                {data.skills.map((skill) => (
                  <span className="ws-pill ws-pill-ok" key={skill.name}>
                    {skill.name}{skill.level ? ` · ${skill.level}` : ''}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Tasks"
            hint={`${data.workload.open_tasks} open${data.workload.overdue_tasks ? ` · ${data.workload.overdue_tasks} overdue` : ''} · ${data.workload.completed_tasks} completed`}
          >
            {data.tasks.length === 0 ? (
              <EmptyState icon="tasks" title="No open tasks">Nothing is waiting on this person.</EmptyState>
            ) : (
              <table className="ws-table">
                <thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Due</th></tr></thead>
                <tbody>
                  {data.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td>{task.project || '—'}</td>
                      <td><StatusBadge status={task.status} /></td>
                      <td>
                        {formatDate(task.due_date)}
                        {task.overdue && <span className="ws-pill ws-pill-warn" style={{ marginLeft: 8 }}>Overdue</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            title="Performance"
            hint={perf.overall_score === null ? `No score in ${year}` : `${perf.overall_score.toFixed(2)} / 5 in ${year}${perf.is_final ? ' · Final' : ''}`}
          >
            {perf.goals.length === 0 ? (
              <p className="ws-hint" style={{ padding: 16 }}>No KPI goals for {year}.</p>
            ) : (
              <table className="ws-table">
                <thead><tr><th>Goal</th><th>Progress</th><th>Rating</th></tr></thead>
                <tbody>
                  {perf.goals.map((goal) => (
                    <tr key={goal.id}>
                      <td>{goal.name}{goal.overdue && <span className="ws-pill ws-pill-warn" style={{ marginLeft: 8 }}>Overdue</span>}</td>
                      <td>{Math.round(goal.progress)}%</td>
                      <td>{goal.rating} / 5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function TeamContent() {
  const { banner, failure, clear } = useBanner();
  const [team, setTeam] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    getJson(`/api/goals/team/?year=${CURRENT_YEAR}`)
      .then(setTeam)
      .catch((error) => {
        failure(error);
        setTeam([]);
      });
  }, [failure]);

  if (openId !== null) return <MemberDetails id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="gl-page">
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      {team === null ? (
        <TableSkeleton />
      ) : team.length === 0 ? (
        <div className="gl-panel">
          <EmptyState icon="users" title="No team members yet">
            Employees whose direct manager is you will appear here. HR assigns the manager of each employee.
          </EmptyState>
        </div>
      ) : (
        <TeamList team={team} onOpen={setOpenId} />
      )}
    </div>
  );
}

export default function ManagerTeam() {
  return (
    <Shell role="Manager" title="My team" subtitle="The people who report to you: skills, tasks and performance">
      <TeamContent />
    </Shell>
  );
}
