import { useState } from 'react';
import AuthAside from './AuthAside.jsx';
import { responseData } from './api.js';

export default function ForgotPassword() {
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
