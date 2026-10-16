import { apiRequest, responseData } from './api.js';

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

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{labelOf(STATUSES, status)}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge priority-${priority}`}>{labelOf(PRIORITIES, priority)}</span>;
}

export function ProgressBar({ progress }) {
  return (
    <div className="progress-cell">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <span>{progress.completed_tasks}/{progress.total_tasks} done ({progress.percent}%)</span>
    </div>
  );
}
