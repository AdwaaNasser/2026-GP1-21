import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Banner, ConfirmDialog, getJson, sendJson, useBanner } from './ui.jsx';

// Skills of an employee. The employee picks them from the skills catalogue
// (a searchable drop-down: typing in it filters the same list, never free text)
// and sets the level of each one.
// Nobody adds skills to the catalogue here: new skills go in with `manage.py add_skill`.
// The level is never raised automatically: it is changed here by hand.
//
// Use it inside the profile page:
//   <SkillsEditor />                      the signed-in employee, their own skills
//   <SkillsEditor employeeId={7} />       a manager editing a team member's levels
const LEVELS = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['expert', 'Expert'],
];

// Same idea as skill_key() in accounts/skill_names.py, so "nodejs" finds "Node.js"
// and "js" finds "JavaScript".
const ALIASES = { js: 'javascript', ts: 'typescript', postgres: 'postgresql', py: 'python', k8s: 'kubernetes' };

function searchKey(text) {
  return String(text || '').toLowerCase().replace(/[^0-9a-z+#]/g, '');
}

// Catalogue skills that match the search: names that start with it come first.
// An empty search returns the whole list in A–Z order.
function findSkills(items, query) {
  const key = searchKey(query);
  if (!key) return [...items].sort((a, b) => a.name.localeCompare(b.name));
  const keys = [key, ALIASES[key]].filter(Boolean);
  const starts = [];
  const contains = [];
  items.forEach((item) => {
    const name = searchKey(item.name);
    if (keys.some((k) => name.startsWith(k))) starts.push(item);
    else if (keys.some((k) => name.includes(k))) contains.push(item);
  });
  const byName = (a, b) => a.name.localeCompare(b.name);
  return [...starts.sort(byName), ...contains.sort(byName)];
}

export function SkillsEditor({ employeeId }) {
  const { banner, success, failure, clear } = useBanner();
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState(null); // [{ skill, name, level }]
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false); // the skills list is showing
  const [active, setActive] = useState(0); // highlighted option (keyboard)
  const [removing, setRemoving] = useState(null); // the row waiting for confirmation
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const listRef = useRef(null);
  const mine = !employeeId;
  const path = mine ? '/api/accounts/skills/mine/' : `/api/accounts/skills/employee/${employeeId}/`;

  const loadCatalog = useCallback(() => (
    getJson('/api/accounts/skills/catalog/').then(setCatalog).catch(failure)
  ), [failure]);

  useEffect(() => {
    loadCatalog();
    getJson(path).then((data) => setRows(data.skills)).catch((error) => { failure(error); setRows([]); });
  }, [path, loadCatalog, failure]);

  if (rows === null) return <p className="ws-hint">Loading…</p>;

  const unused = catalog.filter((item) => !rows.some((row) => row.skill === item.id));
  const searching = Boolean(query.trim());
  const matches = findSkills(unused, query);
  const alreadyAdded = searching && matches.length === 0
    ? findSkills(rows.map((row) => ({ id: row.skill, name: row.name })), query)
    : [];

  function search(text) {
    setQuery(text);
    setActive(0);
    setOpen(true);
  }

  function add(item) {
    setRows([...rows, { skill: item.id, name: item.name, level: 'beginner' }]);
    setQuery('');
    setActive(0);
    setOpen(false);
    setDirty(true);
  }

  function highlight(index) {
    setActive(index);
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function changeLevel(skill, level) {
    setRows(rows.map((row) => (row.skill === skill ? { ...row, level } : row)));
    setDirty(true);
  }

  function confirmRemove() {
    setRows(rows.filter((item) => item.skill !== removing.skill));
    setRemoving(null);
    setDirty(true);
  }

  function onComboKey(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else highlight(Math.min(active + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(Math.max(active - 1, 0));
    } else if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      add(matches[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const data = await sendJson(path, 'PUT', { skills: rows.map(({ skill, level }) => ({ skill, level })) });
      setRows(data.skills);
      setDirty(false);
      success('Skills saved.');
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ws-card">
      <Banner {...banner} onClose={clear} />
      <div className="ws-card-head">
        <h3>Skills</h3>
        <p>Choose your skills and set your level in each one. Update the level when it changes.</p>
      </div>
      <div className="bc-body">
        {rows.length === 0 ? (
          <p className="ws-hint">No skills added yet.</p>
        ) : (
          <ul className="skills-list">
            {rows.map((row) => (
              <li key={row.skill} className="bc-toolbar">
                <b>{row.name}</b>
                <select className="ws-select ws-select-sm" aria-label={`Level of ${row.name}`} value={row.level} onChange={(event) => changeLevel(row.skill, event.target.value)}>
                  {LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" onClick={() => setRemoving(row)}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <div className="sk-combo">
          <input
            className="ws-input sk-combo-input"
            type="text"
            role="combobox"
            aria-label="Add a skill"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
            placeholder={`Choose or search a skill (${unused.length})…`}
            autoComplete="off"
            value={query}
            onChange={(event) => search(event.target.value)}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onComboKey}
          />
          <span className="sk-combo-arrow" aria-hidden="true" />

          {open && (
            matches.length > 0 ? (
              <ul id={listId} ref={listRef} className="sk-list" role="listbox" aria-label="Skills">
                {matches.map((item, index) => (
                  <li
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    className={`sk-option${index === active ? ' is-active' : ''}`}
                    // mousedown, not click: picks the skill before the input loses focus
                    onMouseDown={(event) => { event.preventDefault(); add(item); }}
                    onMouseEnter={() => setActive(index)}
                  >
                    {item.name}
                  </li>
                ))}
              </ul>
            ) : (
              <div id={listId} className="sk-list sk-list-empty" role="status">
                {!searching
                  ? 'You have added every skill in the list.'
                  : alreadyAdded.length > 0
                  ? `“${alreadyAdded[0].name}” is already in your skills.`
                  : `No skill matches “${query.trim()}”. Can't find it? Ask your system administrator to add it to the list.`}
              </div>
            )
          )}
        </div>

        <div className="bc-toolbar sk-save">
          {dirty && <span className="sk-unsaved" role="status">You have unsaved changes.</span>}
          <button type="button" className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : 'Save skills'}
          </button>
        </div>
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove this skill?"
          message={`"${removing.name}" will be removed from ${mine ? 'your' : 'this employee’s'} skills when you press Save skills. ${mine ? 'You' : 'They'} may no longer be suggested for tasks that need this skill.`}
          confirmLabel="Remove skill"
          onCancel={() => setRemoving(null)}
          onConfirm={confirmRemove}
        />
      )}
    </section>
  );
}