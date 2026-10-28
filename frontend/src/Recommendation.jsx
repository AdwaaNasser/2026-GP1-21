import { useEffect, useState } from 'react';
import { apiRequest, displayName, responseData } from './api.js';

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

export default function Recommendation({ form, onPick }) {
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