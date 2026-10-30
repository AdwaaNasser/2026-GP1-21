import { useCallback, useEffect, useState } from 'react';
import { displayName } from './api.js';
import {
  Shell,
  Banner,
  YearPicker,
  Avatar,
  EmptyState,
  Icon,
  Modal,
  TableSkeleton,
  formatDate,
  getJson,
  sendJson,
  useBanner,
} from './ui.jsx';

// ==================== GoalCharts ====================

// Charts for the performance screens, drawn with plain SVG (no chart library).
// Ratings and scores live on a 1 to 5 scale.

const MIN = 1;
const MAX = 5;
const DEFAULT_WIDTH = 600;
const H = 280;
const PAD = { left: 38, right: 28, top: 26, bottom: 38 };

function score2(value) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(2);
}

function pointsOf(values, W) {
  const count = values.length;
  const step = count > 1 ? (W - PAD.left - PAD.right) / (count - 1) : 0;
  const offset = count > 1 ? 0 : (W - PAD.left - PAD.right) / 2;
  return values.map((value, index) => (value === null || value === undefined ? null : {
    x: PAD.left + offset + index * step,
    y: PAD.top + ((MAX - value) / (MAX - MIN)) * (H - PAD.top - PAD.bottom),
    value,
    index,
  }));
}

// Runs of consecutive points; a missing value breaks the line.
function segments(points) {
  const runs = [];
  let run = [];
  points.forEach((point) => {
    if (point) {
      run.push(point);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

// Smooth curve that never overshoots the data points.
function curve(run) {
  return run.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const before = run[index - 1];
    const middle = (before.x + point.x) / 2;
    return `${path} C ${middle} ${before.y} ${middle} ${point.y} ${point.x} ${point.y}`;
  }, '');
}

// series = [{ name, values, tone: 'current' | 'previous', area, dashed }]
export function LineChart({ id, categories, series, dark = false, label, width = DEFAULT_WIDTH }) {
  const W = width;
  const baseline = H - PAD.bottom;
  const xs = categories.length > 1
    ? categories.map((_, i) => PAD.left + (i * (W - PAD.left - PAD.right)) / (categories.length - 1))
    : [PAD.left + (W - PAD.left - PAD.right) / 2];
  const hasData = series.some((item) => item.values.some((v) => v !== null && v !== undefined));

  return (
    <figure className={`gl-line${dark ? ' gl-line-dark' : ''}${dark && series.length > 1 ? ' gl-line-multi' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dark ? '#F07B1F' : '#F07B1F'} stopOpacity={dark ? 0.42 : 0.32} />
            <stop offset="100%" stopColor={dark ? '#F07B1F' : '#F07B1F'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[1, 2, 3, 4, 5].map((tick) => {
          const y = PAD.top + ((MAX - tick) / (MAX - MIN)) * (H - PAD.top - PAD.bottom);
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right + 8} y1={y} y2={y} className="gl-line-grid" />
              <text x={PAD.left - 12} y={y + 4} textAnchor="end" className="gl-line-tick">{tick}</text>
            </g>
          );
        })}

        {categories.map((name, index) => (
          <text key={name} x={xs[index]} y={H - 10} textAnchor="middle" className="gl-line-cat">{name}</text>
        ))}

        {series.map((item, seriesIndex) => {
          const points = pointsOf(item.values, W);
          return (
            <g key={item.name} className={`gl-series gl-series-${item.tone}`} style={item.color ? { '--c': item.color } : undefined}>
              {segments(points).map((run) => (
                <g key={run[0].index}>
                  {item.area && run.length > 1 && (
                    <path
                      d={`${curve(run)} L ${run[run.length - 1].x} ${baseline} L ${run[0].x} ${baseline} Z`}
                      fill={`url(#${id}-area)`}
                      className="gl-line-area"
                    />
                  )}
                  {run.length > 1 && (
                    <path
                      d={curve(run)}
                      pathLength="1"
                      className={`gl-line-path${item.dashed ? ' gl-line-dashed' : ''}`}
                      style={{ animationDelay: `${seriesIndex * 0.25}s` }}
                    />
                  )}
                </g>
              ))}
              {points.filter(Boolean).map((point, index, all) => (
                <g key={point.index}>
                  <circle cx={point.x} cy={point.y} r={item.tone === 'current' ? 6 : 4.5} className="gl-line-dot">
                    <title>{`${item.name}, ${categories[point.index]}: ${score2(point.value)}`}</title>
                  </circle>
                  {(item.tone === 'current' || item.showValues) && (index === all.length - 1 || all.length <= 5) && (
                    <text x={point.x} y={point.y - 14} textAnchor="middle" className="gl-line-value">
                      {score2(point.value)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="gl-line-empty">No ratings yet</text>
        )}
      </svg>
      <figcaption className="gl-legend">
        {series.map((item) => (
          <span key={item.name} className="gl-legend-item">
            <i className={`gl-swatch gl-swatch-${item.tone}${item.dashed ? ' gl-swatch-dashed' : ''}`} style={item.color ? { '--c': item.color } : undefined} />
            {item.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// Progress toward a target. Goes past the end of the track when the goal is exceeded.
export function Meter({ percent }) {
  const rounded = Math.round(percent);
  const reached = rounded >= 100;
  return (
    <div className="gl-meter">
      <div className="gl-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(rounded, 100)}>
        <div className={`gl-meter-fill${reached ? ' gl-meter-reached' : ''}`} style={{ width: `${Math.min(rounded, 100)}%` }} />
      </div>
      <span className="gl-meter-value">{rounded}%</span>
    </div>
  );
}

// ==================== Goals ====================

// ---------- Shared helpers ----------

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PERIOD_OPTIONS = [
  ['annual', 'Full year'],
  ['Q1', 'Q1 (Jan–Mar)'],
  ['Q2', 'Q2 (Apr–Jun)'],
  ['Q3', 'Q3 (Jul–Sep)'],
  ['Q4', 'Q4 (Oct–Dec)'],
  ...MONTHS.map((name, index) => [`M${index + 1}`, name]),
];

const TYPE_OPTIONS = [
  ['Task-based', 'Task-based (automatic)'],
  ['Manual', 'Manual'],
];

// Has the period of a goal in the current year already ended? (A warning only.)
function periodEnded(period) {
  const year = CURRENT_YEAR;
  let end;
  if (period === 'annual') end = new Date(year, 12, 0);
  else if (period.startsWith('Q')) end = new Date(year, Number(period.slice(1)) * 3, 0);
  else end = new Date(year, Number(period.slice(1)), 0);
  end.setHours(23, 59, 59, 999);
  return end < new Date();
}

function periodLabel(period) {
  const found = PERIOD_OPTIONS.find(([value]) => value === period);
  return found ? found[1] : period;
}

function shortPeriod(period) {
  if (period === 'annual') return 'Year';
  if (period.startsWith('M')) return MONTHS[Number(period.slice(1)) - 1].slice(0, 3);
  return period;
}

function number(value) {
  return value === null || value === undefined ? '—' : String(Number(value));
}

function YearSelect({ year, onChange }) {
  return <YearPicker year={year} years={YEARS} onChange={onChange} />;
}

function Rating({ value }) {
  return <span className={`gl-rating gl-rating-${value}`}>{value} / 5</span>;
}

function GoalProgress({ goal }) {
  const percent = Math.round(goal.progress);
  return (
    <div className="ws-progress">
      <div className="ws-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)}>
        <div className="ws-progress-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="ws-progress-text">{percent}%</span>
    </div>
  );
}

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4', 'Year'];

function Delta({ current, previous, previousYear }) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) {
    return <span className="gl-delta gl-delta-flat">First scored year</span>;
  }
  const diff = Number((current - previous).toFixed(2));
  if (diff === 0) return <span className="gl-delta gl-delta-flat">Same as {previousYear}</span>;
  return (
    <span className={`gl-delta ${diff > 0 ? 'gl-delta-up' : 'gl-delta-down'}`}>
      {diff > 0 ? 'Up' : 'Down'} {Math.abs(diff).toFixed(2)} from {previousYear}
    </span>
  );
}

// Top of every performance screen: the score, and how it has moved over the years.
// Five notches, one for each rating point: the ring fills to score / 5.
function ScoreRing({ score }) {
  const size = 176;
  const radius = 74;
  const length = 2 * Math.PI * radius;
  const fill = Math.max(0, Math.min(score / 5, 1));
  const notches = [0, 1, 2, 3, 4].map((i) => {
    const angle = (i / 5) * 2 * Math.PI - Math.PI / 2;
    return {
      x1: size / 2 + (radius - 9) * Math.cos(angle),
      y1: size / 2 + (radius - 9) * Math.sin(angle),
      x2: size / 2 + (radius + 9) * Math.cos(angle),
      y2: size / 2 + (radius + 9) * Math.sin(angle),
    };
  });
  return (
    <div className="gl-ring" role="img" aria-label={`Score ${score.toFixed(2)} out of 5`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="gl-ring-track" cx={size / 2} cy={size / 2} r={radius} />
        <circle
          className="gl-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ '--len': length, '--off': length * (1 - fill) }}
        />
        {notches.map((n, i) => <line key={i} className="gl-ring-notch" {...n} />)}
      </svg>
      <div className="gl-ring-label">
        <strong>{score.toFixed(2)}</strong>
        <span>out of 5</span>
      </div>
    </div>
  );
}

function Hero({ title, score, final, summary, delta, history, subject, chart, compact = false }) {
  return (
    <section className={`gl-hero${compact ? ' gl-hero-compact' : ''}${!chart && !history ? ' gl-hero-solo' : ''}`}>
      <div className="gl-hero-main">
        <p className="gl-hero-kicker">{title}{final && <span className="gl-final">Final</span>}</p>
        {score === null || score === undefined ? (
          <div className="gl-hero-score gl-hero-score-empty"><strong>No score yet</strong></div>
        ) : (
          <ScoreRing score={score} />
        )}
        {delta}
        <p className="gl-hero-summary">{summary}</p>
      </div>
      {chart && (
        <div className="gl-hero-chart">
          <h3>{chart.title}</h3>
          {chart.node}
        </div>
      )}
      {!chart && history && (
        <div className="gl-hero-chart">
          <h3>{subject}</h3>
          <LineChart
            id="trend"
            dark
            label="Overall score by year"
            categories={history.map((item) => String(item.year))}
            series={[{ name: 'Overall score', values: history.map((item) => item.score), tone: 'current', area: true }]}
          />
        </div>
      )}
    </section>
  );
}

function Panel({ title, hint, children, className = '' }) {
  return (
    <section className={`gl-panel ${className}`.trim()}>
      <header className="gl-panel-head">
        <h3>{title}</h3>
        {hint && <span>{hint}</span>}
      </header>
      {children}
    </section>
  );
}

function goalSummary(data) {
  if (data.goals.length === 0) return 'No goals have been set yet.';
  const reached = data.goals.filter((goal) => goal.progress >= 100).length;
  const overdue = data.goals.filter((goal) => goal.overdue).length;
  const base = `${reached} of ${data.goals.length} ${data.goals.length === 1 ? 'goal' : 'goals'} reached`;
  return overdue ? `${base}, ${overdue} overdue` : base;
}

function ratingClass(rating) {
  if (rating >= 4) return 'gl-rate-high';
  if (rating === 3) return 'gl-rate-mid';
  return 'gl-rate-low';
}

function GoalCards({ goals, renderExtra }) {
  return (
    <div className="gl-goal-cards">
      {goals.map((goal, index) => (
        <article className="gl-goal-card" key={goal.id} style={{ '--i': index }}>
          <div className={`gl-rate ${ratingClass(goal.rating)}`} title="Rating out of 5">
            <strong>{goal.rating}</strong>
            <span>of 5</span>
          </div>
          <div className="gl-goal-body">
            <div className="gl-goal-top">
              <h4>{goal.name}</h4>
              {goal.overdue && <span className="gl-flag"><Icon name="alert" size={12} /> Overdue</span>}
            </div>
            {goal.description && <p className="gl-goal-desc">{goal.description}</p>}
            <Meter percent={goal.progress} />
            <div className="gl-goal-facts">
              <span>{periodLabel(goal.period)}</span>
              <span>{goal.type === 'Manual' ? 'Entered by manager' : 'Counted from tasks'}</span>
              <span>
                {goal.no_value ? 'No value entered yet' : `${number(goal.achieved)} of ${number(goal.target)}`}
              </span>
              <span>{number(goal.weight)}% of score</span>
            </div>
            {renderExtra && <div className="gl-goal-extra">{renderExtra(goal)}</div>}
          </div>
        </article>
      ))}
    </div>
  );
}

function compareSeries(compare) {
  return [
    { name: String(compare.previous_year), values: compare.quarters.previous, tone: 'previous', dashed: true },
    { name: String(compare.year), values: compare.quarters.current, tone: 'current', area: true },
  ];
}

// ---------- Employee: my performance ----------

function PerformanceContent() {
  const { banner, failure, clear } = useBanner();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState(null);
  const [compare, setCompare] = useState(null);

  useEffect(() => {
    setData(null);
    setCompare(null);
    getJson(`/api/goals/performance/?year=${year}`)
      .then(setData)
      .catch((error) => {
        failure(error);
        setData({ goals: [], overall_score: null, is_final: false });
      });
    getJson(`/api/goals/performance/compare/?year=${year}`)
      .then(setCompare)
      .catch(() => setCompare(null));
  }, [year, failure]);

  return (
    <div className="gl-page">
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      <div className="gl-bar">
        <span />
        <YearSelect year={year} onChange={setYear} />
      </div>
      {data === null ? (
        <TableSkeleton />
      ) : (
        <>
          <Hero
            title={`Your KPI score in ${year}`}
            score={data.overall_score}
            final={data.is_final}
            summary={goalSummary(data)}
            delta={compare && <Delta current={data.overall_score} previous={compare.previous_score} previousYear={compare.previous_year} />}
            history={compare ? compare.history : undefined}
            subject="Your score by year"
          />
          {data.goals.length === 0 ? (
            <div className="gl-panel">
              <EmptyState icon="flag" title="No goals for this year">
                Your manager has not set goals for {year} yet. They will show up here with your progress.
              </EmptyState>
            </div>
          ) : (
            <Panel title="Your KPI goals" hint={`${data.goals.length} in ${year}`}>
              <GoalCards goals={data.goals} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export { CURRENT_YEAR, GoalCards, Hero, Panel, YearSelect, goalSummary };

export function EmployeePerformance() {
  return (
    <Shell role="Employee" title="My performance" subtitle="Track your KPIs against the goals your manager set">
      <PerformanceContent />
    </Shell>
  );
}

// ---------- Manager: team and goal editor ----------

const PALETTE = ['#F07B1F', '#4B3A75', '#3B6FD9', '#2E9E6A', '#9C8FBF'];

const EMPTY_GOAL = {
  id: null, name: '', description: '', type: 'Task-based', period: 'annual', target: '', weight: '',
};

function toRow(goal) {
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description || '',
    type: goal.type,
    period: goal.period,
    target: String(goal.target),
    weight: String(goal.weight),
  };
}

function GoalEditor({ employee, onChanged, onSaved, success, failure }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(null); // the goal whose tasks are being linked
  const [pending, setPending] = useState(null); // index of an unsaved row whose tasks are being picked
  const [removal, setRemoval] = useState(null); // the goal just taken out of the list, deleted when saved
  const [endedPeriod, setEndedPeriod] = useState(null); // period the manager just picked that is already over

  const load = useCallback(async () => {
    const result = await getJson(`/api/goals/employees/${employee.id}/goals/?year=${CURRENT_YEAR}`);
    setData(result);
    setRows(result.goals.map(toRow));
    setRemoval(null);
  }, [employee.id]);

  useEffect(() => {
    setData(null);
    load().catch((error) => {
      failure(error);
      setData({ goals: [], overall_score: null, is_final: false });
    });
  }, [load, failure]);

  function change(index, field, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    if (field !== 'period') return;
    if (periodEnded(value)) setEndedPeriod(value);
  }

  function removeRow(index) {
    const row = rows[index];
    const left = rows.filter((_, i) => i !== index).reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
    setRemoval({ row, index, left });
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function undoRemove() {
    if (!removal) return;
    const { row, index } = removal;
    setRows((current) => {
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, row);
      return next;
    });
    setRemoval(null);
  }

  const total = rows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.005;
  const savedById = Object.fromEntries((data ? data.goals : []).map((goal) => [goal.id, goal]));
  const complete = rows.length > 0 && rows.every((row) => row.name.trim() && Number(row.target) > 0 && Number(row.weight) > 0);

  async function save() {
    setSaving(true);
    try {
      const goals = rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        description: row.description.trim(),
        type: row.type,
        period: row.period,
        target: row.target,
        weight: row.weight,
      }));
      const result = await sendJson(`/api/goals/employees/${employee.id}/goals/`, 'PUT', { year: CURRENT_YEAR, goals });
      let saved = result;
      // Tasks picked on new goals before saving are linked now that the goals exist.
      const picks = rows.filter((row) => !row.id && row.type === 'Task-based' && row.task_ids && row.task_ids.length);
      for (const row of picks) {
        const match = result.goals.find((goal) => !savedById[goal.id]
          && goal.name === row.name.trim() && goal.period === row.period && goal.type === 'Task-based');
        if (match) {
          saved = await sendJson(`/api/goals/goals/${match.id}/tasks/`, 'PUT', { task_ids: row.task_ids });
          saved = await getJson(`/api/goals/employees/${employee.id}/goals/?year=${CURRENT_YEAR}`);
        }
      }
      setData(saved);
      setRows(saved.goals.map(toRow));
      setRemoval(null);
      success('Goals saved.');
      onChanged();
      if (onSaved) onSaved();
    } catch (error) {
      failure(error);
    } finally {
      setSaving(false);
    }
  }

  async function saveActual(goal, value) {
    try {
      await sendJson(`/api/goals/goals/${goal.id}/actual/`, 'PATCH', { actual_value: value });
      await load();
      success('Achieved value saved.');
      onChanged();
    } catch (error) {
      failure(error);
    }
  }

  if (data === null) return <TableSkeleton rows={3} />;

  return (
    <section className="gl-panel gl-editor">
      <header className="gl-editor-head">
        <Avatar name={displayName(employee)} size={46} />
        <div>
          <h3>KPI goals for {displayName(employee)}</h3>
          <p>
            {CURRENT_YEAR} evaluation
            {data.overall_score !== null && ` · KPI score ${data.overall_score.toFixed(2)} of 5 · ${goalSummary(data)}`}
            . The weights must total 100% before you can save.
          </p>
        </div>
      </header>

      <div className="gl-weights">
        <div className="gl-weights-bar" role="img" aria-label={`Weights total ${Number(total.toFixed(2))} percent`}>
          {rows.map((row, index) => (
            <span
              key={row.id || `new-${index}`}
              className="gl-weights-seg"
              style={{ width: `${Math.min(Number(row.weight) || 0, 100)}%`, background: PALETTE[index % PALETTE.length] }}
              title={`${row.name.trim() || `Goal ${index + 1}`}: ${row.weight || 0}%`}
            />
          ))}
        </div>
        <span className={`gl-total${totalOk ? ' gl-total-ok' : ''}`}>{Number(total.toFixed(2))}% of 100%</span>
      </div>

      {rows.map((row, index) => (
        <div className="gl-goal" key={row.id || `new-${index}`} style={{ '--accent': PALETTE[index % PALETTE.length], '--i': index }}>
          <div className="gl-goal-head">
            <strong>{row.name.trim() || `Goal ${index + 1}`}</strong>
            <span className={`gl-type${row.type === 'Manual' ? ' gl-type-manual' : ''}`}>{row.type === 'Manual' ? 'Manual' : 'Task-based'}</span>
            <span className="ws-spacer" />
            <button
              type="button"
              className="ws-btn ws-btn-outline-danger ws-btn-sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </button>
          </div>
          <div className="ws-form-grid">
            <label className="ws-field">
              <span className="ws-label">Goal name</span>
              <input className="ws-input" value={row.name} maxLength={255} onChange={(event) => change(index, 'name', event.target.value)} />
            </label>
            <label className="ws-field">
              <span className="ws-label">Measurement type</span>
              <select className="ws-select" value={row.type} disabled={Boolean(row.id)} onChange={(event) => change(index, 'type', event.target.value)}>
                {TYPE_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
            <label className="ws-field">
              <span className="ws-label">Period</span>
              <select className="ws-select" value={row.period} onChange={(event) => change(index, 'period', event.target.value)}>
                {PERIOD_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
            <label className="ws-field">
              <span className="ws-label">{row.type === 'Manual' ? 'Target value' : 'Target (tasks)'}</span>
              <input className="ws-input" type="number" min="0" step="any" value={row.target} onChange={(event) => change(index, 'target', event.target.value)} />
            </label>
            <label className="ws-field">
              <span className="ws-label">Weight (%)</span>
              <input className="ws-input" type="number" min="0" max="100" step="any" value={row.weight} onChange={(event) => change(index, 'weight', event.target.value)} />
            </label>
          </div>
          <label className="ws-field">
            <span className="ws-label">Description <span className="ws-optional">(optional)</span></span>
            <textarea className="ws-textarea" rows={2} value={row.description} onChange={(event) => change(index, 'description', event.target.value)} />
          </label>
          {!row.id && row.type === 'Task-based' && (
            <div className="gl-goal-progress">
              <div className="gl-goal-progress-body">
                <div className="gl-goal-facts">
                  <span>{(row.task_ids || []).length ? `${row.task_ids.length} task(s) chosen` : 'No tasks linked yet'}</span>
                </div>
              </div>
              <div className="gl-goal-extra">
                <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={() => setPending(index)}>
                  Link tasks ({(row.task_ids || []).length})
                </button>
              </div>
            </div>
          )}
          {row.id && savedById[row.id] && (
            <div className="gl-goal-progress">
              <div className={`gl-rate gl-rate-sm ${ratingClass(savedById[row.id].rating)}`} title="Rating out of 5">
                <strong>{savedById[row.id].rating}</strong>
                <span>of 5</span>
              </div>
              <div className="gl-goal-progress-body">
                <Meter percent={savedById[row.id].progress} />
                <div className="gl-goal-facts">
                  <span>{savedById[row.id].no_value ? 'No value entered yet' : `${number(savedById[row.id].achieved)} of ${number(savedById[row.id].target)}`}</span>
                  {savedById[row.id].overdue && <span className="gl-flag"><Icon name="alert" size={12} /> Overdue</span>}
                </div>
              </div>
              <div className="gl-goal-extra">
                {savedById[row.id].type === 'Manual'
                  ? <ActualForm key={`${row.id}-${savedById[row.id].achieved}`} goal={savedById[row.id]} onSave={saveActual} disabled={data.is_final} />
                  : (
                    <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" disabled={data.is_final} onClick={() => setLinking(savedById[row.id])}>
                      Link tasks ({savedById[row.id].task_ids.length})
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="gl-actions">
        <button
          type="button"
          className="ws-btn ws-btn-secondary"
          onClick={() => setRows((current) => [...current, { ...EMPTY_GOAL }])}
        >
          <Icon name="plus" size={14} /> Add goal
        </button>
        <span className="ws-spacer" />
        <button type="button" className="ws-btn ws-btn-primary" disabled={saving || !totalOk || !complete} onClick={save}>
          {saving ? 'Saving…' : 'Save goals'}
        </button>
      </div>

      {removal && (
        <Modal title="Goal removed" onClose={() => setRemoval(null)}>
          <p>
            <strong>"{removal.row.name.trim() || 'Untitled goal'}"</strong> will be deleted when you save.
          </p>
          <p>
            {Math.abs(removal.left - 100) < 0.005
              ? 'The remaining weights still total 100%.'
              : `The remaining goals total ${Number(removal.left.toFixed(2))}%. Change the weights of the other goals or add a new goal until the total is 100%.`}
          </p>
          <div className="ws-form-actions">
            <button type="button" className="ws-btn ws-btn-secondary" onClick={undoRemove}>Undo</button>
            <button type="button" className="ws-btn ws-btn-primary" autoFocus onClick={() => setRemoval(null)}>OK</button>
          </div>
        </Modal>
      )}

      {endedPeriod && (
        <Modal title="This period has already ended" onClose={() => setEndedPeriod(null)}>
          <p>
            {periodLabel(endedPeriod)} is already over. You can still save a goal for it, but it
            covers dates that have passed.
          </p>
          <div className="ws-form-actions">
            <button type="button" className="ws-btn ws-btn-primary" autoFocus onClick={() => setEndedPeriod(null)}>OK</button>
          </div>
        </Modal>
      )}

      {pending !== null && rows[pending] && (
        <LinkTasksModal
          employeeId={employee.id}
          goal={{ name: rows[pending].name || 'new goal' }}
          initial={rows[pending].task_ids || []}
          onClose={() => setPending(null)}
          onPicked={(ids) => { change(pending, 'task_ids', ids); setPending(null); }}
          failure={failure}
        />
      )}

      {linking && (
        <LinkTasksModal
          goal={linking}
          onClose={() => setLinking(null)}
          onSaved={async () => {
            setLinking(null);
            await load();
            success('Linked tasks saved.');
            onChanged();
          }}
          failure={failure}
        />
      )}
    </section>
  );
}

function ActualForm({ goal, onSave, disabled }) {
  const [value, setValue] = useState(goal.achieved === null ? '' : String(goal.achieved));
  return (
    <form
      className="gl-actual"
      onSubmit={(event) => {
        event.preventDefault();
        if (value !== '') onSave(goal, value);
      }}
    >
      <span className="gl-actual-label">Achieved</span>
      <input className="ws-input" type="number" min="0" step="any" value={value} disabled={disabled} aria-label={`Achieved value for ${goal.name}`} onChange={(event) => setValue(event.target.value)} />
      <button type="submit" className="ws-btn ws-btn-secondary ws-btn-sm" disabled={disabled || value === ''}>Save</button>
    </form>
  );
}

function LinkTasksModal({ goal, onClose, onSaved, failure, employeeId, initial, onPicked }) {
  const isPending = Boolean(onPicked);
  const [tasks, setTasks] = useState(null);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJson(isPending ? `/api/goals/employees/${employeeId}/tasks/` : `/api/goals/goals/${goal.id}/tasks/`)
      .then((list) => {
        setTasks(list);
        setSelected(isPending ? initial : list.filter((task) => task.linked).map((task) => task.id));
      })
      .catch((error) => {
        failure(error);
        setTasks([]);
      });
  }, [goal.id, failure]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (isPending) {
      onPicked(selected);
      return;
    }
    setSaving(true);
    try {
      await sendJson(`/api/goals/goals/${goal.id}/tasks/`, 'PUT', { task_ids: selected });
      await onSaved();
    } catch (error) {
      failure(error);
      setSaving(false);
    }
  }

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <Modal title={`Link tasks to "${goal.name}"`} onClose={onClose}>
      <p className="ws-hint">
        {isPending
          ? 'Only completed tasks due inside the goal\'s period will count. They are linked when you save the goals.'
          : `Only completed tasks due between ${formatDate(goal.period_start)} and ${formatDate(goal.period_end)} count toward this goal.`}
      </p>
      {tasks === null ? (
        <TableSkeleton rows={3} />
      ) : tasks.length === 0 ? (
        <EmptyState icon="tasks" title="No tasks">This employee has no tasks yet.</EmptyState>
      ) : (
        <ul className="ws-member-list gl-task-list">
          {tasks.map((task) => (
            <li key={task.id} className="ws-member-row">
              <label className="gl-task-pick">
                <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggle(task.id)} />
                <span>
                  <span className="ws-task-title">{task.title}</span>
                  <span className="ws-task-sub">
                    {task.status.replace('_', ' ')} · due {formatDate(task.due_date)}
                    {!isPending && task.counts && <strong> · counts</strong>}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="ws-form-actions">
        <button type="button" className="ws-btn ws-btn-primary" disabled={saving || tasks === null} onClick={save}>
          {isPending ? 'Done' : saving ? 'Saving…' : 'Save linked tasks'}
        </button>
        <button type="button" className="ws-btn ws-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </Modal>
  );
}

function TeamHero({ team, year }) {
  const scored = team.filter((person) => person.overall_score !== null);
  const average = scored.length
    ? scored.reduce((sum, person) => sum + person.overall_score, 0) / scored.length
    : null;
  const withGoals = team.filter((person) => person.goal_count > 0).length;
  const waiting = team.length - withGoals;
  return (
    <section className="gl-hero gl-hero-solo">
      <div className="gl-hero-main">
        <p className="gl-hero-kicker">Team KPI score in {year}</p>
        {average === null ? (
          <div className="gl-hero-score gl-hero-score-empty"><strong>No score yet</strong></div>
        ) : (
          <ScoreRing score={average} />
        )}
        <p className="gl-hero-summary">
          {withGoals} of {team.length} {team.length === 1 ? 'employee has' : 'employees have'} goals
          {waiting > 0 ? `, ${waiting} still waiting for theirs` : ''}
        </p>
      </div>
    </section>
  );
}

function PersonProgress({ person, year, onManage, failure }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    getJson(`/api/goals/employees/${person.id}/goals/?year=${year}`)
      .then(setData)
      .catch((error) => {
        failure(error);
        setData({ goals: [], overall_score: null, is_final: false });
      });
  }, [person.id, year, failure]);

  if (data === null) return <TableSkeleton rows={3} />;
  return (
    <div className="gl-view">
      <Hero
        compact
        title={`${displayName(person)} in ${year}`}
        score={data.overall_score}
        final={data.is_final}
        summary={goalSummary(data)}
      />
      {data.goals.length === 0 ? (
        <EmptyState icon="flag" title="No goals yet">
          {year === CURRENT_YEAR
            ? `Set goals for ${displayName(person)} to start tracking their progress.`
            : `${displayName(person)} had no goals in ${year}.`}
        </EmptyState>
      ) : (
        <GoalCards goals={data.goals} />
      )}
      {year === CURRENT_YEAR && (
        <div className="ws-form-actions">
          <button type="button" className="ws-btn ws-btn-primary" onClick={onManage}>
            {data.goals.length ? 'Manage goals' : 'Set goals'}
          </button>
        </div>
      )}
    </div>
  );
}

function ManagerGoalsContent() {
  const { banner, success, failure, clear } = useBanner();
  const [team, setTeam] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [selectedId, setSelectedId] = useState(null); // editing goals
  const [viewId, setViewId] = useState(null); // looking at progress only

  const loadTeam = useCallback(async () => {
    try {
      setTeam(await getJson(`/api/goals/team/?year=${year}`));
    } catch (error) {
      failure(error);
      setTeam((current) => current || []);
    }
  }, [year, failure]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const selected = (team || []).find((person) => person.id === selectedId);
  const viewed = (team || []).find((person) => person.id === viewId);

  return (
    <div className="gl-page">
      {!selected && !viewed && (
        <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      )}
      <div className="gl-bar">
        <span />
        <YearSelect year={year} onChange={(value) => { setYear(value); setTeam(null); }} />
      </div>
      {team === null ? (
        <TableSkeleton />
      ) : team.length === 0 ? (
        <div className="gl-panel">
          <EmptyState icon="users" title="No team members yet">Employees assigned to you will appear here.</EmptyState>
        </div>
      ) : (
        <>
          <TeamHero team={team} year={year} />
          <Panel title="Your team" hint="Choose an employee to set or review their goals">
            <ul className="gl-team">
              {team.map((person, index) => (
                <li
                  key={person.id}
                  className="gl-team-row gl-team-row-click"
                  style={{ '--i': index }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View progress of ${displayName(person)}`}
                  onClick={() => setViewId(person.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) setViewId(person.id); }}
                >
                  <Avatar name={displayName(person)} size={40} />
                  <div className="gl-team-who">
                    <strong>{displayName(person)}</strong>
                    <span>{person.goal_count === 0 ? 'No goals yet' : `${person.goal_count} ${person.goal_count === 1 ? 'goal' : 'goals'} in ${year}`}</span>
                  </div>
                  <div className="gl-team-score">
                    <span className="gl-meter-track">
                      <span className="gl-meter-fill" style={{ width: `${person.overall_score === null ? 0 : (person.overall_score / 5) * 100}%` }} />
                    </span>
                    <strong>{person.overall_score === null ? '—' : person.overall_score.toFixed(2)}</strong>
                  </div>
                  {year === CURRENT_YEAR && (
                    <button type="button" className={`ws-btn ws-btn-sm ${person.goal_count ? 'ws-btn-secondary' : 'ws-btn-primary'}`} onClick={(event) => { event.stopPropagation(); setSelectedId(person.id); }}>
                      {person.goal_count ? 'Manage goals' : 'Set goals'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
      {viewed && !selected && (
        <Modal title={`Progress · ${displayName(viewed)}`} onClose={() => setViewId(null)}>
          <PersonProgress
            key={`${viewed.id}-${year}`}
            person={viewed}
            year={year}
            failure={failure}
            onManage={() => { setSelectedId(viewed.id); setViewId(null); }}
          />
        </Modal>
      )}
      {selected && (
        <Modal title={`KPI goals · ${displayName(selected)}`} onClose={() => setSelectedId(null)}>
          <Banner message={banner.message} isError={banner.isError} onClose={clear} />
          <GoalEditor key={selected.id} employee={selected} onChanged={loadTeam} onSaved={() => setSelectedId(null)} success={success} failure={failure} />
        </Modal>
      )}
    </div>
  );
}

export function ManagerGoals() {
  return (
    <Shell role="Manager" title="Team performance" subtitle="Set KPI goals for your team and follow how each employee is doing">
      <ManagerGoalsContent />
    </Shell>
  );
}

// ---------- HR: average performance by period ----------

const YEAR_COLORS = ['#F07B1F', '#4B3A75', '#3B6FD9', '#2E9E6A', '#9C8FBF', '#B8530A'];

function AllYears({ years }) {
  if (years === null) return <TableSkeleton />;
  if (years.length === 0) {
    return (
      <div className="gl-panel">
        <EmptyState icon="flag" title="Nothing to compare yet">
          Managers set goals for their employees. Once goals exist for a year, that year shows up here.
        </EmptyState>
      </div>
    );
  }
  const latest = years[years.length - 1];
  const colorOf = (index) => YEAR_COLORS[(years.length - 1 - index) % YEAR_COLORS.length];
  const delta = (index) => {
    if (index === 0) return null;
    const before = years[index - 1].average_overall_score;
    const now = years[index].average_overall_score;
    return before === null || now === null ? null : Number((now - before).toFixed(2));
  };
  return (
    <>
      <Hero
        title="All years"
        score={latest.average_overall_score}
        summary={`${years.length} ${years.length === 1 ? 'year' : 'years'} with goals, latest ${latest.year}`}
        history={years.map((item) => ({ year: item.year, score: item.average_overall_score }))}
        subject="Average score by year"
      />
      <div className="gl-columns">
        <Panel title="Year by year" hint="Average score of everyone with goals">
          <div className="gl-year-list">
            {[...years].reverse().map((item) => {
              const index = years.indexOf(item);
              const change = delta(index);
              return (
                <div className="gl-year-row" key={item.year} style={{ '--c': colorOf(index) }}>
                  <span className="gl-year-dot" />
                  <strong className="gl-year-name">{item.year}</strong>
                  <span className="gl-period-count">{item.employees_count} {item.employees_count === 1 ? 'employee' : 'employees'}</span>
                  <span className="gl-meter-track gl-year-track">
                    <span className="gl-meter-fill" style={{ width: `${((item.average_overall_score || 0) / 5) * 100}%`, background: colorOf(index) }} />
                  </span>
                  <strong className="gl-period-value">{item.average_overall_score === null ? '—' : item.average_overall_score.toFixed(2)}</strong>
                  {change !== null && (
                    <span className={`gl-mini-delta ${change >= 0 ? 'gl-mini-up' : 'gl-mini-down'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Quarter by quarter" hint="One line for each year" className="gl-sticky">
          <LineChart
            id="all-years"
            width={440}
            label="Average rating per quarter for every year"
            categories={QUARTER_NAMES}
            series={years.map((item, index) => ({
              name: String(item.year),
              values: item.quarters,
              tone: 'custom',
              color: colorOf(index),
              dashed: index !== years.length - 1,
              showValues: index === years.length - 1,
            }))}
          />
        </Panel>
      </div>
    </>
  );
}

function HRContent() {
  const { banner, failure, clear } = useBanner();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [mode, setMode] = useState('year');
  const [data, setData] = useState(null);
  const [years, setYears] = useState(null);

  useEffect(() => {
    setData(null);
    getJson(`/api/goals/dashboard/?year=${year}`)
      .then(setData)
      .catch((error) => {
        failure(error);
        setData({ year, employees_count: 0, average_overall_score: null, periods: [], history: [], quarters: null });
      });
  }, [year, failure]);

  useEffect(() => {
    if (mode !== 'all' || years !== null) return;
    getJson('/api/goals/dashboard/years/')
      .then((result) => setYears(result.years))
      .catch((error) => {
        failure(error);
        setYears([]);
      });
  }, [mode, years, failure]);

  return (
    <div className="gl-page">
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      <div className="gl-bar">
        <div className="gl-switch" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={mode === 'year'} className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>One year</button>
          <button type="button" role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>All years</button>
        </div>
        {mode === 'year' && <YearSelect year={year} onChange={setYear} />}
      </div>
      {mode === 'all' ? (
        <AllYears years={years} />
      ) : data === null ? (
        <TableSkeleton />
      ) : (
        <>
          <Hero
            title={`Average KPI score in ${year}`}
            score={data.average_overall_score}
            summary={
              data.employees_count === 0
                ? `No employee has goals for ${year} yet`
                : data.employees_count === 1 ? '1 employee has goals' : `${data.employees_count} employees have goals`
            }
            delta={data.employees_count > 0 && <Delta current={data.average_overall_score} previous={data.previous_average_overall_score} previousYear={data.previous_year} />}
            history={data.history}
            subject="Average score by year"
          />
          {data.periods.length === 0 ? (
            <div className="gl-panel">
              <EmptyState icon="flag" title={`Waiting for ${year} goals`}>
                Managers set goals for their own employees. This page averages them as soon as they do.
                Switch to All years to compare earlier years.
              </EmptyState>
            </div>
          ) : (
            <div className="gl-columns">
              <Panel title="By period" hint="Average rating of the goals in each period">
                <div className="gl-period-list">
                  {data.periods.map((item) => (
                    <div className="gl-period-row" key={item.period}>
                      <span className="gl-period-name">{periodLabel(item.period)}</span>
                      <span className="gl-period-count">{item.goals_count} {item.goals_count === 1 ? 'goal' : 'goals'}</span>
                      <span className="gl-meter-track gl-period-track">
                        <span className="gl-meter-fill" style={{ width: `${(item.average_rating / 5) * 100}%` }} />
                      </span>
                      <strong className="gl-period-value">{item.average_rating.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </Panel>
              {data.quarters && (
                <Panel title="Quarter by quarter" hint="This year against last" className="gl-sticky">
                  <LineChart
                    id="hr-quarters"
                    width={440}
                    label="Average rating per quarter, this year and last year"
                    categories={QUARTER_NAMES}
                    series={compareSeries({ ...data, quarters: data.quarters })}
                  />
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function HRPerformance() {
  return (
    <Shell role="HR" title="Performance" subtitle="Average KPI score across everyone who has goals">
      <HRContent />
    </Shell>
  );
}
