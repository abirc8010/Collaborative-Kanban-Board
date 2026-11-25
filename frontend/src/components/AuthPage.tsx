import { useState, type FormEvent } from 'react';
import { AlertCircle, LayoutGrid, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';

export function AuthPage({
  mode,
  onMode,
  onSubmit,
  error,
}: {
  mode: 'login' | 'register';
  onMode: (mode: 'login' | 'register') => void;
  onSubmit: (username: string, password: string, confirmPassword: string) => Promise<void>;
  error: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    if (mode === 'register' && password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(username, password, confirmPassword);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-brand auth-brand-large">
          <span className="brand-mark"><LayoutGrid size={20} /></span>
          <strong>Kanban</strong>
        </div>
        <div className="auth-visual-copy">
          <span className="auth-kicker"><Sparkles size={14} /> Plan together</span>
          <h2>Turn plans into progress.</h2>
          <p>Create boards, share work with your team, and keep every task moving.</p>
        </div>
        <div className="auth-preview">
          <div className="preview-top"><span /><span /><span /></div>
          <div className="preview-columns">
            <div><small>Backlog</small><i /><i /></div>
            <div><small>In progress</small><i /><i /></div>
            <div><small>Done</small><i /></div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark"><LayoutGrid size={18} /></span>
            <strong>Kanban</strong>
          </div>
          <div className="auth-intro">
            <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</span>
            <h1>{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</h1>
            <p>{mode === 'login' ? 'Continue where you left off.' : 'Use a username and password to start organizing work.'}</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label className="form-field">
              <span>Username</span>
              <input
                autoComplete="username"
                autoFocus
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_\-]+"
                placeholder="Your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <div className="password-field"><LockKeyhole size={16} /><input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                type="password"
                minLength={mode === 'login' ? 1 : 12}
                maxLength={128}
                placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              /></div>
            </label>
            {mode === 'register' && (
              <label className="form-field">
                <span>Confirm password</span>
                <div className="password-field"><LockKeyhole size={16} /><input
                  autoComplete="new-password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  placeholder="Enter your password again"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                /></div>
              </label>
            )}

            {(localError || error) && (
              <div className="form-error"><AlertCircle size={15} />{localError || error}</div>
            )}

            <button className="button button-primary auth-submit" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={16} />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? 'New to Kanban?' : 'Already have an account?'}{' '}
            <button onClick={() => {
              setLocalError('');
              onMode(mode === 'login' ? 'register' : 'login');
            }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
