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
const JOB_TITLES = ['HR Professional', 'Employee', 'Manager'];
const GENDERS = ['Male', 'Female'];

const CSV_TEMPLATE = [
  'email,first_name,last_name,job_title,gender,department,hire_date,allowed_absence_days',
  'sara@example.com,Sara,Alharbi,Employee,Female,Engineering,2024-01-15,21',
  'omar@example.com,Omar,Khalid,Manager,Male,Operations,2022-03-01,21',
  'lina@example.com,Lina,Faisal,HR Professional,Female,People,2021-06-10,21',
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

function PersonForm({ person, departments, onSubmit, onCancel }) {
  const isEdit = Boolean(person);
  const [form, setForm] = useState(
    isEdit
      ? {
          first_name: person.first_name,
          last_name: person.last_name,
          email: person.email,
          job_title: person.job_title_label,
          gender: person.gender || '',
          hire_date: person.hire_date || '',
          allowed_absence_days: String(person.allowed_absence_days ?? ''),
          department: person.department.name || '',
        }
      : {
          first_name: '',
          last_name: '',
          email: '',
          job_title: 'Employee',
          gender: '',
          hire_date: '',
          allowed_absence_days: '',
          department: '',
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
        gender: form.gender,
        hire_date: form.hire_date,
        allowed_absence_days: Number(form.allowed_absence_days),
        department: form.department.trim(),
      };
      await onSubmit(
        isEdit ? shared : { ...shared, email: form.email.trim(), role: form.job_title },
      );
    } catch (failure) {
      setError(failure.message || 'The person could not be saved.');
      setSaving(false);
    }
  }

  const needsDepartment = form.job_title !== 'HR Professional';

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
          <span className="ws-label">Job title</span>
          {isEdit ? (
            <input className="ws-input" value={form.job_title} readOnly />
          ) : (
            <select className="ws-select" value={form.job_title} required onChange={(e) => setField('job_title', e.target.value)}>
              {JOB_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}
            </select>
          )}
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
            Every row needs: email, first_name, last_name, job_title (Employee, Manager or HR Professional),
            gender (Male or Female), hire_date (YYYY-MM-DD) and allowed_absence_days. Department is needed
            for employees and managers. Review the summary, then send the invitations.
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

  const shown = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return people || [];
    return (people || []).filter((person) =>
      `${displayName(person)} ${person.email} ${person.job_title_label} ${person.department.name} ${person.gender}`
        .toLowerCase()
        .includes(text),
    );
  }, [people, search]);

  return (
    <>
      <Banner message={banner.message} isError={banner.isError} onClose={clear} />

      <CsvImport onImported={load} success={success} failure={failure} />

      <section className="ws-card ws-side-card" id="people">
        <div className="ws-card-head ws-card-head-actions">
          <div>
            <h3>People in your organization</h3>
            <p>{people === null ? 'Loading…' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}</p>
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
        ) : people.length === 0 ? (
          <EmptyState icon="users" title="No people yet">
            Add your first person, or import a CSV file above.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title="No one matches your search">
            Try a different name, email, job title or department.
          </EmptyState>
        ) : (
          <div className="ws-table-card">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Name</th><th>Job title</th><th>Gender</th><th>Department</th><th>Hired</th><th>Absence days</th><th>Status</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((person) => (
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
                    <td>{person.job_title_label || '—'}</td>
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
                          <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={() => sendInvite(person)}>
                            Send invite
                          </button>
                        )}
                        <button className="ws-btn ws-btn-secondary ws-btn-sm" type="button" onClick={() => setEditing(person)}>
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
        )}
      </section>

      {adding && (
        <Modal title="Add person" onClose={() => setAdding(false)}>
          <PersonForm departments={departments} onSubmit={addPerson} onCancel={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit ${displayName(editing)}`} onClose={() => setEditing(null)}>
          <PersonForm person={editing} departments={departments} onSubmit={updatePerson} onCancel={() => setEditing(null)} />
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
