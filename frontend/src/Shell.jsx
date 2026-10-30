import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearLogin, displayName, getLogin } from './api.js';
import { Avatar, Icon } from './taskUi.jsx';

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
export default function Shell({ role, title, subtitle, breadcrumbs = [], children }) {
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
