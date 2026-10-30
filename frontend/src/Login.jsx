import { useState } from 'react';
import AuthAside from './AuthAside.jsx';
import { responseData, saveLogin } from './api.js';

function dashboardForRole(role) {
  if (role === 'HR' || role === 'HR Professional') return '/dashboard/hr';
  if (role === 'Manager') return '/dashboard/manager';
  return '/dashboard/employee';
}

export default function Login() {
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
