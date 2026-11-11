import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { displayName } from './api.js';
import { Avatar, Banner, EmptyState, Icon, Shell, Stats, TableSkeleton, formatDate, getJson, sendJson, useBanner } from './ui.jsx';

// BAT-12, work-related version (Schaufeli, De Witte & Desart, 2019).
// The order matters: the backend scores items 1-3 as exhaustion, 4-6 mental
// distance, 7-9 cognitive impairment and 10-12 emotional impairment.
const QUESTIONS = [
  'At work, I feel mentally exhausted',
  'After a day at work, I find it hard to recover my energy',
  'At work, I feel physically exhausted',
  'I struggle to find any enthusiasm for my work',
  'I feel a strong aversion towards my job',
  "I'm cynical about what my work means to others",
  'At work, I have trouble staying focused',
  "When I'm working, I have trouble concentrating",
  'I make mistakes in my work because I have my mind on other things',
  'At work, I feel unable to control my emotions',
  'I do not recognize myself in the way I react emotionally at work',
  'At work I may overreact unintentionally',
];

const CHOICES = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'];

// TODO: the final consent wording comes from the team (who can see the answers).
const CONSENT_TEXT = 'I understand that this survey measures burnout symptoms at work, that it is not a medical diagnosis, and I agree to answer it.';

// Shown instead of the questions once the survey was sent for this period.
// The employee never sees a score.
function Submitted({ status }) {
  return (
    <section className="ws-card bat-done">
      <span className="bat-done-icon"><Icon name="check" size={26} /></span>
      <div>
        <h3>Survey submitted</h3>
        <p>Thank you. You answered on {formatDate(status.submitted_on)}.</p>
        {status.next_available && <p className="bat-done-next">The next survey opens on {formatDate(status.next_available)}.</p>}
      </div>
    </section>
  );
}

function Survey() {
  const { banner, failure, clear } = useBanner();
  const [status, setStatus] = useState(null);
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState(() => Array(QUESTIONS.length).fill(null));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getJson('/api/burnout/bat/'));
    } catch (error) {
      failure(error);
    }
  }, [failure]);

  useEffect(() => { load(); }, [load]);

  const answered = useMemo(() => answers.filter((value) => value !== null).length, [answers]);

  function choose(index, value) {
    setAnswers((current) => current.map((old, i) => (i === index ? value : old)));
  }

  async function submit(event) {
    event.preventDefault();
    setTried(true);
    clear();
    const firstMissing = answers.findIndex((value) => value === null);
    if (!consent) {
      failure(new Error('Tick the box to confirm you agree before sending.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (firstMissing !== -1) {
      failure(new Error(`Answer every statement. ${QUESTIONS.length - answered} left.`));
      const row = document.getElementById(`bat-q-${firstMissing}`);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      setStatus(await sendJson('/api/burnout/bat/', 'POST', { answers }));
      window.scrollTo({ top: 0 });
    } catch (error) {
      failure(error);
      load(); // e.g. it was already sent from another tab: show the real state
    } finally {
      setSaving(false);
    }
  }

  if (!status) {
    return (
      <div className="bat-form">
        <Banner {...banner} onClose={clear} />
        {!banner.message && <p className="bat-note">Loading…</p>}
      </div>
    );
  }

  if (status.status === 'submitted') return <div className="bat-form"><Submitted status={status} /></div>;

  return (
    <form className="bat-form" onSubmit={submit} noValidate>
      <Banner {...banner} onClose={clear} />

      <section className="ws-card bat-intro">
        <div className="ws-card-head">
          <h3>How do you feel at work?</h3>
          <p>
            The following statements are related to your work situation and how you experience it.
            Say how often each statement applies to you. It takes about 5 minutes.
          </p>
        </div>
        <label className={`bat-consent${tried && !consent ? ' is-invalid' : ''}`}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>
      </section>

      <section className="ws-card bat-questions">
        <div className="bat-progress" aria-live="polite">
          <span>{answered} of {QUESTIONS.length} answered</span>
          <span className="bat-bar"><span style={{ width: `${(answered / QUESTIONS.length) * 100}%` }} /></span>
        </div>

        {QUESTIONS.map((text, index) => {
          const missing = tried && answers[index] === null;
          return (
            <div className={`bat-q${missing ? ' is-invalid' : ''}`} key={text} id={`bat-q-${index}`}>
              <p className="bat-q-text" id={`bat-q-label-${index}`}>
                <span className="bat-q-n">{index + 1}</span>{text}
              </p>
              <div className="bat-scale" role="radiogroup" aria-labelledby={`bat-q-label-${index}`}>
                {CHOICES.map((label, choice) => (
                  <label className="bat-opt" key={label}>
                    <input
                      type="radio"
                      name={`bat-${index}`}
                      value={choice + 1}
                      checked={answers[index] === choice + 1}
                      onChange={() => choose(index, choice + 1)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {missing && <p className="bat-q-error"><Icon name="alert" size={14} /> Choose one answer.</p>}
            </div>
          );
        })}
      </section>

      <div className="bat-actions">
        <button className="ws-btn ws-btn-primary" type="submit" disabled={saving}>
          <Icon name="send" size={15} />{saving ? 'Sending…' : 'Submit survey'}
        </button>
      </div>
      <p className="bat-note">BAT-12 © Schaufeli, De Witte &amp; Desart (2019). Not a diagnosis.</p>
    </form>
  );
}

export function EmployeeWellbeing() {
  return (
    <Shell role="Employee" title="Well-being survey" subtitle="Twelve short statements about how you experience your work">
      <Survey />
    </Shell>
  );
}


// ---------- Manager: predicted burnout risk of the team ----------

const LEVELS = ['Low', 'Moderate', 'High', 'Severe'];

// A short suggestion shown under a factor that raises the risk.
// It is matched by words in the factor name (the first match wins, so the more
// specific rules come first), so it keeps working when the model's feature
// names change. Edit the wording here.
const SUGGESTIONS = [
  [['overdue', 'late', 'deadline'], 'Consider extending deadlines or reassigning overdue tasks.'],
  [['task', 'workload'], 'Consider balancing their workload across the team.'],
  [['hour'], 'Consider lowering their weekly hours or moving some tasks to others.'],
  [['meeting'], 'Consider cutting or shortening recurring meetings.'],
  [['leave', 'vacation'], 'Encourage them to take their leave.'],
  [['absen', 'attendance'], 'Check in with them about recent absences.'],
];
const DEFAULT_SUGGESTION = 'Talk with them about this factor.';

function suggestionFor(factor) {
  if (factor.direction !== 'increases') return '';
  const name = String(factor.name).toLowerCase();
  const found = SUGGESTIONS.find(([words]) => words.some((word) => name.includes(word)));
  return found ? found[1] : DEFAULT_SUGGESTION;
}

function Factor({ factor }) {
  const raises = factor.direction === 'increases';
  const tip = suggestionFor(factor);
  return (
    <div className="bt-fitem">
      <span className={`bt-factor ${raises ? 'bt-up' : 'bt-down'}`}>
        <span aria-hidden="true">{raises ? '↑' : '↓'}</span>
        {factor.name}
        <span className="bt-sr">{raises ? ' (raises risk)' : ' (lowers risk)'}</span>
      </span>
      {tip && <small className="bt-tip">{tip}</small>}
    </div>
  );
}

function MemberRow({ member }) {
  const name = displayName(member);
  const ok = member.status === 'ok';
  return (
    <li className="bt-row">
      <div className="bt-person">
        <Avatar name={name} size={34} />
        <div>
          <strong>{name}</strong>
          {member.job_title && <span>{member.job_title}</span>}
        </div>
      </div>
      <div className="bt-risk">
        {ok ? (
          <>
            <span className={`bt-level bt-level-${member.level}`}>{member.level}</span>
            <span className="bt-score">{Number(member.score).toFixed(1)}<small> / 10</small></span>
          </>
        ) : (
          <span className="bt-level bt-level-none">Insufficient data</span>
        )}
      </div>
      <div className="bt-factors">
        {ok ? (
          member.top_factors.length > 0
            ? member.top_factors.map((factor) => <Factor factor={factor} key={factor.name} />)
            : <span className="bt-muted">No main factors reported.</span>
        ) : (
          <span className="bt-muted">
            Missing: {member.missing_inputs.length > 0 ? member.missing_inputs.join(', ') : 'work data'}
          </span>
        )}
      </div>
    </li>
  );
}

function TeamBurnout() {
  const { banner, failure, clear } = useBanner();
  const [members, setMembers] = useState(null);

  useEffect(() => {
    getJson('/api/burnout/team/')
      .then((data) => setMembers(data.members))
      .catch((error) => {
        failure(error);
        setMembers([]);
      });
  }, [failure]);

  const sorted = useMemo(() => {
    if (!members) return [];
    const rank = (member) => (member.status === 'ok' ? -member.score : 1);
    return [...members].sort((a, b) => rank(a) - rank(b));
  }, [members]);

  const counts = useMemo(() => {
    const list = members || [];
    return [
      ...LEVELS.map((level) => ({ label: level, value: list.filter((m) => m.status === 'ok' && m.level === level).length })),
      { label: 'Insufficient data', value: list.filter((m) => m.status !== 'ok').length },
    ];
  }, [members]);

  return (
    <div className="bt-page">
      <Banner {...banner} onClose={clear} />
      {members === null ? (
        <TableSkeleton />
      ) : members.length === 0 ? (
        <div className="ws-card">
          <EmptyState icon="users" title="No team members yet">
            Employees whose direct manager is you will appear here. HR assigns the manager of each employee.
          </EmptyState>
        </div>
      ) : (
        <>
          <Stats items={counts.map((item) => ({
            ...item,
            tone: item.label === 'High' ? 'warn' : item.label === 'Severe' ? 'danger' : undefined,
          }))} />
          <section className="ws-card bt-card">
            <div className="ws-card-head">
              <h3>Your team</h3>
              <p>Highest risk first. Based on work data such as hours, meetings, leave and tasks.</p>
            </div>
            <div className="bt-head" aria-hidden="true">
              <span>Employee</span><span>Risk</span><span>What drives it</span>
            </div>
            <ul className="bt-list">
              {sorted.map((member) => <MemberRow member={member} key={member.id} />)}
            </ul>
          </section>
          <p className="bat-note">These are estimates to help you notice who may need support. They are not a diagnosis.</p>
        </>
      )}
    </div>
  );
}

export function ManagerBurnout() {
  return (
    <Shell role="Manager" title="Burnout risk" subtitle="Predicted burnout risk for the people who report to you">
      <TeamBurnout />
    </Shell>
  );
}

// ---------- HR: burnout risk compared between departments ----------

// Risk levels are ordered, so the charts use ONE hue (orange) from light to dark
// instead of traffic-light colors: it stays readable for color-blind people.
const LEVEL_COLORS = { Low: '#EDA45F', Moderate: '#D9701F', High: '#B04E0C', Severe: '#7A3507' };
const LEVEL_INK = { Low: '#261400', Moderate: '#261400', High: '#FFFFFF', Severe: '#FFFFFF' };

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function shorten(text, max) {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

// The pixel width of an element, kept up to date, so charts keep readable text.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.floor(el.clientWidth));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((event, content) => {
    let { clientX: x, clientY: y } = event;
    if (event.type === 'focus') {
      const box = event.currentTarget.getBoundingClientRect();
      x = box.left + box.width / 2;
      y = box.top;
    }
    setTip({ x, y, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

function Tooltip({ tip }) {
  if (!tip) return null;
  const left = Math.max(8, Math.min(tip.x + 14, window.innerWidth - 250));
  return <div className="bc-tip" role="status" style={{ left, top: tip.y + 16 }}>{tip.content}</div>;
}

function LevelLegend() {
  return (
    <ul className="bc-legend" aria-label="Risk levels, lowest to highest">
      {LEVELS.map((level) => (
        <li key={level}><span className="bc-swatch" style={{ background: LEVEL_COLORS[level] }} />{level}</li>
      ))}
    </ul>
  );
}

// ----- Donut: the whole organization split into the four levels -----

function arc(cx, cy, r, from, to) {
  const point = (angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

function Donut({ org, tooltip }) {
  const size = 230;
  const c = size / 2;
  const radius = 90;
  const total = org.assessed;
  const active = LEVELS.filter((level) => org.levels[level] > 0);
  const gap = active.length > 1 ? 0.045 : 0;
  let angle = -Math.PI / 2;
  const slices = active.map((level) => {
    const span = (org.levels[level] / total) * Math.PI * 2;
    const slice = { level, from: angle + gap / 2, to: angle + span - gap / 2, span };
    angle += span;
    return slice;
  });
  const tipFor = (level) => (
    <>
      <strong>{level}</strong>
      <span className="bc-tip-line"><b>{org.levels[level]}</b> of {total} employees ({percent(org.levels[level], total)}%)</span>
    </>
  );
  return (
    <div className="bc-donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="group" aria-label="Employees by risk level, whole organization">
        <circle cx={c} cy={c} r={radius} fill="none" stroke="#EFEDF6" strokeWidth="30" />
        {slices.map(({ level, from, to, span }, index) => (
          <g key={level} style={{ '--i': index }}>
            {span > Math.PI * 2 - 0.01 ? (
              <circle className="bc-arc" cx={c} cy={c} r={radius} fill="none" stroke={LEVEL_COLORS[level]} strokeWidth="30"
                tabIndex={0} aria-label={`${level}: ${org.levels[level]}`}
                onPointerMove={(e) => tooltip.show(e, tipFor(level))} onPointerLeave={tooltip.hide}
                onFocus={(e) => tooltip.show(e, tipFor(level))} onBlur={tooltip.hide} />
            ) : (
              <path className="bc-arc" d={arc(c, c, radius, from, to)} fill="none" stroke={LEVEL_COLORS[level]} strokeWidth="30"
                tabIndex={0} aria-label={`${level}: ${org.levels[level]}`}
                onPointerMove={(e) => tooltip.show(e, tipFor(level))} onPointerLeave={tooltip.hide}
                onFocus={(e) => tooltip.show(e, tipFor(level))} onBlur={tooltip.hide} />
            )}
          </g>
        ))}
        <text x={c} y={c - 2} textAnchor="middle" className="bc-donut-value">{org.average_score === null ? '—' : org.average_score.toFixed(1)}</text>
        <text x={c} y={c + 22} textAnchor="middle" className="bc-donut-label">average risk / 10</text>
      </svg>
      <ul className="bc-donut-list">
        {LEVELS.map((level) => (
          <li key={level}>
            <span className="bc-swatch" style={{ background: LEVEL_COLORS[level] }} />
            <span className="bc-donut-name">{level}</span>
            <b>{org.levels[level]}</b>
            <span className="bc-donut-pct">{percent(org.levels[level], total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----- Columns: average risk per department, with the organization average -----

function ColumnChart({ departments, orgAverage, tooltip }) {
  const [ref, width] = useWidth();
  const height = 320;
  const m = { t: 40, r: 16, b: 70, l: 34 };
  const plotW = Math.max(0, width - m.l - m.r);
  const plotH = height - m.t - m.b;
  const n = departments.length;
  const band = n ? plotW / n : 0;
  const barW = Math.min(54, band * 0.62);
  const y = (value) => m.t + plotH * (1 - value / 10);
  const base = y(0);
  const tilt = band < 78;
  const chars = tilt ? 14 : Math.max(5, Math.floor(band / 7.5));

  return (
    <div ref={ref} className="bc-svgwrap">
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label="Average burnout risk by department">
          <defs>
            <linearGradient id="bcColumn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8E7EDD" />
              <stop offset="100%" stopColor="#43338A" />
            </linearGradient>
          </defs>
          {[0, 2, 4, 6, 8, 10].map((tick) => (
            <g key={tick}>
              <line x1={m.l} x2={width - m.r} y1={y(tick)} y2={y(tick)} className="bc-gridline" />
              <text x={m.l - 8} y={y(tick) + 4} textAnchor="end" className="bc-axis-text">{tick}</text>
            </g>
          ))}

          {departments.map((department, index) => {
            const score = department.average_score;
            const cx = m.l + band * index + band / 2;
            const x0 = cx - barW / 2;
            const label = shorten(department.department, chars);
            const tip = (
              <>
                <strong>{department.department}</strong>
                <span className="bc-tip-line"><b>{score === null ? 'No data' : `${score.toFixed(1)} / 10`}</b> average risk</span>
                <span className="bc-tip-line"><b>{department.assessed}</b> of {department.employees} assessed</span>
              </>
            );
            const top = score === null ? base : y(score);
            const r = Math.min(10, (base - top) / 2);
            return (
              <g key={department.department}>
                {score !== null && (
                  <g
                    className="bc-col"
                    style={{ '--i': index }}
                    tabIndex={0}
                    role="img"
                    aria-label={`${department.department}: average risk ${score.toFixed(1)} out of 10`}
                    onPointerMove={(e) => tooltip.show(e, tip)}
                    onPointerLeave={tooltip.hide}
                    onFocus={(e) => tooltip.show(e, tip)}
                    onBlur={tooltip.hide}
                  >
                    <rect x={x0 - 8} y={m.t} width={barW + 16} height={plotH} fill="transparent" />
                    <path
                      className="bc-col-shape"
                      d={`M ${x0} ${base} V ${top + r} Q ${x0} ${top} ${x0 + r} ${top} H ${x0 + barW - r} Q ${x0 + barW} ${top} ${x0 + barW} ${top + r} V ${base} Z`}
                      fill="url(#bcColumn)"
                    />
                    <text x={cx} y={top - 9} textAnchor="middle" className="bc-col-value">{score.toFixed(1)}</text>
                  </g>
                )}
                {score === null && <text x={cx} y={base - 8} textAnchor="middle" className="bc-axis-text">No data</text>}
                <text
                  x={cx}
                  y={base + 20}
                  textAnchor={tilt ? 'end' : 'middle'}
                  transform={tilt ? `rotate(-35 ${cx} ${base + 20})` : undefined}
                  className="bc-cat-text"
                >
                  {label}
                  {label !== department.department && <title>{department.department}</title>}
                </text>
              </g>
            );
          })}

          {orgAverage !== null && (
            <g aria-hidden="true">
              <line x1={m.l} x2={width - m.r} y1={y(orgAverage)} y2={y(orgAverage)} className="bc-avgline" />
              <line x1={width - m.r - 190} x2={width - m.r - 166} y1={11} y2={11} className="bc-avgline" />
              <text x={width - m.r} y={15} textAnchor="end" className="bc-avglabel">Organization average {orgAverage.toFixed(1)}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

// ----- Stacked columns: how many employees sit at each level, per department -----

function StackedChart({ departments, tooltip }) {
  const [ref, width] = useWidth();
  const rowH = 46;
  const barH = 26;
  const narrow = width < 520;
  const labelW = narrow ? 92 : 130;
  const endW = narrow ? 0 : 84;
  const plotW = Math.max(0, width - labelW - endW - 8);
  const height = departments.length * rowH + 28;

  return (
    <div ref={ref} className="bc-svgwrap">
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label="Share of employees at each risk level, per department">
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={labelW + (plotW * tick) / 100} x2={labelW + (plotW * tick) / 100} y1={0} y2={height - 22} className="bc-gridline" />
              <text x={labelW + (plotW * tick) / 100} y={height - 6} textAnchor="middle" className="bc-axis-text">{tick}%</text>
            </g>
          ))}
          {departments.map((department, index) => {
            const top = index * rowH + (rowH - barH) / 2;
            const total = department.assessed;
            const label = shorten(department.department, narrow ? 12 : 17);
            const tip = (
              <>
                <strong>{department.department}</strong>
                {LEVELS.map((level) => (
                  <span className="bc-tip-line" key={level}>
                    <i className="bc-key" style={{ background: LEVEL_COLORS[level] }} />
                    <b>{department.levels[level]}</b> {level} ({percent(department.levels[level], total)}%)
                  </span>
                ))}
              </>
            );
            let used = 0;
            return (
              <g key={department.department}>
                <text x={labelW - 12} y={top + barH / 2 + 4} textAnchor="end" className="bc-cat-text">
                  {label}
                  {label !== department.department && <title>{department.department}</title>}
                </text>
                {total === 0 ? (
                  <text x={labelW} y={top + barH / 2 + 4} className="bc-axis-text">No data</text>
                ) : (
                  <g
                    className="bc-row"
                    style={{ '--i': index }}
                    tabIndex={0}
                    role="img"
                    aria-label={`${department.department}: ${LEVELS.map((level) => `${department.levels[level]} ${level}`).join(', ')}`}
                    onPointerMove={(e) => tooltip.show(e, tip)}
                    onPointerLeave={tooltip.hide}
                    onFocus={(e) => tooltip.show(e, tip)}
                    onBlur={tooltip.hide}
                  >
                    <rect x={labelW} y={top - 6} width={plotW} height={barH + 12} fill="transparent" />
                    {LEVELS.filter((level) => department.levels[level] > 0).map((level) => {
                      const count = department.levels[level];
                      const w = (count / total) * plotW;
                      const x = labelW + (used / total) * plotW;
                      used += count;
                      return (
                        <g key={level}>
                          <rect x={x + 1} y={top} width={Math.max(1, w - 2)} height={barH} rx="5" fill={LEVEL_COLORS[level]} />
                          {w >= 26 && (
                            <text x={x + w / 2} y={top + barH / 2 + 4} textAnchor="middle" fill={LEVEL_INK[level]} className="bc-seg-value">{count}</text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                )}
                {total > 0 && endW > 0 && (
                  <text x={labelW + plotW + 12} y={top + barH / 2 + 4} className="bc-axis-text">{total} assessed</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// The same numbers as a table, for screen readers and for copying.
function DepartmentTable({ data }) {
  const rows = [...data.departments, { department: 'Whole organization', ...data.organization }];
  return (
    <section className="ws-card bc-card">
      <div className="ws-card-head">
        <h3>Department comparison</h3>
        <p>Number of employees at each risk level.</p>
      </div>
      <div className="bc-table-wrap">
        <table className="bc-table">
          <thead>
            <tr>
              <th scope="col">Department</th>
              <th scope="col">Employees</th>
              <th scope="col">Assessed</th>
              <th scope="col">Average risk</th>
              {LEVELS.map((level) => <th scope="col" key={level}>{level}</th>)}
              <th scope="col">Insufficient data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.department}>
                <th scope="row">{row.department}</th>
                <td>{row.employees}</td>
                <td>{row.assessed}</td>
                <td>{row.average_score === null ? '—' : row.average_score.toFixed(1)}</td>
                {LEVELS.map((level) => <td key={level}>{row.levels[level]}</td>)}
                <td>{row.insufficient}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DepartmentBurnout() {
  const { banner, failure, clear } = useBanner();
  const [data, setData] = useState(null);
  const [view, setView] = useState('charts');
  const tooltip = useTooltip();

  useEffect(() => {
    getJson('/api/burnout/departments/')
      .then(setData)
      .catch((error) => {
        failure(error);
        setData({ organization: null, departments: [] });
      });
  }, [failure]);

  const org = data && data.organization;
  return (
    <div className="bt-page bc-page">
      <Banner {...banner} onClose={clear} />
      {data === null ? (
        <TableSkeleton />
      ) : data.departments.length === 0 ? (
        <div className="ws-card">
          <EmptyState icon="users" title="No employees to compare yet">
            Departments appear here once employees are added and have a department.
          </EmptyState>
        </div>
      ) : (
        <>
          <Stats items={[
            { label: 'Average risk (0–10)', value: org.average_score === null ? '—' : org.average_score.toFixed(1) },
            { label: 'Employees assessed', value: org.assessed },
            { label: 'Insufficient data', value: org.insufficient },
          ]} />

          <div className="bc-toolbar" role="group" aria-label="View">
            <button type="button" className={`ws-btn ws-btn-sm ${view === 'charts' ? 'ws-btn-primary' : 'ws-btn-secondary'}`} aria-pressed={view === 'charts'} onClick={() => setView('charts')}>Charts</button>
            <button type="button" className={`ws-btn ws-btn-sm ${view === 'table' ? 'ws-btn-primary' : 'ws-btn-secondary'}`} aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
            <span className="bc-toolbar-note">Totals only: no individual results are shown here.</span>
          </div>

          {view === 'table' ? (
            <DepartmentTable data={data} />
          ) : (
            <>
              <div className="bc-top">
                <section className="ws-card bc-card">
                  <div className="ws-card-head">
                    <h3>Across the organization</h3>
                    <p>{org.assessed === 0 ? 'No employee has enough data yet.' : `${org.assessed} employees assessed, by risk level.`}</p>
                  </div>
                  <div className="bc-body">
                    {org.assessed > 0 ? <Donut org={org} tooltip={tooltip} /> : <p className="bt-muted">Nothing to show yet.</p>}
                  </div>
                </section>
                <section className="ws-card bc-card">
                  <div className="ws-card-head">
                    <h3>Average risk by department</h3>
                    <p>Score from 0 to 10. Hover a column for details.</p>
                  </div>
                  <div className="bc-body">
                    <ColumnChart departments={data.departments} orgAverage={org.average_score} tooltip={tooltip} />
                  </div>
                </section>
              </div>
              <section className="ws-card bc-card">
                <div className="ws-card-head">
                  <h3>Risk levels inside each department</h3>
                  <p>Share of assessed employees at each level. Numbers inside are employee counts.</p>
                </div>
                <div className="bc-body">
                  <LevelLegend />
                  <StackedChart departments={data.departments} tooltip={tooltip} />
                </div>
              </section>
            </>
          )}
          <Tooltip tip={tooltip.tip} />
          <p className="bat-note">Averages come from the predicted risk of each employee. They are estimates, not a diagnosis.</p>
        </>
      )}
    </div>
  );
}

export function HRBurnout() {
  return (
    <Shell role="HR" title="Burnout risk" subtitle="Predicted burnout risk compared between departments">
      <DepartmentBurnout />
    </Shell>
  );
}
