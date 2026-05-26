import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to="/walkin/new" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen-center login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img src="/logo.svg" alt="Walk-In" />
        </div>
        <div className="login-copy">
          <p className="eyebrow">Staff Login</p>
          <h1>Welcome Back</h1>
          <p className="muted">Sign in to manage walk-ins, passes, payments, and reception activity.</p>
        </div>
        <label className="login-field">
          <span>Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            placeholder="staff@example.com"
            required
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />
        </label>
        {error ? <div className="status-banner danger">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
