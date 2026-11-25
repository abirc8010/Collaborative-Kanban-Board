import { useEffect, useState } from 'react';
import { ArrowUpRight, Circle, LockKeyhole, Plus, Users } from 'lucide-react';
import { api } from '../services/api';
import type { Board, Visibility } from '../types';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
export function BoardDashboard({ username, onOpen, onLogout, onChangePassword }: { username: string; onOpen: (boardId: string) => void; onLogout: () => void; onChangePassword: () => void }) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const load = async () => { setBusy(true); try { setBoards((await api.boards()).boards); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load boards.'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  const mine = boards.filter((board) => board.role === 'owner');
  const shared = boards.filter((board) => board.role !== 'owner');
  const createBoard = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim()) return;
    setCreating(true); setError('');
    try { const result = await api.createBoard(name.trim(), visibility); onOpen(result.board.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create board.'); }
    finally { setCreating(false); }
  };
  const boardCard = (board: Board) => <button key={board.id} className="board-card" onClick={() => onOpen(board.id)}><div className="board-card-top"><span className="board-card-icon"><Circle size={16} /></span><span className={`visibility-pill ${board.visibility}`} aria-label={`${board.visibility} board`}>{board.visibility === 'public' ? 'Public' : 'Private'}</span><ArrowUpRight size={15} className="board-card-arrow" /></div><h3>{board.name}</h3><div className="board-card-meta"><span>Owned by {board.ownerUsername}</span><span className="board-card-members"><Users size={13} />{board.memberCount}</span></div><div className="board-card-bottom"><span>{board.role === 'owner' ? 'Owner' : board.role === 'editor' ? 'Editor' : 'Viewer'}</span><span>{formatDate(board.updatedAt)}</span></div></button>;
  return <main className="dashboard-page"><header className="topbar"><div className="brand topbar-brand"><span className="brand-mark"><Circle size={17} /></span><span>Kanban</span></div><div className="account-menu-wrap"><button className="account-trigger" onClick={() => setMenu((open) => !open)}>{username}<span className="account-initial">{username.slice(0, 1).toUpperCase()}</span></button>{menu && <div className="account-menu"><button onClick={() => { setMenu(false); onChangePassword(); }}>Change password</button><button onClick={onLogout}>Log out</button></div>}</div></header><div className="dashboard-content"><div className="project-heading"><div><div className="eyebrow">YOUR PROJECTS</div><h1>Your boards</h1><p>Keep projects organized, together.</p></div><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Create board</button></div>{error && <div className="error-banner"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}{busy ? <div className="loading-state"><span className="loader" /><span>Loading your boards...</span></div> : <>{mine.length > 0 && <section className="boards-section"><div className="section-heading"><h2>My boards</h2><span>{mine.length}</span></div><div className="boards-grid">{mine.map(boardCard)}</div></section>}{shared.length > 0 && <section className="boards-section"><div className="section-heading"><h2>Shared with me</h2><span>{shared.length}</span></div><div className="boards-grid">{shared.map(boardCard)}</div></section>}{boards.length === 0 && <div className="dashboard-empty"><span className="empty-icon"><LockKeyhole size={20} /></span><strong>No boards yet</strong><span>Create your first board to start organizing tasks.</span><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={15} />Create board</button></div>}</> }</div>{createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="task-modal" role="dialog" aria-modal="true"><header className="modal-header"><div><span className="eyebrow">NEW PROJECT</span><h2>Create a board</h2></div><button className="icon-button" onClick={() => setCreateOpen(false)}>×</button></header><form onSubmit={createBoard}><label className="form-field"><span>Board name</span><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product launch" required /></label><label className="form-field"><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}><option value="private">Private — invited members only</option><option value="public">Public — anyone with the link can view</option></select></label>{error && <div className="form-error">{error}</div>}<footer className="modal-footer"><span className="footer-spacer" /><button type="button" className="button button-quiet" onClick={() => setCreateOpen(false)}>Cancel</button><button className="button button-primary" disabled={creating}>{creating ? 'Creating…' : 'Create board'}</button></footer></form></section></div>}</main>;
}
