import { useCallback, useEffect, useState } from 'react';
import { Banner, getJson, sendJson, useBanner } from './ui.jsx';

// Skills of an employee. The employee picks them from the list of the
// organization (a drop-down, never free text) and sets the level of each one.
// The level is never raised automatically: it is changed here by hand.
//
// Use it inside the profile page:
//   <SkillsEditor />                      the signed-in employee, their own skills
//   <SkillsEditor employeeId={7} />       a manager editing a team member's levels
//   <SkillsEditor canAddToList />         a manager can also add a new skill to the list
const LEVELS = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['expert', 'Expert'],
];

export function SkillsEditor({ employeeId, canAddToList = false }) {
  const { banner, success, failure, clear } = useBanner();
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState(null); // [{ skill, name, level }]
  const [pick, setPick] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
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

  function add() {
    const item = catalog.find((entry) => String(entry.id) === pick);
    if (!item) return;
    setRows([...rows, { skill: item.id, name: item.name, level: 'beginner' }]);
    setPick('');
  }

  function changeLevel(skill, level) {
    setRows(rows.map((row) => (row.skill === skill ? { ...row, level } : row)));
  }

  async function save() {
    setBusy(true);
    try {
      const data = await sendJson(path, 'PUT', { skills: rows.map(({ skill, level }) => ({ skill, level })) });
      setRows(data.skills);
      success('Skills saved.');
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  }

  async function addToList() {
    setBusy(true);
    try {
      await sendJson('/api/accounts/skills/catalog/', 'POST', { name: newName });
      setNewName('');
      await loadCatalog();
      success('Skill added to the list.');
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
                <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" onClick={() => setRows(rows.filter((item) => item.skill !== row.skill))}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <div className="bc-toolbar">
          <select className="ws-select ws-select-sm" aria-label="Add a skill" value={pick} onChange={(event) => setPick(event.target.value)}>
            <option value="">Add a skill…</option>
            {unused.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" disabled={!pick} onClick={add}>Add</button>
          <button type="button" className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy} onClick={save}>Save skills</button>
        </div>

        {canAddToList && (
          <div className="bc-toolbar">
            <input className="ws-input" placeholder="New skill name" aria-label="New skill name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button type="button" className="ws-btn ws-btn-sm ws-btn-secondary" disabled={busy || !newName.trim()} onClick={addToList}>Add to the list</button>
          </div>
        )}
      </div>
    </section>
  );
}
