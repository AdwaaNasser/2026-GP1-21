import { useState } from 'react';
import { responseData } from './api.js';

export default function ResetPassword() {
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
      <a className="brand auth-brand" href="/" aria-label="Bayyinah home">
        <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
        <span>Bayyinah <span className="brand-arabic">بينة</span></span>
      </a>
      <section className="auth-card password-card" aria-labelledby="page-title">
        <span className="auth-kicker">ACCOUNT RECOVERY</span>
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
