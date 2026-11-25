import { useState, type FormEvent } from 'react';
import { AlertCircle, LayoutGrid, LoaderCircle } from 'lucide-react';

export function AuthPage({ mode, onMode, onSubmit, error }: { mode: 'login' | 'register'; onMode: (mode: 'login' | 'register') => void; onSubmit: (username: string, password: string, confirmPassword: string) => Promise<void>; error: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLocalError('');
    if (mode === 'register' && password !== confirmPassword) { setLocalError('Passwords do not match.'); return; }
    setBusy(true);
    try { await onSubmit(username, password, confirmPassword); }
    catch (reason) { setLocalError(reason instanceof Error ? reason.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><LayoutGrid size={18} /></span><strong>Kanban</strong></div><div className="auth-intro"><span className="eyebrow">YOUR WORKSPACE, IN SYNC</span><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p>{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Make an account to create and share boards.'}</p></div><form onSubmit={submit} className="auth-form"><label className="form-field"><span>Username</span><input autoComplete="username" autoFocus minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" placeholder="Your username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label className="form-field"><span>Password</span><input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" minLength={mode === 'login' ? 1 : 12} maxLength={128} placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{mode === 'register' && <label className="form-field"><span>Confirm password</span><input autoComplete="new-password" type="password" minLength={12} maxLength={128} placeholder="Enter your password again" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>}{(localError || error) && <div className="form-error"><AlertCircle size={15} />{localError || error}</div>}<button className="button button-primary auth-submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{mode === 'login' ? 'Sign in' : 'Create account'}</button></form><p className="auth-switch">{mode === 'login' ? 'New here?' : 'Already have an account?'} <button onClick={() => { setLocalError(''); onMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p><p className="auth-note">Forgot your password? Password recovery is not available without email addresses.</p></section></main>;
}
