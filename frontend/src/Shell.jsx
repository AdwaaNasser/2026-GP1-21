import { useEffect, useState } from 'react';
import { clearLogin, getLogin } from './api.js';

const LINKS = {
  Manager: [
    ['/dashboard/manager', 'Overview'],
    ['/manager/projects', 'Projects'],
    ['/manager/tasks', 'Tasks'],
  ],
  Employee: [
    ['/dashboard/employee', 'Overview'],
    ['/employee/tasks', 'My tasks'],
  ],
};

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B';
}

export function Banner({ message, isError }) {
  if (!message) return null;
  return (
    <div className={`status-banner${isError ? ' error' : ''}`} role="status">
      <span aria-hidden="true">{isError ? '!' : '✓'}</span>
      <span>{message}</span>
    </div>
  );
}

// Page layout shared by the manager and employee task screens.
// It also checks that the person is logged in with the right role.
export default function Shell({ role, title, children }) {
  const [login, setLogin] = useState(null);

  useEffect(() => {
    const savedLogin = getLogin();
    if (!savedLogin) {
      window.location.replace('/login');
      return;
    }
    if (savedLogin.user.role !== role) {
      const home = savedLogin.user.role === 'Manager' ? '/dashboard/manager' : '/dashboard/employee';
      window.location.replace(savedLogin.user.role === 'HR Professional' ? '/dashboard/hr' : home);
      return;
    }
    setLogin(savedLogin);
  }, [role]);

  function logout() {
    clearLogin();
    window.location.assign('/');
  }

  if (!login) {
    return <main className="page"><section className="card">Opening your workspace…</section></main>;
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-heading">
          <a className="dashboard-brand" href="/" aria-label="Bayyinah home">
            <img className="dashboard-logo" src="/bayyinah-logo.png" alt="" />
            <span>Bayyinah</span>
          </a>
          <div>
            <p className="eyebrow">BAYYINAH WORKSPACE</p>
            <h1>{title}</h1>
            <p className="description">Welcome back, {login.user.full_name}</p>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <span className="user-chip"><span className="user-avatar">{initials(login.user.full_name)}</span>{login.user.role}</span>
          <button className="secondary-button" type="button" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="dashboard-subnav" aria-label="Workspace navigation">
        {LINKS[role].map(([path, text]) => (
          <a key={path} href={path} className={window.location.pathname === path ? 'active' : ''}>{text}</a>
        ))}
      </nav>

      <div className="task-page">{children}</div>
    </main>
  );
}
