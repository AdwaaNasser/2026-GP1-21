import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, displayName, responseData, clearLogin, getLogin } from './api.js';

// ==================== taskUi ====================

export const PRIORITIES = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
];

export const STATUSES = [
  ['todo', 'To Do'],
  ['in_progress', 'In Progress'],
  ['completed', 'Completed'],
];

export function labelOf(list, value) {
  const found = list.find((item) => item[0] === value);
  return found ? found[1] : value;
}

// Today as YYYY-MM-DD, the same format the API uses for dates.
export function today() {
  return new Date().toLocaleDateString('en-CA');
}

export async function getJson(path) {
  return responseData(await apiRequest(path));
}

export async function sendJson(path, method, body) {
  const response = await apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return responseData(response);
}

export async function deleteRequest(path) {
  const response = await apiRequest(path, { method: 'DELETE' });
  if (!response.ok) await responseData(response);   // يرمي رسالة السيرفر (403 / 404)
}


// ---------- Task rules: names, sorting and filtering (the backend decides what is allowed) ----------

const STATUS_ORDER = STATUSES.map(([value]) => value);

const PRIORITY_RANK = ['urgent', 'high', 'medium', 'low']; // most urgent first

// The button an employee presses to move their task forward, keyed by the CURRENT status.
// The backend sends `next_status`; this only decides how the button is worded.
export const EMPLOYEE_ACTIONS = {
  todo: { label: 'Start work', icon: 'play' },
  in_progress: { label: 'Submit for review', icon: 'send' },
  changes_requested: { label: 'Start working on changes', icon: 'play' },
};

export function isOverdue(task, now = today()) {
  return task.status !== 'completed' && Boolean(task.due_date) && task.due_date < now;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(
    'en-GB',
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

export const DEFAULT_FILTERS = {
  search: '',
  status: 'all',
  priority: 'all',
  assignee: 'all',
  project: 'all',
  quick: 'all', // all | review | overdue
};

export function filterTasks(tasks, filters) {
  const text = (filters.search || '').trim().toLowerCase();
  return tasks.filter((task) => {
    if (text) {
      const haystack = `${task.title} ${task.description} ${displayName(task.assignee)} ${task.project ? task.project.name : ''}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (filters.status && filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.assignee && filters.assignee !== 'all' && String(task.assignee.id) !== filters.assignee) return false;
    if (filters.project && filters.project !== 'all') {
      if (filters.project === 'none' ? task.project : String(task.project && task.project.id) !== filters.project) return false;
    }
    if (filters.quick === 'review' && task.status !== 'in_review') return false;
    if (filters.quick === 'overdue' && !isOverdue(task)) return false;
    return true;
  });
}

export function sortTasks(tasks, key) {
  const list = [...tasks];
  const byDue = (a, b) => (a.due_date || '').localeCompare(b.due_date || '');
  const byPriority = (a, b) => PRIORITY_RANK.indexOf(a.priority) - PRIORITY_RANK.indexOf(b.priority);
  // Finished work goes to the bottom, so open tasks stay at the top of the list.
  const finishedLast = (a, b) => Number(a.status === 'completed') - Number(b.status === 'completed');
  if (key === 'priority') return list.sort((a, b) => byPriority(a, b) || byDue(a, b));
  if (key === 'status') return list.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byDue(a, b));
  if (key === 'title') return list.sort((a, b) => a.title.localeCompare(b.title));
  return list.sort((a, b) => finishedLast(a, b) || byDue(a, b) || byPriority(a, b));
}

// ---------- Page helpers: messages, employee list, task actions ----------

// One place for the success / error message shown at the top of a page.
export function useBanner() {
  const [banner, setBanner] = useState({ message: '', isError: false });
  const timer = useRef(null);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setBanner({ message: '', isError: false });
  }, []);

  const show = useCallback((message, isError) => {
    clearTimeout(timer.current);
    setBanner({ message, isError });
    if (!isError) timer.current = setTimeout(() => setBanner({ message: '', isError: false }), 4500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const success = useCallback((message) => show(message, false), [show]);
  const failure = useCallback(
    (error) => show((error && error.message) || 'Something went wrong. Please try again.', true),
    [show],
  );
  return { banner, success, failure, clear };
}
// Employees a manager can assign tasks to.
export function useEmployees(enabled = true) {
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getJson('/api/accounts/employees/')
      .then((people) => {
        if (!cancelled) setEmployees(people.filter((person) => person.role === 'Employee'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return employees;
}

// The three things that can happen to a task. Every call throws on a server error,
// so the panel or form that triggered it can show the message in place.
export function useTaskActions({ reload, success }) {
  async function save(task, body) {
    if (task) {
      await sendJson(`/api/workspace/tasks/${task.id}/`, 'PATCH', body);
    } else {
      await sendJson('/api/workspace/tasks/', 'POST', body);
    }
    success(task ? 'Task updated.' : 'Task created.');
    await reload();
  }

  // Manager decision on a task that was submitted for review.
  async function review(task, decision, feedback) {
    const body = { status: decision };
    if (feedback && feedback.trim()) body.feedback = feedback.trim();
    await sendJson(`/api/workspace/tasks/${task.id}/`, 'PATCH', body);
    success(
      decision === 'completed'
        ? 'Task approved and marked as completed.'
        : 'Changes requested. The employee can see your feedback.',
    );
    await reload();
  }

  // Employee moves their own task one step forward.
  async function advance(task) {
    await sendJson(`/api/workspace/tasks/${task.id}/`, 'PATCH', { status: task.next_status });
    success(task.next_status === 'in_review' ? 'Submitted for review.' : 'Task moved to In Progress.');
    await reload();
  }

    async function remove(task) {
    await deleteRequest(`/api/workspace/tasks/${task.id}/`);
    success('Task deleted.');
    await reload();
  }

  return { save, review, advance, remove };
}

// ---------- Small building blocks: icons, badges, panels, tabs ----------

// Small inline icon set (Lucide-style, 24x24 stroke icons), so no new package is needed.
const PATHS = {
  layout: (<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  folder: (<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />),
  tasks: (<><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>),
  search: (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  plus: (<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>),
  check: (<path d="M20 6 9 17l-5-5" />),
  send: (<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>),
  play: (<polygon points="6 3 20 12 6 21 6 3" />),
  message: (<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  edit: (<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>),
  alert: (<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>),
  chevron: (<path d="m9 18 6-6-6-6" />),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  flag: (<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>),
  back: (<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>),
};

export function Icon({ name, size = 16, className = '' }) {
  return (
    <svg
      className={`ws-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B';
}

export function Avatar({ name, size = 24 }) {
  return (
    <span className="ws-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// Status = where the work is. Shown as a filled pill with a dot.
export function StatusBadge({ status }) {
  return (
    <span className={`ws-status ws-status-${status}`}>
      <span className="ws-dot" />
      {labelOf(STATUSES, status)}
    </span>
  );
}

// Priority = how urgent the work is. Shown as a plain flag, so it never looks like a status.
export function PriorityBadge({ priority }) {
  return (
    <span className={`ws-priority ws-priority-${priority}`}>
      <Icon name="flag" size={13} />
      {labelOf(PRIORITIES, priority)}
    </span>
  );
}

export function ProgressBar({ progress, showText = true }) {
  const { percent = 0, completed_tasks: done = 0, total_tasks: total = 0 } = progress || {};
  return (
    <div className="ws-progress">
      <div className="ws-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="ws-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {showText && <span className="ws-progress-text">{done}/{total} · {percent}%</span>}
    </div>
  );
}

export function EmptyState({ icon = 'tasks', title, children, action }) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="ws-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div className="ws-skeleton-row" key={index}>
          <span className="ws-skeleton" style={{ width: '34%' }} />
          <span className="ws-skeleton" style={{ width: '14%' }} />
          <span className="ws-skeleton" style={{ width: '10%' }} />
          <span className="ws-skeleton" style={{ width: '12%' }} />
        </div>
      ))}
    </div>
  );
}

function useOverlay(onClose) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
}

function Overlay({ title, onClose, children, className, centered }) {
  useOverlay(onClose);
  return (
    <div
      className={`ws-overlay${centered ? ' ws-overlay-centered' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={className} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ws-panel-header">
          <h2 className="ws-panel-title">{title}</h2>
          <button type="button" className="ws-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="ws-panel-body">{children}</div>
      </div>
    </div>
  );
}

// Side panel for task details and the task form.
export function Drawer(props) {
  return <Overlay {...props} className="ws-drawer" />;
}

// Centered dialog for short forms (projects).
export function Modal(props) {
  return <Overlay {...props} className="ws-modal" centered />;
}
// Styled "are you sure?" dialog. Rendered in document.body so it always sits
// above any open drawer.
//  - danger=false gives a normal (blue) confirm button, for warnings that are not deletions.
//  - children are shown under the message (e.g. the list of linked goals).
//  - error is shown inside the dialog, so a failed request keeps it open.
//  - while busy, both buttons are disabled and the dialog cannot be closed.
const noop = () => {};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  busyLabel = 'Please wait…',
  danger = true,
  busy = false,
  error = '',
  children,
  onConfirm,
  onCancel,
}) {
  return createPortal(
    <Modal title={title} onClose={busy ? noop : onCancel}>
      {error && <div className="ws-form-error" role="alert">{error}</div>}
      <p className="ws-description">{message}</p>
      {children}
      <div className="ws-form-actions">
        <button className={`ws-btn ${danger ? 'ws-btn-danger' : 'ws-btn-primary'}`} type="button" disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button className="ws-btn ws-btn-secondary" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>,
    document.body,
  );
}

// The goals (KPIs) a task counts toward, as sent by the API in task.linked_goals.
export function LinkedGoalList({ goals }) {
  if (!goals || goals.length === 0) return null;
  return (
    <ul className="ws-description">
      {goals.map((goal) => (
        <li key={goal.id}>
          <Icon name="flag" size={13} /> {goal.name}
        </li>
      ))}
    </ul>
  );
}

// "a goal" / "2 goals"
function goalCount(goals) {
  return goals.length === 1 ? 'a goal' : `${goals.length} goals`;
}

// Row of tabs with a count: tabs = [[key, label, count], ...]
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="ws-tabs" role="tablist">
      {tabs.map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`ws-tab${active === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
          {count !== undefined && <span className="ws-tab-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

// items = [{ label, value, tone }]; tone is '', 'warn' or 'danger'
export function Stats({ items }) {
  return (
    <div className="ws-stats">
      {items.map((item) => (
        <div className={`ws-stat${item.tone ? ` ws-stat-${item.tone}` : ''}`} key={item.label}>
          <span className="ws-stat-value">{item.value}</span>
          <span className="ws-stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`ws-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ws-switch-knob" />
    </button>
  );
}

// ---------- Task list ----------

// The one task list used by every workspace page.
// `renderAction(task)` adds an optional button column (used on the employee page).
export function TaskTable({ tasks, onOpen, showProject = true, showAssignee = true, renderAction, selectedId }) {
  return (
    <div className="ws-card ws-table-card">
      <table className="ws-table">
        <thead>
          <tr>
            <th>Task</th>
            {showAssignee && <th>Assignee</th>}
            <th>Due</th>
            <th>Priority</th>
            <th>Status</th>
            {renderAction && <th aria-label="Action" />}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const overdue = isOverdue(task);
            return (
              <tr
                key={task.id}
                className={`ws-row${selectedId === task.id ? ' selected' : ''}`}
                tabIndex={0}
                onClick={() => onOpen(task)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(task);
                }}
              >
                <td>
                  <div className="ws-task-title">{task.title}</div>
                  {showProject && task.project && (
                    <div className="ws-task-sub"><Icon name="folder" size={12} />{task.project.name}</div>
                  )}
                </td>
                {showAssignee && (
                  <td>
                    <span className="ws-person"><Avatar name={displayName(task.assignee)} />{displayName(task.assignee)}</span>
                  </td>
                )}
                <td>
                  <span className={`ws-due${overdue ? ' ws-overdue' : ''}`}>
                    {overdue && <Icon name="clock" size={13} />}
                    {formatDate(task.due_date)}
                  </span>
                </td>
                <td><PriorityBadge priority={task.priority} /></td>
                <td><StatusBadge status={task.status} /></td>
                {renderAction && (
                  <td className="ws-cell-action" onClick={(event) => event.stopPropagation()}>
                    {renderAction(task)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Task form (create and edit) ----------

// Create or edit a task. A new task always starts as To Do, so there is no status field.
// `onSubmit(body)` must throw when the server refuses; the message is shown in the form.
export function TaskForm({ task, projects, employees, lockedProjectId, onSubmit, onCancel }) {
  const defaultProject = lockedProjectId
    ? String(lockedProjectId)
    : new URLSearchParams(window.location.search).get('project') || '';

  const [form, setForm] = useState(
    task
      ? {
          title: task.title,
          description: task.description,
          project: task.project ? String(task.project.id) : '',
          assignee: String(task.assignee.id),
          start_date: task.start_date,
          due_date: task.due_date,
          priority: task.priority,
          privacy: task.privacy || 'private',
        }
      : {
          title: '',
          description: '',
          project: defaultProject,
          assignee: '',
          start_date: today(),
          due_date: '',
          priority: 'medium',
          privacy: 'private',
        },
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState([]); // skills chosen in the recommendation panel

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Same rules as the backend, so problems show before anything is sent.
  function validate() {
    if (!form.title.trim()) return 'Task title is required.';
    if (!form.assignee) return 'Choose an employee to assign the task to.';
    if (!form.start_date) return 'Start date is required.';
    if (!form.due_date) return 'Due date is required.';
    if (form.due_date < form.start_date) return 'The due date cannot be before the start date.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description,
        project: form.project ? Number(form.project) : null,
        assignee: Number(form.assignee),
        start_date: form.start_date,
        due_date: form.due_date,
        priority: form.priority,
        privacy: form.privacy,
        ...(task ? {} : { skills }),
      });
    } catch (failure) {
      setError(failure.message || 'The task could not be saved.');
      setSaving(false);
    }
  }

  return (
    <form className="ws-form" onSubmit={submit} noValidate>
      {error && <div className="ws-form-error" role="alert">{error}</div>}

      <label className="ws-field">
        <span className="ws-label">Title</span>
        <input className="ws-input" value={form.title} maxLength={255} autoFocus onChange={(event) => setField('title', event.target.value)} />
      </label>

      <label className="ws-field">
        <span className="ws-label">Description and instructions</span>
        <textarea className="ws-textarea" rows={4} value={form.description} onChange={(event) => setField('description', event.target.value)} />
      </label>

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">Assignee</span>
          <select className="ws-select" value={form.assignee} onChange={(event) => setField('assignee', event.target.value)}>
            <option value="">Choose an employee</option>
            {employees.map((person) => (
              <option key={person.id} value={person.id}>{displayName(person)}</option>
            ))}
          </select>
        </label>
        <label className="ws-field">
          <span className="ws-label">Priority</span>
          <select className="ws-select" value={form.priority} onChange={(event) => setField('priority', event.target.value)}>
            {PRIORITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="ws-field">
          <span className="ws-label">Start date</span>
          <input className="ws-input" type="date" value={form.start_date} onChange={(event) => setField('start_date', event.target.value)} />
        </label>
        <label className="ws-field">
          <span className="ws-label">Due date</span>
          <input className="ws-input" type="date" value={form.due_date} onChange={(event) => setField('due_date', event.target.value)} />
        </label>
      </div>

      {!task && (
        <Recommendation
          form={form}
          onPick={(id) => setField('assignee', id)}
          onSkillsChange={setSkills}
        />
      )}

      <label className="ws-field">
        <span className="ws-label">Task privacy</span>
        <select
          className="ws-select"
          value={form.privacy}
          onChange={(event) => setField('privacy', event.target.value)}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
        <span className="ws-hint">
          Private tasks are visible to the assigned employee and manager.
          Public tasks can be visible to authorized project users.
        </span>
      </label>


      {!lockedProjectId && (
        <label className="ws-field">
          <span className="ws-label">Project <span className="ws-optional">(optional)</span></span>
          <select className="ws-select" value={form.project} onChange={(event) => setField('project', event.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="ws-form-actions">
        <button className="ws-btn ws-btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </button>
        <button className="ws-btn ws-btn-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- Project form (create and edit) ----------

// Create or edit a project. `onSubmit(body)` must throw when the server refuses.
export function ProjectForm({ project, onSubmit, onCancel }) {
  const [name, setName] = useState(project ? project.name : '');
  const [description, setDescription] = useState(project ? project.description : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), description });
    } catch (failure) {
      setError(failure.message || 'The project could not be saved.');
      setSaving(false);
    }
  }

  return (
    <form className="ws-form" onSubmit={submit} noValidate>
      {error && <div className="ws-form-error" role="alert">{error}</div>}
      <label className="ws-field">
        <span className="ws-label">Project name</span>
        <input className="ws-input" value={name} maxLength={255} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="ws-field">
        <span className="ws-label">Description <span className="ws-optional">(optional)</span></span>
        <textarea className="ws-textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="ws-form-actions">
        <button className="ws-btn ws-btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}
        </button>
        <button className="ws-btn ws-btn-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- Task details panel (employee actions and manager review) ----------

const FEEDBACK_TITLES = {
  changes_requested: 'Changes requested',
  in_review: 'Previous feedback',
};

// Task details inside a side panel, plus the actions that belong to the viewer:
//  - employee: move the task forward / submit for review
//  - manager:  edit, approve, or request changes
// Handlers (onAdvance, onReview) must throw on a server error; it is shown here.
export function TaskPanel({ task, role, onEdit, onAdvance, onReview, onDelete, projectHref }) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inFlight = useRef(false); // blocks a second click before React re-renders

  // Goals this task counts toward (sent to managers only), and whether it can be edited.
  // can_edit is false once the task is 'completed'; the status check is a fallback.
  const linkedGoals = task.linked_goals || [];
  const canEdit = task.can_edit ?? task.status !== 'completed';

  useEffect(() => {
    setFeedback('');
    setError('');
    setConfirmingEdit(false);
  }, [task.id, task.status]);

  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure.message || 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Edit: a task linked to goals shows an informational warning first.
  function startEdit() {
    if (linkedGoals.length > 0) setConfirmingEdit(true);
    else onEdit();
  }

  // Delete: the dialog stays open (buttons disabled) until the server answers.
  // On success the page closes the panel; on failure the error shows in the dialog.
  async function confirmDelete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDeleteError('');
    try {
      await onDelete(task);
    } catch (failure) {
      setDeleteError(failure.message || 'The task could not be deleted. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteError('');
  }

  function requestChanges() {
    if (!feedback.trim()) {
      setError('Write feedback explaining the changes you need.');
      return;
    }
    run(() => onReview(task, 'changes_requested', feedback));
  }

  const employeeAction = EMPLOYEE_ACTIONS[task.status];
  const canAdvance = role === 'Employee' && task.is_mine && task.next_status && employeeAction;
  const overdue = isOverdue(task);

  return (
    <div className="ws-task-panel">
      <h3 className="ws-task-heading">{task.title}</h3>
      <div className="ws-badges">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      {task.feedback && (
        <div className={`ws-feedback${task.status === 'changes_requested' ? ' ws-feedback-alert' : ''}`}>
          <div className="ws-feedback-title">
            <Icon name="message" size={15} />
            {FEEDBACK_TITLES[task.status] || 'Manager feedback'}
          </div>
          <p>{task.feedback}</p>
        </div>
      )}

      {error && <div className="ws-form-error" role="alert">{error}</div>}

      {canAdvance && (
        <div className="ws-panel-actions">
          <button type="button" className="ws-btn ws-btn-primary" disabled={busy} onClick={() => run(() => onAdvance(task))}>
            <Icon name={employeeAction.icon} size={15} />
            {employeeAction.label}
          </button>
          {task.status === 'in_progress' && <span className="ws-hint">Your manager will review it before it is completed.</span>}
        </div>
      )}
      {role === 'Employee' && task.is_mine && task.status === 'in_review' && (
        <p className="ws-hint">Waiting for your manager’s review.</p>
      )}

      <dl className="ws-detail-grid">
        <div>
          <dt>Assignee</dt>
          <dd><span className="ws-person"><Avatar name={displayName(task.assignee)} />{displayName(task.assignee)}</span></dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>
            {task.project
              ? (projectHref ? <a className="ws-link" href={projectHref(task.project)}>{task.project.name}</a> : task.project.name)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Start date</dt>
          <dd>{formatDate(task.start_date)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd className={overdue ? 'ws-overdue' : ''}>{formatDate(task.due_date)}{overdue ? ' · overdue' : ''}</dd>
        </div>
      </dl>

      <h4 className="ws-section-title">Description</h4>
      <p className="ws-description">{task.description || 'No description.'}</p>

      {role === 'Manager' && task.can_review && (
        <div className="ws-review-box">
          <h4 className="ws-section-title">Review this task</h4>
          <p className="ws-hint">The employee submitted this task. Approve it, or ask for changes.</p>
          <label className="ws-field">
            <span className="ws-label">Feedback <span className="ws-optional">(required to request changes)</span></span>
            <textarea className="ws-textarea" rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
          </label>
          <div className="ws-review-actions">
            <button type="button" className="ws-btn ws-btn-success" disabled={busy} onClick={() => run(() => onReview(task, 'completed', feedback))}>
              <Icon name="check" size={15} />
              Approve
            </button>
            <button type="button" className="ws-btn ws-btn-outline-danger" disabled={busy} onClick={requestChanges}>
              Request changes
            </button>
          </div>
        </div>
      )}

      {role === 'Manager' && ((onEdit && canEdit) || onDelete) && (
        <div className="ws-panel-footer">
          {onEdit && canEdit && (
            <button
              type="button"
              className="ws-btn ws-btn-secondary"
              disabled={busy}
              onClick={startEdit}
            >
              Edit task
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              className="ws-btn ws-btn-outline-danger"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete task
            </button>
          )}
        </div>
      )}

      {confirmingEdit && (
        <ConfirmDialog
          title="This task is linked to goals"
          message={`"${task.title}" counts toward ${goalCount(linkedGoals)}. Changing it (for example its due date) can change the progress and rating of ${linkedGoals.length === 1 ? 'that goal' : 'those goals'}.`}
          confirmLabel="Continue editing"
          danger={false}
          onCancel={() => setConfirmingEdit(false)}
          onConfirm={() => {
            setConfirmingEdit(false);
            onEdit();
          }}
        >
          <LinkedGoalList goals={linkedGoals} />
        </ConfirmDialog>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={linkedGoals.length ? 'Delete a task linked to goals?' : 'Delete task'}
          message={
            linkedGoals.length
              ? `"${task.title}" counts toward ${goalCount(linkedGoals)}. Deleting it removes it from ${linkedGoals.length === 1 ? 'that goal' : 'those goals'}, which may lower their progress and rating. This cannot be undone.`
              : `Delete "${task.title}"? This cannot be undone.`
          }
          confirmLabel="Delete task"
          busyLabel="Deleting…"
          busy={busy}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        >
          <LinkedGoalList goals={linkedGoals} />
        </ConfirmDialog>
      )}
    </div>
  );
}

// ==================== Recommendation ====================

// Recommendation: recommends team members for a new task.
// It only suggests; the manager picks someone, and the task is saved by the normal task form.

const LEVELS = [
  ['', 'Any level'],
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['expert', 'Expert'],
];

async function call(path, options) {
  return responseData(await apiRequest(path, options));
}

export function Recommendation({ form, onPick, onSkillsChange }) {
  const [open, setOpen] = useState(false);
  const [allSkills, setAllSkills] = useState([]);
  const [wanted, setWanted] = useState([]); // [{ skill_id, level, required }]
  const [typed, setTyped] = useState(''); // the skill name the manager is typing
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load the skill list the first time the panel opens.
  useEffect(() => {
    if (!open || allSkills.length) return;
    call('/api/recommendations/skills/')
      .then(setAllSkills)
      .catch((failure) => setError(failure.message));
  }, [open, allSkills.length]);

  // The person picked from the list is whoever the Assignee field holds now.
  const isChosen = (person) => String(person.employee_id) === String(form.assignee);
  const chosen = result ? result.recommended.find(isChosen) : null;

  // Tell the task form which skills the task needs, so they are saved with it.
  useEffect(() => {
    if (onSkillsChange) {
      onSkillsChange(wanted.map((w) => ({ skill: Number(w.skill_id), level: w.level })));
    }
  }, [wanted, onSkillsChange]);

  // Old results no longer match once the task details change, so hide them.
  useEffect(() => {
    setResult(null);
  }, [form.title, form.description, form.start_date, form.due_date, wanted]);

  const skillName = (id) => (allSkills.find((s) => String(s.id) === String(id)) || {}).name || '';
  const unused = allSkills.filter((s) => !wanted.some((w) => String(w.skill_id) === String(s.id)));

  // The manager types a skill name; it must match a skill someone in the team has.
  function addTypedSkill() {
    const name = typed.trim().toLowerCase();
    if (!name) return;
    const skill = allSkills.find((s) => s.name.trim().toLowerCase() === name);
    if (!skill) {
      setError(`No one in your team has "${typed.trim()}". Check the spelling or pick a suggestion.`);
      return;
    }
    if (wanted.some((w) => String(w.skill_id) === String(skill.id))) {
      setError(`${skill.name} is already in the list.`);
      return;
    }
    setError('');
    setWanted((list) => [...list, { skill_id: skill.id, level: '', required: true }]);
    setTyped('');
  }

  function changeSkill(index, field, value) {
    setWanted((list) => list.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeSkill(index) {
    setWanted((list) => list.filter((_, i) => i !== index));
  }

  function validate() {
    if (!form.start_date || !form.due_date) return 'Enter the start and due dates first.';
    if (form.due_date < form.start_date) return 'The due date cannot be before the start date.';
    return '';
  }

  async function recommend() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await call('/api/recommendations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          start_date: form.start_date,
          due_date: form.due_date,
          skills: wanted.map((w) => ({
            skill_id: Number(w.skill_id),
            level: w.level,
            required: w.required,
          })),
        }),
      });
      setResult(data);
    } catch (failure) {
      setError(failure.message || 'Recommendations could not be loaded.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ws-btn ws-btn-secondary rec-open" onClick={() => setOpen(true)}>
        Recommend employees
      </button>
    );
  }

  return (
    <section className="rec-panel" aria-label="Employee recommendations">
      <div className="rec-head">
        <strong>Employee recommendations</strong>
        <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="ws-hint">Uses the title, description and dates above. You still choose who gets the task.</p>

      <div className="ws-field">
        <span className="ws-label">Skills <span className="ws-optional">(optional)</span></span>
        {wanted.map((item, index) => (
          <div className="rec-skill" key={item.skill_id}>
            <span className="rec-skill-name">{skillName(item.skill_id)}</span>
            <select
              className="ws-select ws-select-sm"
              value={item.level}
              onChange={(event) => changeSkill(index, 'level', event.target.value)}
              aria-label="Minimum level"
            >
              {LEVELS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
            <select
              className="ws-select ws-select-sm"
              value={item.required ? 'required' : 'optional'}
              onChange={(event) => changeSkill(index, 'required', event.target.value === 'required')}
              aria-label="Required or optional"
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
            <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" onClick={() => removeSkill(index)}>
              Remove
            </button>
          </div>
        ))}
        <div className="rec-add">
          <input
            className="ws-input"
            list="rec-skill-options"
            placeholder="Type a skill, e.g. Python"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the skill instead of submitting the task form.
              if (event.key === 'Enter') {
                event.preventDefault();
                addTypedSkill();
              }
            }}
            aria-label="Skill name"
          />
          <datalist id="rec-skill-options">
            {unused.map((skill) => <option key={skill.id} value={skill.name} />)}
          </datalist>
          <button type="button" className="ws-btn ws-btn-secondary" onClick={addTypedSkill}>
            Add
          </button>
        </div>
        {allSkills.length === 0 && (
          <span className="ws-hint">No one in your team has skills saved yet.</span>
        )}
      </div>

      {error && <div className="ws-form-error" role="alert">{error}</div>}

      <button type="button" className="ws-btn ws-btn-primary" onClick={recommend} disabled={loading}>
        {loading ? 'Finding…' : 'Find suitable employees'}
      </button>

      {result && !result.eligible_found && (
        <p className="rec-empty">
          No suitable employee was found. Choose someone from Assignee, or change the requirements.
        </p>
      )}

      {chosen && (
        <p className="rec-chosen" role="status">
          {displayName(chosen)} is now the assignee. Press Create task to save.
        </p>
      )}

      {result && result.recommended.length > 0 && (
        <ol className="rec-list">
          {result.recommended.map((person) => (
            <li key={person.employee_id} className="rec-person">
              <div className="rec-person-head">
                <strong>{displayName(person)}</strong>
                <span className="rec-score">{Math.round(person.score * 100)}% match</span>
                {/* Pressing it again clears the choice, so the manager can change their mind. */}
                <button
                  type="button"
                  className={`ws-btn ws-btn-sm ${isChosen(person) ? 'ws-btn-secondary' : 'ws-btn-primary'}`}
                  onClick={() => onPick(isChosen(person) ? '' : String(person.employee_id))}
                >
                  {isChosen(person) ? 'Unselect' : 'Choose'}
                </button>
              </div>
              <ul className="rec-reasons">
                {person.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {result && result.excluded.length > 0 && (
        <details className="rec-excluded">
          <summary>Not suitable ({result.excluded.length})</summary>
          <ul>
            {result.excluded.map((person) => (
              <li key={person.employee_id}>
                <strong>{displayName(person)}</strong>: {person.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ==================== Shell ====================

const LINKS = {
  Manager: [
    ['/dashboard/manager', 'Overview', 'layout'],
    ['/manager/projects', 'Projects', 'folder'],
    ['/manager/tasks', 'Tasks', 'tasks'],
    ['/manager/team', 'My team', 'users'],
    ['/manager/goals', 'Performance', 'flag'],
  ],
  Employee: [
    ['/dashboard/employee', 'Overview', 'layout'],
    ['/employee/tasks', 'My tasks', 'tasks'],
    ['/employee/performance', 'Performance', 'flag'],
  ],
  HR: [
    ['/dashboard/hr', 'Overview', 'layout'],
    ['/hr/team', 'Employees', 'users'],
    ['/hr/performance', 'Performance', 'flag'],
  ],
};

const TODAY = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// The project details page belongs to the Projects menu item.
function isActive(path) {
  const current = window.location.pathname;
  return current === path || (path === '/manager/projects' && current === '/manager/project')
    || (path === '/hr/team' && current === '/hr/employees');
}

// One message component for every page.
// Errors stay in the page next to the thing they are about. A success message
// pops up in the middle of the screen and fades away by itself (useBanner
// clears it after about 4 seconds).
export function Banner({ message, isError, onClose }) {
  if (!message) return null;
  if (isError) {
    return (
      <div className="ws-banner ws-banner-error" role="alert">
        <Icon name="alert" size={18} />
        <span>{message}</span>
        {onClose && (
          <button type="button" className="ws-banner-close" onClick={onClose} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    );
  }
  return createPortal(
    <div className="fb-toast" role="status" key={message}>
      <div className="fb-toast-card">
        <span className="fb-toast-icon"><Icon name="check" size={22} /></span>
        <p>{message}</p>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Lets a page put its main buttons in the top bar: <HeaderActions>...</HeaderActions>
export function HeaderActions({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    setTarget(document.getElementById('ws-header-actions'));
  }, []);
  return target ? createPortal(children, target) : null;
}

// Page layout shared by the manager and employee workspace screens.
// It also checks that the person is logged in with the right role.
export function Shell({ role, title, subtitle, breadcrumbs = [], children }) {
  const [login, setLogin] = useState(null);
  const [, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const savedLogin = getLogin();
    if (!savedLogin) {
      window.location.replace('/login');
      return;
    }
    const savedRole = savedLogin.user.role === 'HR Professional' ? 'HR' : savedLogin.user.role;
    if (savedRole !== role) {
      const home = savedLogin.user.role === 'Manager' ? '/dashboard/manager' : '/dashboard/employee';
      const isHr = savedLogin.user.role === 'HR' || savedLogin.user.role === 'HR Professional';
      window.location.replace(isHr ? '/dashboard/hr' : home);
      return;
    }
    setLogin(savedLogin);
  }, [role]);

  function logout() {
    clearLogin();
    window.location.assign('/');
  }

  if (!login) {
    return <div className="ws-app ws-loading">Opening your workspace…</div>;
  }

  const items = LINKS[role];
  const current = items.find(([path]) => isActive(path));
  const pageIcon = current ? current[2] : 'layout';
  const roleName = login.user.role_label || login.user.role;
  const crumbTrail = breadcrumbs.length > 0 ? breadcrumbs : [['Workspace'], [title]];

  return (
    <div className="ws-app">
      <aside className="ws-sidebar">
        <a className="ws-brand" href="/" aria-label="Bayyinah home">
          <img src="/bayyinah-logo.png" alt="" />
          <span>Bayyinah</span>
        </a>
        <nav className="ws-nav" aria-label="Workspace navigation">
          {items.map(([path, text, icon]) => (
            <a key={path} href={path} className={isActive(path) ? 'active' : ''} aria-current={isActive(path) ? 'page' : undefined}>
              <Icon name={icon} size={17} />
              {text}
            </a>
          ))}
        </nav>
        <div className="ws-sidebar-footer">
          <Avatar name={displayName(login.user)} size={32} />
          <div className="ws-user">
            <span className="ws-user-name">{displayName(login.user)}</span>
            <span className="ws-user-role">{login.user.role}</span>
          </div>
          <button type="button" className="ws-icon-btn" onClick={logout} aria-label="Log out" title="Log out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="ws-main">
        <header className="ws-head">
          <span className="ws-head-icon"><Icon name={pageIcon} size={22} /></span>
          <div className="ws-head-text">
            <nav className="ws-crumbs" aria-label="Breadcrumb">
              {crumbTrail.map(([text, href], index) => (
                <span key={`${text}-${index}`}>
                  {index > 0 && <Icon name="chevron" size={12} className="ws-crumb-sep" />}
                  {href ? <a href={href}>{text}</a> : <span aria-current={index === crumbTrail.length - 1 ? 'page' : undefined}>{text}</span>}
                </span>
              ))}
            </nav>
            <h1 className="ws-title">{title}</h1>
            {subtitle && <p className="ws-subtitle">{subtitle}</p>}
          </div>
          <div className="ws-head-side">
            <span className="ws-head-chip"><Icon name="calendar" size={14} />{TODAY}</span>
            <span className="ws-head-chip ws-head-role">{roleName}</span>
            <a className="ws-head-profile" href="/profile" aria-label="My profile" title="My profile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
            </a>
          </div>
        </header>
        <div className="ws-body">
          <main className="ws-content">
            {/* Pages put their main buttons here with <HeaderActions>, above the page content. */}
            <div className="ws-header-actions ws-page-actions" id="ws-header-actions" />
            {children}
          </main>
        </div>
        <footer className="ws-footer">
          <div className="ws-footer-grid">
            <div className="ws-footer-about">
              <a className="brand brand-light" href="/" aria-label="Bayyinah home">
                <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
                <span className="brand-word">
                  <span className="brand-latin">Bayyinah</span>
                  <span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span>
                </span>
              </a>
              <p>Tasks, goals, skills and burnout insights for HR, managers and employees, in one place.</p>
            </div>
            <nav className="ws-footer-col" aria-label="Footer">
              <h4>Your workspace</h4>
              {items.map(([path, text]) => <a key={path} href={path}>{text}</a>)}
            </nav>
            <div className="ws-footer-col">
              <h4>Account</h4>
              <span>{displayName(login.user)}</span>
              <span>{login.user.email}</span>
              <button type="button" onClick={logout}>Log out</button>
            </div>
          </div>
          <div className="ws-footer-base">
            <span>© 2026 Bayyinah Platform. All rights reserved.</span>
            <span>Secure access for your organization</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ==================== YearPicker ====================

// A year chooser that matches the rest of the interface (the browser's own
// <select> menu cannot be styled). Works with mouse, touch and keyboard.
export function YearPicker({ year, years, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function outside(event) {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  function show() {
    setActive(Math.max(0, years.indexOf(year)));
    setOpen(true);
  }

  function choose(value) {
    setOpen(false);
    button.current?.focus();
    if (value !== year) onChange(value);
  }

  function onKeyDown(event) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(years.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(years.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(years[active]); }
    else if (event.key === 'Tab') setOpen(false);
  }

  return (
    <div className="yp" ref={root} onKeyDown={onKeyDown}>
      <span className="yp-label" id="yp-label">Evaluation year</span>
      <button
        ref={button}
        type="button"
        className={`yp-button${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="yp-label yp-value"
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="calendar" size={16} />
        <span id="yp-value" className="yp-value">{year}</span>
        <Icon name="chevron" size={14} className="yp-caret" />
      </button>
      {open && (
        <ul className="yp-menu" role="listbox" aria-labelledby="yp-label" aria-activedescendant={`yp-${years[active]}`}>
          {years.map((value, index) => (
            <li
              key={value}
              id={`yp-${value}`}
              role="option"
              aria-selected={value === year}
              className={`yp-option${index === active ? ' is-active' : ''}${value === year ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(value)}
            >
              <span>{value}</span>
              {value === new Date().getFullYear() && <span className="yp-tag">This year</span>}
              {value === year && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ==================== enhanceSelects ====================

// Gives every <select> in the app the same look and behaviour.
//
// The browser draws the open list of a native <select> itself, so it cannot be
// styled and looks different on every system. This file keeps the real select
// (so forms, validation and React keep working) but hides it, and shows a
// styled button and list instead. Choosing an option sets the real select and
// fires a normal "change" event.

const CARET = '<svg class="ws-icon yp-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const CHECK = '<svg class="ws-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const SELECTOR = 'select';
const enhanced = new WeakMap();
let openState = null; // { select, menu, button, active }

function labelOf_enhanceSelects(select) {
  const option = select.options[select.selectedIndex];
  return option ? option.textContent : '';
}

function isPlaceholder(select) {
  const option = select.options[select.selectedIndex];
  return !option || option.value === '';
}

function sync(select) {
  const record = enhanced.get(select);
  if (!record) return;
  const { button, value } = record;
  const text = labelOf_enhanceSelects(select);
  if (value.textContent !== text) value.textContent = text;
  value.classList.toggle('is-placeholder', isPlaceholder(select));
  button.disabled = select.disabled;
  button.classList.toggle('is-invalid', select.classList.contains('is-invalid'));
}

function closeMenu(refocus) {
  if (!openState) return;
  const { menu, button } = openState;
  menu.remove();
  button.setAttribute('aria-expanded', 'false');
  button.classList.remove('is-open');
  openState = null;
  document.removeEventListener('mousedown', onOutside, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  if (refocus) button.focus();
}

function onOutside(event) {
  if (!openState) return;
  if (openState.menu.contains(event.target) || openState.button.contains(event.target)) return;
  closeMenu(false);
}
function onScroll(event) {
  if (openState && !openState.menu.contains(event.target)) closeMenu(false);
}
function onResize() { closeMenu(false); }

function choose(select, index) {
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  closeMenu(true);
  sync(select);
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function paintActive() {
  if (!openState) return;
  const { menu, active } = openState;
  [...menu.children].forEach((item, index) => item.classList.toggle('is-active', index === active));
  const item = menu.children[active];
  if (item) item.scrollIntoView({ block: 'nearest' });
  menu.setAttribute('aria-activedescendant', item ? item.id : '');
}

let counter = 0;
function openMenu(select) {
  const record = enhanced.get(select);
  if (!record || select.disabled) return;
  if (openState) closeMenu(false);
  const { button } = record;
  const menu = document.createElement('ul');
  menu.className = 'yp-menu yp-floating';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  const id = `sel-${++counter}`;
  [...select.options].forEach((option, index) => {
    if (option.hidden) return;
    const item = document.createElement('li');
    item.id = `${id}-${index}`;
    item.className = 'yp-option';
    item.setAttribute('role', 'option');
    item.dataset.index = String(index);
    if (option.disabled) item.setAttribute('aria-disabled', 'true');
    const selected = index === select.selectedIndex;
    item.setAttribute('aria-selected', String(selected));
    if (selected) item.classList.add('is-selected');
    if (option.value === '') item.classList.add('is-placeholder');
    item.innerHTML = '<span></span>';
    item.firstChild.textContent = option.textContent;
    if (selected) item.insertAdjacentHTML('beforeend', CHECK);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', () => { if (!option.disabled) choose(select, index); });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();
  menu.style.minWidth = `${Math.max(rect.width, 180)}px`;
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const height = Math.min(menu.scrollHeight, 300);
  const openUp = below < height && above > below;
  menu.style.maxHeight = `${Math.max(120, Math.min(300, openUp ? above : below))}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)}px`;
  menu.style.top = openUp ? `${rect.top - menu.offsetHeight - 6}px` : `${rect.bottom + 6}px`;
  if (openUp) menu.style.transformOrigin = 'bottom left';

  button.setAttribute('aria-expanded', 'true');
  button.classList.add('is-open');
  openState = { select, menu, button, active: Math.max(0, select.selectedIndex) };
  paintActive();
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
}

function move(step) {
  if (!openState) return;
  const { select } = openState;
  let next = openState.active;
  for (let i = 0; i < select.options.length; i += 1) {
    next += step;
    if (next < 0 || next >= select.options.length) return;
    if (!select.options[next].disabled && !select.options[next].hidden) { openState.active = next; paintActive(); return; }
  }
}

function onKeyDown(event, select) {
  if (!openState) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu(select); }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
  else if (event.key === 'Home') { event.preventDefault(); openState.active = -1; move(1); }
  else if (event.key === 'End') { event.preventDefault(); openState.active = select.options.length; move(-1); }
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(select, openState.active); }
  else if (event.key === 'Tab') closeMenu(false);
}

function enhance(select) {
  if (enhanced.has(select) || select.multiple || select.size > 1 || select.dataset.native === 'true') return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yp-button yp-select';
  if (select.classList.contains('ws-select-sm')) button.classList.add('yp-sm');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = select.getAttribute('aria-label');
  if (label) button.setAttribute('aria-label', label);
  else if (select.id) {
    const text = document.querySelector(`label[for="${select.id}"]`);
    if (text) button.setAttribute('aria-label', text.textContent.trim());
  }
  const value = document.createElement('span');
  value.className = 'yp-value';
  button.appendChild(value);
  button.insertAdjacentHTML('beforeend', CARET);
  button.addEventListener('click', () => (openState && openState.button === button ? closeMenu(false) : openMenu(select)));
  button.addEventListener('keydown', (event) => onKeyDown(event, select));
  select.classList.add('sel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(button);
  enhanced.set(select, { button, value });
  select.addEventListener('change', () => sync(select));
  sync(select);
}

function sweep() {
  document.querySelectorAll(SELECTOR).forEach(enhance);
  // Remove buttons whose select is gone, and refresh labels React changed.
  document.querySelectorAll('.yp-select').forEach((button) => {
    const select = button.previousElementSibling;
    if (!select || select.tagName !== 'SELECT' || !select.isConnected) button.remove();
    else sync(select);
  });
}

export function enhanceSelects() {
  if (typeof document === 'undefined' || window.__selectsEnhanced) return;
  window.__selectsEnhanced = true;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // React sets a select's value without any DOM event; a light check keeps labels right.
  setInterval(() => { if (!document.hidden) document.querySelectorAll('select.sel-native').forEach(sync); }, 400);
  sweep();
}
