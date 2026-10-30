import { useState } from 'react';
import { responseData, saveLogin } from './api.js';
import { Icon } from './ui.jsx';

// ==================== AuthAside ====================

// The brand panel on the left of every sign-in and account-setup box.
const FEATURES = [
  { icon: 'tasks', title: 'Tasks and projects', text: 'Keep work moving and every deadline in view.' },
  { icon: 'flag', title: 'Goals and performance', text: 'Clear goals and fair ratings for everyone on the team.' },
  { icon: 'users', title: 'Skills and teams', text: 'Know who does what, and where each person is growing.' },
  { icon: 'pulse', title: 'Burnout insights', text: 'Spot overload early and look after your people.' },
];

function Pulse() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function AuthAside() {
  return (
    <aside className="auth-aside">
      <a className="brand brand-light" href="/" aria-label="Bayyinah home">
        <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
        <span className="brand-word">
          <span className="brand-latin">Bayyinah</span>
          <span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span>
        </span>
      </a>
      <h2>Everything your team needs, in one place.</h2>
      <ul className="auth-features">
        {FEATURES.map((feature, index) => (
          <li key={feature.title} style={{ '--i': index }}>
            <span className="auth-feature-icon">
              {feature.icon === 'pulse' ? <Pulse /> : <Icon name={feature.icon} size={20} />}
            </span>
            <span>
              <strong>{feature.title}</strong>
              <small>{feature.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ==================== Login ====================

function dashboardForRole(role) {
  if (role === 'HR' || role === 'HR Professional') return '/dashboard/hr';
  if (role === 'Manager') return '/dashboard/manager';
  return '/dashboard/employee';
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/accounts/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const login = await responseData(response);
      saveLogin(login);
      window.location.assign(dashboardForRole(login.user.role));
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthAside />
      <section className="auth-card">
        <span className="auth-kicker">Welcome back</span>
        <h1>Good to see you.</h1>
        <p className="auth-description">Log in to continue to your Bayyinah workspace.</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <div className="password-label-row">
            <label htmlFor="login-password">Password</label>
            <a href="/forgot-password">Forgot your password?</a>
          </div>
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-switch">Setting up a new organization? <a href="/setup">Get started</a></p>
      </section>
      <p className="auth-footnote">Secure access for your organization</p>
    </main>
  );
}

// ==================== ForgotPassword ====================

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/accounts/password-reset/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await responseData(response);
      setMessage(result.detail);
    } catch (requestError) {
      setError(requestError.message || 'Unable to request a password reset. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthAside />
      <section className="auth-card">
        <span className="auth-kicker">Account recovery</span>
        <h1>Forgot your password?</h1>
        <p className="auth-description">
          Enter the email address associated with your account. If it is registered,
          we’ll email you a link to reset your password.
        </p>
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label htmlFor="reset-email">Email address</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="auth-switch"><a href="/login">Back to log in</a></p>
      </section>
    </main>
  );
}

// ==================== ResetPassword ====================

export function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/accounts/password-reset/confirm/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token, password }),
      });
      const result = await responseData(response);
      setMessage(result.detail);
      setComplete(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset your password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthAside />
      <section className="auth-card password-card" aria-labelledby="page-title">
        <span className="auth-kicker">Account recovery</span>
        {complete ? (
          <>
            <h1 id="page-title">Password updated</h1>
            <p className="auth-description">{message} You can now sign in with your new password.</p>
            <a className="button button-primary auth-submit password-login-link" href="/login">Go to log in</a>
          </>
        ) : (
          <>
            <h1 id="page-title">Reset your password</h1>
            <p className="auth-description">Choose a new password for your Bayyinah account.</p>
            {(!uid || !token) && (
              <p className="notice error" role="alert">
                This password reset link is incomplete. Request a new link to continue.
              </p>
            )}
            {error && <p className="notice error" role="alert">{error}</p>}
            <form onSubmit={submit}>
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength="8"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="auth-description">Use at least 8 characters, including one uppercase letter and one number. Your new password must differ from your current password.</p>
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
              <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting || !uid || !token}>
                {isSubmitting ? 'Updating…' : 'Reset password'}
              </button>
            </form>
            <p className="auth-switch"><a href="/forgot-password">Request a new reset link</a></p>
          </>
        )}
      </section>
    </main>
  );
}

// ==================== OrgSetup ====================

export function OrgSetup() {
  const [form, setForm] = useState({
    organization_name: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm_password) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/accounts/setup/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_name: form.organization_name,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          password: form.password,
        }),
      });
      const login = await responseData(response);
      saveLogin(login);
      window.location.assign('/dashboard/hr');
    } catch (requestError) {
      setError(requestError.message || 'Organization setup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page setup-page">
      <AuthAside />
      <section className="auth-card setup-card">
        <span className="auth-kicker">Your workspace starts here</span>
        <h1>Set up your organization.</h1>
        <p className="auth-description">
          Create your organization and HR administrator account. You’ll be able to
          add departments and invite your team next.
        </p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label htmlFor="organization-name">Organization name</label>
          <input id="organization-name" type="text" maxLength="255" autoComplete="organization" value={form.organization_name} onChange={(event) => update('organization_name', event.target.value)} required />
          <div className="form-two-columns">
            <div>
              <label htmlFor="admin-first-name">First name</label>
              <input id="admin-first-name" type="text" maxLength="255" autoComplete="given-name" value={form.first_name} onChange={(event) => update('first_name', event.target.value)} required />
            </div>
            <div>
              <label htmlFor="admin-last-name">Last name</label>
              <input id="admin-last-name" type="text" maxLength="255" autoComplete="family-name" value={form.last_name} onChange={(event) => update('last_name', event.target.value)} required />
            </div>
          </div>
          <label htmlFor="admin-email">Work email</label>
          <input id="admin-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required />
          <div className="form-two-columns">
            <div>
              <label htmlFor="setup-password">Create password</label>
              <input id="setup-password" type="password" autoComplete="new-password" minLength="8" value={form.password} onChange={(event) => update('password', event.target.value)} required />
            </div>
            <div>
              <label htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" value={form.confirm_password} onChange={(event) => update('confirm_password', event.target.value)} required />
            </div>
            <p className="auth-description">Use at least 8 characters, including one uppercase letter and one number. Avoid common passwords.</p>
          </div>
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating workspace…' : 'Create organization'}
          </button>
        </form>
        <p className="auth-switch">Already have an account? <a href="/login">Log in</a></p>
      </section>
      <p className="auth-footnote">Your information is handled by your organization’s workspace.</p>
    </main>
  );
}

// ==================== App ====================

function errorMessage(data) {
  if (!data || typeof data !== 'object') {
    return 'We could not set your password. Please try again.';
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }

  const messages = Object.values(data)
    .flat(Infinity)
    .filter((message) => typeof message === 'string');

  return messages.join(' ') || 'We could not set your password. Please try again.';
}

export function SetPassword() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submitPassword(event) {
    event.preventDefault();
    setMessage('');

    if (!uid || !token) {
      setIsError(true);
      setMessage('This invitation link is incomplete. Ask HR to send a new invite.');
      return;
    }

    if (password !== confirmation) {
      setIsError(true);
      setMessage('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/accounts/set-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(data));
      }

      setComplete(true);
    } catch (error) {
      setIsError(true);
      setMessage(error.message || 'Unable to reach Bayyinah. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthAside />
      <section className="auth-card password-card" aria-labelledby="page-title">
        <span className="auth-kicker">Account setup</span>
        {complete ? (
          <>
            <h1 id="page-title">You’re all set</h1>
            <p className="auth-description">
              Your password has been saved. You can now sign in to your Bayyinah account.
            </p>
            <a className="button button-primary auth-submit password-login-link" href="/login">Go to log in</a>
          </>
        ) : (
          <>
            <h1 id="page-title">Set your password</h1>
            <p className="auth-description">
              Choose a password to finish setting up your account.
            </p>
            {!token && (
              <p className="notice error" role="alert">
                This invitation link is incomplete. Ask HR to send a new invite.
              </p>
            )}
            {message && (
              <p className={`notice ${isError ? 'error' : ''}`} role="alert">
                {message}
              </p>
            )}
            <form onSubmit={submitPassword}>
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength="8"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="auth-description">Use at least 8 characters, including one uppercase letter and one number. Avoid common passwords.</p>
              <label htmlFor="confirmation">Confirm password</label>
              <input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
              <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting || !uid || !token}>
                {isSubmitting ? 'Saving password…' : 'Set password'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
