import { useEffect, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import { displayName } from './api.js';
import { CURRENT_YEAR, Panel, YearSelect } from './Goals.jsx';
import {
  Avatar,
  EmptyState,
  Icon,
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
    <>
      <p className="mt-count">{team.length} {team.length === 1 ? 'employee reports' : 'employees report'} to you</p>
      <div className="mt-grid">
        {team.map((person, index) => {
          return (
            <button
              type="button"
              className="mt-card"
              key={person.id}
              style={{ '--i': index }}
              onClick={() => onOpen(person.id)}
            >
              <span className="mt-top">
                <Avatar name={displayName(person)} size={48} />
                <span className="mt-who">
                  <span className="mt-name">{displayName(person)}</span>
                  <span className="mt-role">{person.job_title || 'No job title yet'}</span>
                </span>
              </span>
              <span className="mt-dept">{person.department || 'No department'}</span>
              <span className="mt-foot">
                View profile
                <Icon name="chevron" size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </>
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
          <section className="mt-profile">
            <Avatar name={name} size={72} />
            <div className="mt-profile-main">
              <h2>{name}</h2>
              <p>{[data.profile.job_title, data.profile.department].filter(Boolean).join(' · ') || 'No job title or department yet'}</p>
              <p className="mt-profile-mail">{data.profile.email}</p>
            </div>
            <dl className="mt-facts">
              <div><dt>{year} score</dt><dd>{perf.overall_score === null ? '—' : perf.overall_score.toFixed(2)}</dd></div>
              <div><dt>Open tasks</dt><dd>{data.workload.open_tasks}</dd></div>
              <div className={data.workload.overdue_tasks ? 'is-hot' : ''}><dt>Overdue</dt><dd>{data.workload.overdue_tasks}</dd></div>
              <div><dt>Completed</dt><dd>{data.workload.completed_tasks}</dd></div>
            </dl>
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
