import { useEffect, useMemo, useState } from 'react';
import Shell, { Banner } from './Shell.jsx';
import {
  Avatar,
  EmptyState,
  Icon,
  Modal,
  Stats,
  TableSkeleton,
  formatDate,
  getJson,
  sendJson,
  useBanner,
} from './taskUi.jsx';
import { apiRequest, displayName, responseData } from './api.js';
import { validatedSubmit } from './formValidation.js';

const BATCH_KEY = 'bayyinahCsvImportV3';
const ROLES = ['HR Professional', 'Employee', 'Manager'];
const GENDERS = ['Male', 'Female'];

const CSV_TEMPLATE = [
  'email,first_name,last_name,role,job_title,gender,department,hire_date,allowed_absence_days,manager_email',
  'sara@example.com,Sara,Alharbi,Employee,Software Engineer,Female,Engineering,2024-01-15,21,omar@example.com',
  'omar@example.com,Omar,Khalid,Manager,Operations Manager,Male,Operations,2022-03-01,21,',
  'lina@example.com,Lina,Faisal,HR Professional,HR Specialist,Female,People,2021-06-10,21,',
].join('\n');

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([`${CSV_TEMPLATE}\n`], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bayyinah-team-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// ---------- Add or edit one person ----------

function PersonForm({ person, departments, managers, onSubmit, onCancel }) {
  const isEdit = Boolean(person);
  const [form, setForm] = useState(
    isEdit
      ? {
          first_name: person.first_name,
          last_name: person.last_name,
          email: person.email,
          role: person.role_label,
          job_title: person.job_title || '',
          gender: person.gender || '',
          hire_date: person.hire_date || '',
          allowed_absence_days: String(person.allowed_absence_days ?? ''),
          department: person.department.name || '',
          manager_id: person.manager ? String(person.manager.id) : '',
        }
      : {
          first_name: '',
          last_name: '',
          email: '',
          role: 'Employee',
          job_title: '',
          gender: '',
          hire_date: '',
          allowed_absence_days: '',
          department: '',
          manager_id: '',
        },
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit() {
    setError('');
    setSaving(true);
    try {
      const shared = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        job_title: form.job_title.trim(),
        gender: form.gender,
        hire_date: form.hire_date,
        allowed_absence_days: Number(form.allowed_absence_days),
        department: form.department.trim(),
      };
      if (form.role === 'Employee') shared.manager_id = Number(form.manager_id);
      await onSubmit(
        isEdit ? shared : { ...shared, email: form.email.trim(), role: form.role },
      );
    } catch (failure) {
      setError(failure.message || 'The person could not be saved.');
      setSaving(false);
    }
  }

  const needsDepartment = form.role !== 'HR Professional';

  return (
    <form className="ws-form" onSubmit={validatedSubmit(submit)} noValidate>
      {error && <div className="ws-form-error" role="alert">{error}</div>}

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">First name</span>
          <input className="ws-input" value={form.first_name} maxLength={255} required autoFocus onChange={(e) => setField('first_name', e.target.value)} />
        </label>
        <label className="ws-field">
          <span className="ws-label">Last name</span>
          <input className="ws-input" value={form.last_name} maxLength={255} required onChange={(e) => setField('last_name', e.target.value)} />
        </label>
      </div>

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">Email</span>
          <input className="ws-input" type="email" value={form.email} maxLength={255} required readOnly={isEdit} onChange={(e) => setField('email', e.target.value)} />
        </label>
        <label className="ws-field">
          <span className="ws-label">Role</span>
          {isEdit ? (
            <input className="ws-input" value={form.role} readOnly />
          ) : (
            <select className="ws-select" value={form.role} required onChange={(e) => setField('role', e.target.value)}>
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          )}
        </label>
      </div>

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">Job title</span>
          <input className="ws-input" value={form.job_title} maxLength={255} required placeholder="e.g. Senior Network Engineer" onChange={(e) => setField('job_title', e.target.value)} />
        </label>
      </div>

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">Gender</span>
          <select className="ws-select" value={form.gender} required onChange={(e) => setField('gender', e.target.value)}>
            <option value="">Choose gender</option>
            {GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
          </select>
        </label>
        <label className="ws-field">
          <span className="ws-label">Hire date</span>
          <input className="ws-input" type="date" value={form.hire_date} required onChange={(e) => setField('hire_date', e.target.value)} />
        </label>
      </div>

      <div className="ws-form-grid">
        <label className="ws-field">
          <span className="ws-label">Allowed absence days (per year)</span>
          <input className="ws-input" type="number" min="0" max="366" step="1" value={form.allowed_absence_days} required onChange={(e) => setField('allowed_absence_days', e.target.value)} />
        </label>
        <label className="ws-field">
          <span className="ws-label">
            Department {!needsDepartment && <span className="ws-optional">(optional for HR)</span>}
          </span>
          <input className="ws-input" list="department-options" value={form.department} maxLength={255} required={needsDepartment} placeholder="Choose or type a department" onChange={(e) => setField('department', e.target.value)} />
          <datalist id="department-options">
            {departments.map((department) => <option key={department.id} value={department.name} />)}
          </datalist>
        </label>
      </div>

      {form.role === 'Employee' && (
        <div className="ws-form-grid">
          <label className="ws-field">
            <span className="ws-label">Direct manager</span>
            <select className="ws-select" value={form.manager_id} required onChange={(e) => setField('manager_id', e.target.value)}>
              <option value="">Choose a manager</option>
              {managers.map((manager) => <option key={manager.id} value={manager.id}>{displayName(manager)}</option>)}
            </select>
          </label>
        </div>
      )}

      {!isEdit && (
        <p className="ws-hint">An invitation email is sent so the new person can set their own password.</p>
      )}

      <div className="ws-form-actions">
        <button className="ws-btn ws-btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add person'}
        </button>
        <button className="ws-btn ws-btn-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- Import a CSV file ----------

function CsvImport({ onImported, success, failure }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(BATCH_KEY) || 'null');
    } catch {
      return null;
    }
  });

  function keep(next) {
    setBatch(next);
    try {
      sessionStorage.setItem(BATCH_KEY, JSON.stringify(next));
    } catch {
      // Private browsing can block storage; the page still works without it.
    }
  }

  async function upload() {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await responseData(await apiRequest('/api/accounts/import-csv/', { method: 'POST', body }));
      keep(result);
      setFile(null);
      document.getElementById('team-csv-form')?.reset();
      if (result.errors.length > 0) failure(new Error('Some rows need review before they can be added.'));
      else success(result.status);
      onImported();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  }

  async function inviteAll() {
    setBusy(true);
    try {
      const result = await responseData(await apiRequest('/api/accounts/import-csv/invite-all/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: batch.pending_invitation_ids }),
      }));
      keep({ ...batch, invitations: result, pending_invitation_ids: result.remaining_ids });
      if (result.errors.length > 0) failure(new Error(result.message));
      else success(result.message);
      onImported();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  }

  const allInvited = batch?.invitations?.remaining === 0;

  return (
    <section className="ws-card ws-side-card" id="import">
      <div className="ws-card-head">
        <div>
          <h3>Import your team from a CSV file</h3>
          <p>
            Every row needs: email, first_name, last_name, role (Employee, Manager or HR Professional),
            gender (Male or Female), hire_date (YYYY-MM-DD) and allowed_absence_days. job_title (free text, for example
            Senior Network Engineer). Department is needed
            for employees and managers. Employees should have manager_email, the email of their direct manager (list the manager on an earlier row, or use a manager who already exists). Review the summary, then send the invitations.
          </p>
        </div>
        <button type="button" className="ws-btn ws-btn-secondary ws-btn-sm" onClick={downloadTemplate}>
          <Icon name="plus" size={13} /> CSV template
        </button>
      </div>

      <form id="team-csv-form" className="ws-csv-form" noValidate onSubmit={validatedSubmit(upload)}>
        <input
          className="ws-input"
          type="file"
          accept=".csv,text/csv"
          required
          disabled={busy}
          aria-label="Employee CSV file"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <button className="ws-btn ws-btn-primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : 'Upload and review'}
        </button>
      </form>

      {batch && (
        <div className="ws-import-summary">
          <Stats items={[
            { label: 'Employees added', value: batch.summary.employees_added },
            { label: 'Managers added', value: batch.summary.managers_added },
            { label: 'HR added', value: batch.summary.hr_added || 0 },
            { label: 'Departments', value: batch.summary.departments.length },
          ]}
          />
          {batch.errors.length > 0 && (
            <div className="ws-form-error" role="alert">
              <strong>Some rows need review:</strong>
              <ul className="ws-error-list">
                {batch.errors.map((item) => (
                  <li key={`${item.row}-${String(item.detail)}`}>
                    Row {item.row}: {Array.isArray(item.detail) ? item.detail.join(' ') : String(item.detail)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="ws-import-actions">
            <span className="ws-hint">
              {batch.invitations
                ? `${batch.invitations.invited} invited · ${batch.invitations.remaining} remaining`
                : 'Accounts are saved without passwords. Invitations have not been sent yet.'}
            </span>
            <button
              type="button"
              className="ws-btn ws-btn-primary"
              onClick={inviteAll}
              disabled={busy || batch.summary.total_added === 0 || allInvited || !batch.pending_invitation_ids?.length}
            >
              {busy ? 'Sending…' : allInvited ? 'Invitations sent' : 'Send invitations'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- The page ----------

function PeopleTable({ list, onEdit, onInvite }) {
  return (
    <div className="ws-table-card">
      <table className="ws-table">
        <thead>
          <tr>
            <th>Name</th><th>Role</th><th>Job title</th><th>Direct manager</th><th>Gender</th><th>Department</th><th>Hired</th><th>Absence days</th><th>Status</th><th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {list.map((person) => (
            <tr key={person.id}>
              <td>
                <div className="hr-person">
                  <Avatar person={person} size={28} />
                  <div>
                    <div className="ws-task-title">{displayName(person)}</div>
                    <div className="ws-task-sub">{person.email}</div>
                  </div>
                </div>
              </td>
              <td>{person.role_label || '—'}</td>
              <td>{person.job_title || '—'}</td>
              <td>{person.role_label === 'Employee' ? (person.manager ? person.manager.name : <span className="ws-pill ws-pill-warn">Not assigned</span>) : '—'}</td>
              <td>{person.gender || '—'}</td>
              <td>{person.department.name || '—'}</td>
              <td>{formatDate(person.hire_date)}</td>
              <td>{person.allowed_absence_days}</td>
              <td>
                <span className={`ws-pill ${person.invitation_pending ? 'ws-pill-warn' : 'ws-pill-ok'}`}>
                  {person.invitation_pending ? 'Invite pending' : 'Active'}
                </span>
              </td>
              <td>
                <div className="ws-row-actions">
                  {person.invitation_pending && (
                    <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={() => onInvite(person)}>
                      Send invite
                    </button>
                  )}
                  <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={() => onEdit(person)}>
                    <Icon name="edit" size={13} />
                    Edit
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function TeamContent() {
  const { banner, success, failure, clear } = useBanner();
  const [people, setPeople] = useState(null); // null while loading
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    try {
      const [list, depts] = await Promise.all([
        getJson('/api/accounts/employees/'),
        getJson('/api/accounts/departments/'),
      ]);
      setPeople(list);
      setDepartments(depts);
    } catch (error) {
      failure(error);
      setPeople((current) => current || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addPerson(body) {
    const result = await sendJson('/api/accounts/team-invite/', 'POST', body);
    setAdding(false);
    success(result.message || 'Person added.');
    load();
  }

  async function updatePerson(body) {
    await sendJson(`/api/accounts/employees/${editing.id}/`, 'PATCH', body);
    setEditing(null);
    success('Information updated.');
    load();
  }

  async function sendInvite(person) {
    try {
      const result = await sendJson('/api/accounts/import-csv/invite-all/', 'POST', { employee_ids: [person.id] });
      if (result.errors.length > 0) throw new Error(result.errors[0].detail);
      success(`Invitation sent to ${person.email}.`);
    } catch (error) {
      failure(error);
    }
  }

  const managers = useMemo(() => (people || []).filter((person) => person.role_label === 'Manager'), [people]);

  // New people wait at the top until they set their own password.
  const waiting = useMemo(
    () => (people || []).filter((person) => person.invitation_pending).sort((a, b) => b.id - a.id),
    [people],
  );
  const active = useMemo(() => (people || []).filter((person) => !person.invitation_pending), [people]);

  const shown = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return active;
    return active.filter((person) =>
      `${displayName(person)} ${person.email} ${person.role_label} ${person.job_title} ${person.department.name} ${person.gender}`
        .toLowerCase()
        .includes(text),
    );
  }, [active, search]);

  return (
    <>
      <div className={banner.isError ? undefined : 'gl-toast'}>
        <Banner message={banner.message} isError={banner.isError} onClose={clear} />
      </div>

      {waiting.length > 0 && (
        <section className="ws-card ws-side-card" id="waiting">
          <div className="ws-card-head">
            <div>
              <h3>Newly added</h3>
              <p>
                {waiting.length} {waiting.length === 1 ? 'person has' : 'people have'} not set a password yet.
                They move to the list below once they do.
              </p>
            </div>
          </div>
          <PeopleTable list={waiting} onEdit={setEditing} onInvite={sendInvite} />
        </section>
      )}

      <CsvImport onImported={load} success={success} failure={failure} />

      <section className="ws-card ws-side-card" id="people">
        <div className="ws-card-head ws-card-head-actions">
          <div>
            <h3>People in your organization</h3>
            <p>{people === null ? 'Loading…' : `${active.length} ${active.length === 1 ? 'person' : 'people'}`}</p>
          </div>
          <div className="ws-card-tools">
            <label className="ws-search">
              <Icon name="search" size={15} />
              <input
                type="search"
                placeholder="Search people"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search people"
              />
            </label>
            <button className="ws-btn ws-btn-primary" type="button" onClick={() => setAdding(true)}>
              <Icon name="plus" size={15} />
              Add person
            </button>
          </div>
        </div>

        {people === null ? (
          <TableSkeleton />
        ) : active.length === 0 ? (
          <EmptyState icon="users" title="No one has set up an account yet">
            {waiting.length > 0 ? 'People appear here after they set their password.' : 'Add your first person, or import a CSV file.'}
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title="No one matches your search">
            Try a different name, email, job title or department.
          </EmptyState>
        ) : (
          <PeopleTable list={shown} onEdit={setEditing} onInvite={sendInvite} />
        )}
      </section>

      {adding && (
        <Modal title="Add person" onClose={() => setAdding(false)}>
          <PersonForm departments={departments} managers={managers} onSubmit={addPerson} onCancel={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit ${displayName(editing)}`} onClose={() => setEditing(null)}>
          <PersonForm person={editing} departments={departments} managers={managers} onSubmit={updatePerson} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}

export default function HrTeam() {
  return (
    <Shell
      role="HR"
      title="Import team"
      subtitle="Bring in your team from a CSV file, add people one by one, and keep their details up to date."
    >
      <TeamContent />
    </Shell>
  );
}
