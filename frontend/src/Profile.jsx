import { useEffect, useState } from 'react';
import { displayName, getLogin } from './api.js';
import { SkillsEditor } from './SkillsEditor.jsx';
import { Banner, formatDate, getJson, initials, Shell } from './ui.jsx';

/* ==========================================================================
   My profile (/profile), the same page for HR, managers and employees.
   - Who you are: read only. HR changes these details.
   - Skills: the team's SkillsEditor component. It loads and saves the skills
     of the person who is logged in by itself, so it needs no props here.
   Styles: the "Profile page" section at the end of styles.css ("pf-" classes).
   ========================================================================== */

// Roles that see the Skills card. Only employees: the backend saves skills for
// employees only (/api/accounts/skills/mine/ answers 403 for managers and HR,
// and employee_skills points at the employees table).
const SKILLS_FOR = ['Employee'];

function roleOf(user) {
  if (!user) return 'Employee';
  return user.role === 'HR Professional' ? 'HR' : user.role;
}

function ProfileHeader({ person, role }) {
  const name = displayName(person) || person.email;
  const department = person.department?.name;
  return (
    <section className="ws-card pf-header">
      <span className="pf-avatar" aria-hidden="true">{initials(name)}</span>
      <div className="pf-header-text">
        <h2>{name}</h2>
        <p>{person.job_title || 'No job title yet'}</p>
      </div>
      <ul className="pf-tags" aria-label="Role and department">
        <li>{person.role_label || role}</li>
        {department && <li>{department}</li>}
      </ul>
    </section>
  );
}

function Detail({ label, children }) {
  return (
    <div className="pf-detail">
      <dt>{label}</dt>
      <dd>{children || <span className="pf-empty">Not set</span>}</dd>
    </div>
  );
}

function PersonalInfo({ person, role, wide = false }) {
  return (
    <section className="ws-card">
      <div className="ws-card-head">
        <h3>Personal information</h3>
        <p>To change these details, contact your HR team.</p>
      </div>
      <dl className={`pf-details${wide ? ' pf-details-wide' : ''}`}>
        <Detail label="Email">{person.email}</Detail>
        <Detail label="Department">{person.department?.name}</Detail>
        <Detail label="Role">{person.role_label || role}</Detail>
        <Detail label="Hire date">{person.hire_date ? formatDate(person.hire_date) : ''}</Detail>
        {role === 'Employee' && <Detail label="Reports to">{person.manager?.name}</Detail>}
      </dl>
    </section>
  );
}

function ProfileContent({ role }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const login = getLogin();
    if (!login) return;
    getJson(`/api/accounts/employees/${login.user.id}/`)
      .then(setPerson)
      .catch((failure) => {
        setError(failure.message);
        setPerson(login.user); // still show the name and email saved at login
      });
  }, []);

  if (!person) return <p className="pf-loading">Loading your profile…</p>;

  return (
    <div className="pf-page">
      {error && <Banner message={error} isError onClose={() => setError('')} />}
      <ProfileHeader person={person} role={role} />
      {SKILLS_FOR.includes(role) ? (
        <div className="pf-grid">
          <div className="pf-col">
            <PersonalInfo person={person} role={role} />
          </div>
          <div className="pf-col pf-skills">
            <SkillsEditor />
          </div>
        </div>
      ) : (
        // Managers and HR have no Skills card, so their details use the full width.
        <PersonalInfo person={person} role={role} wide />
      )}
    </div>
  );
}

export function Profile() {
  const role = roleOf(getLogin()?.user);
  return (
    <Shell role={role} title="My profile" breadcrumbs={[['Workspace'], ['My profile']]}>
      <ProfileContent role={role} />
    </Shell>
  );
}