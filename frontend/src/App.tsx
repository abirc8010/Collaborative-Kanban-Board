import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { LayoutGrid, Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { BoardColumn } from './components/BoardColumn';
import { TaskCard } from './components/TaskCard';
import { TaskModal } from './components/TaskModal';
import { AuthPage } from './components/AuthPage';
import { BoardDashboard } from './components/BoardDashboard';
import { useBoard } from './hooks/useBoard';
import { api, setCsrfToken } from './services/api';
import { filterTasks } from './utils/board';
import { STATUSES, type Board, type Status, type Task, type TaskDraft, type User } from './types';

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'error'>('checking');
  const [user, setUser] = useState<User | null>(null);
  const authInitialized = useRef(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [boardId, setBoardId] = useState(() => new URLSearchParams(location.search).get('board') ?? '');

  useEffect(() => {
    if (authInitialized.current) return;
    authInitialized.current = true;
    if (import.meta.env.DEV) console.debug('[AUTH] initialization started');
    void api.authMe()
      .then((result) => {
        setUser(result.user); setCsrfToken(result.csrfToken); setAuthState('authenticated');
        if (import.meta.env.DEV) console.debug('[AUTH] authenticated', result.user.username);
      })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : 'Authentication check failed';
        if (message.includes('401') || message.toLowerCase().includes('authentication required')) {
          setUser(null); setCsrfToken(''); setAuthState('unauthenticated');
        } else {
          setUser(null); setAuthState('error'); setAuthError(message);
        }
        if (import.meta.env.DEV) console.debug('[AUTH] initialization result', message);
      });
  }, []);
  useEffect(() => {
    const onPop = () => setBoardId(new URLSearchParams(location.search).get('board') ?? '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openBoard = useCallback((id: string) => {
    const url = new URL(location.href); url.searchParams.set('board', id); history.pushState({}, '', url);
    setBoardId(id);
  }, []);
  const dashboard = useCallback(() => {
    const url = new URL(location.href); url.searchParams.delete('board'); history.pushState({}, '', url); setBoardId('');
  }, []);
  const authenticate = async (username: string, password: string, confirmPassword: string) => {
    setAuthError('');
    const result = authMode === 'register' ? await api.register(username, password, confirmPassword) : await api.login(username, password);
    setCsrfToken(result.csrfToken); setUser(result.user); setAuthState('authenticated');
  };
  const logout = useCallback(async () => { await api.logout().catch(() => undefined); setUser(null); setCsrfToken(''); setBoardId(''); setAuthState('unauthenticated'); }, []);
  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? ''); const newPassword = String(form.get('newPassword') ?? ''); const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordBusy(true); setPasswordError('');
    try { await api.changePassword(currentPassword, newPassword); setPasswordOpen(false); }
    catch (reason) { setPasswordError(reason instanceof Error ? reason.message : 'Could not change password.'); }
    finally { setPasswordBusy(false); }
  };

  if (authState === 'checking') return <main className="dashboard-page"><div className="loading-state"><span className="loader" /><span>Loading...</span></div></main>;
  if (authState === 'error') return <main className="dashboard-page"><section className="error-banner"><span>{authError}</span><button onClick={() => window.location.reload()}>Retry</button></section></main>;
  if (authState === 'unauthenticated' || (!user && !boardId)) return <AuthPage mode={authMode} onMode={(mode) => { setAuthMode(mode); setAuthError(''); }} onSubmit={authenticate} error={authError} />;
  if (user && !boardId) return <><BoardDashboard username={user.username} onOpen={openBoard} onLogout={() => void logout()} onChangePassword={() => setPasswordOpen(true)} />{passwordOpen && <div className="modal-backdrop"><section className="task-modal"><header className="modal-header"><div><span className="eyebrow">SECURITY</span><h2>Change password</h2></div><button className="icon-button" onClick={() => setPasswordOpen(false)}><X size={18} /></button></header><form className="auth-form" onSubmit={changePassword}><label className="form-field"><span>Current password</span><input name="currentPassword" type="password" required /></label><label className="form-field"><span>New password</span><input name="newPassword" type="password" minLength={12} maxLength={128} required /></label><label className="form-field"><span>Confirm new password</span><input name="confirmPassword" type="password" minLength={12} maxLength={128} required /></label>{passwordError && <div className="form-error">{passwordError}</div>}<button className="button button-primary" disabled={passwordBusy}>Change password</button></form></section></div>}</>;
  return <><BoardView key={boardId} boardId={boardId} onDashboard={dashboard} onAccessRevoked={dashboard} />{passwordOpen && <div className="modal-backdrop"><section className="task-modal"><header className="modal-header"><div><span className="eyebrow">SECURITY</span><h2>Change password</h2></div><button className="icon-button" onClick={() => setPasswordOpen(false)}><X size={18} /></button></header><form className="auth-form" onSubmit={changePassword}><label className="form-field"><span>Current password</span><input name="currentPassword" type="password" required /></label><label className="form-field"><span>New password</span><input name="newPassword" type="password" minLength={12} maxLength={128} required /></label><label className="form-field"><span>Confirm new password</span><input name="confirmPassword" type="password" minLength={12} maxLength={128} required /></label>{passwordError && <div className="form-error">{passwordError}</div>}<button className="button button-primary" disabled={passwordBusy}>Change password</button></form></section></div>}</>;
}

function BoardView({ boardId, onDashboard, onAccessRevoked }: { boardId: string; onDashboard: () => void; onAccessRevoked: () => void }) {
  useEffect(() => { if (import.meta.env.DEV) console.debug('[BOARD] mount', boardId); return () => { if (import.meta.env.DEV) console.debug('[BOARD] unmount', boardId); }; }, [boardId]);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareName, setShareName] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareError, setShareError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardName, setBoardName] = useState('');
  const loadBoard = useCallback(async () => {
    if (import.meta.env.DEV) console.debug('[BOARD] fetch start', boardId);
    try {
      const result = await api.getBoard(boardId);
      setBoard((current) => current?.id === result.board.id ? { ...current, ...result.board } : result.board);
      setBoardName(result.board.name); setBoardError('');
      if (import.meta.env.DEV) console.debug('[BOARD] fetch success', boardId);
    } catch (reason) {
      setBoardError(reason instanceof Error ? reason.message : 'Could not load board.');
    }
  }, [boardId]);
  useEffect(() => { void loadBoard(); }, [loadBoard]);
  const canEdit = board?.role === 'owner' || board?.role === 'editor';
  const boardState = useBoard(boardId, '', Boolean(canEdit), onAccessRevoked, loadBoard);
  const [modal, setModal] = useState<{ task: Task | null; status: Status } | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }));
  const visible = useMemo(() => filterTasks(boardState.tasks, boardState.filters), [boardState.tasks, boardState.filters]);
  const assignees = useMemo(() => [...new Set(boardState.tasks.map((task) => task.assignee))].sort(), [boardState.tasks]);
  const filtered = Boolean(boardState.filters.search || boardState.filters.priority !== 'all' || boardState.filters.assignee !== 'all');
  const setStatusModal = (status: Status) => setModal({ task: null, status });
  const onDragEnd = ({ active, over }: DragEndEvent) => { setActiveTask(null); if (!over) return; const activeId = String(active.id); const overId = String(over.id); const destination = overId.startsWith('column:') ? overId.slice('column:'.length) as Status : boardState.tasks.find((task) => task.id === overId)?.status; if (destination && STATUSES.includes(destination)) void boardState.move(activeId, overId, destination).catch(() => undefined); };
  const save = async (draft: TaskDraft) => { if (modal?.task) await boardState.update(modal.task, draft); else await boardState.create(draft); };
  const clearFilters = () => boardState.changeFilters({ search: '', priority: 'all', assignee: 'all' });
  const share = async (event: React.FormEvent) => { event.preventDefault(); setShareBusy(true); setShareError(''); try { const result = await api.addMember(boardId, shareName.trim(), shareRole); setBoard(result.board); setShareName(''); } catch (reason) { setShareError(reason instanceof Error ? reason.message : 'Could not share board.'); } finally { setShareBusy(false); } };

  if (boardError && !board) return <main className="dashboard-page"><div className="error-banner"><span>{boardError}</span><button onClick={onDashboard}>Back to boards</button></div></main>;
  return <main className="app-shell"><section className="main-area"><header className="topbar"><button className="brand topbar-brand" onClick={onDashboard}><div className="brand-mark"><LayoutGrid size={17} /></div><span>Kanban</span></button><span className={`connection ${boardState.connected ? 'is-connected' : ''}`}><i />{boardState.connected ? 'Live updates' : 'Reconnecting'}</span></header>
    <div className="content"><section className="project-heading"><div className="project-heading-copy"><div className="eyebrow"><span className="project-dot" />PROJECT BOARD</div><h1>{board?.name ?? 'Loading board'}</h1><p>{board?.visibility === 'public' ? 'Public board' : 'Private board'}{canEdit ? '' : ' — read only'}</p></div><div className="board-header-actions">{boardState.presence.length > 0 && <div className="avatar-stack" title={`${boardState.presence.map((person) => person.username).join(', ')}`}>{boardState.presence.slice(0, 5).map((person) => <span key={person.userId} className="presence-avatar" title={person.username}>{person.username.slice(0, 1).toUpperCase()}</span>)}</div>}{board?.role === 'owner' && <><button className="button button-quiet" onClick={() => setSettingsOpen(true)}>Board settings</button><button className="button button-quiet" onClick={() => setShareOpen(true)}><Users size={16} />Share</button></>}{canEdit && <button className="button button-primary add-task-top" onClick={() => setStatusModal('Backlog')}><Plus size={16} />New task</button>}</div></section>
    {boardState.error && <div className="error-banner"><span>{boardState.error}</span><button onClick={() => void boardState.refresh()}>Retry</button><button className="banner-close" onClick={() => boardState.setError('')}><X size={16} /></button></div>}{boardState.notice && <div className="notice-banner"><span>{boardState.notice}</span><button onClick={() => boardState.setNotice('')}><X size={15} /></button></div>}
    <section className="board-toolbar"><div className="toolbar-controls"><label className="search-box"><Search size={16} /><input placeholder="Search tasks..." value={boardState.filters.search} onChange={(event) => boardState.changeFilters({ search: event.target.value })} /></label><button className={`filter-button ${showFilters || filtered ? 'filter-active' : ''}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={15} />Filters</button></div></section>
    {showFilters && <div className="filter-panel"><div className="filter-select"><label>Priority</label><select value={boardState.filters.priority} onChange={(event) => boardState.changeFilters({ priority: event.target.value as typeof boardState.filters.priority })}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><div className="filter-select"><label>Assignee</label><select value={boardState.filters.assignee} onChange={(event) => boardState.changeFilters({ assignee: event.target.value })}><option value="all">All assignees</option>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></div>{filtered && <button className="clear-filters" onClick={clearFilters}>Clear filters</button>}</div>}
    {boardState.loading && !boardState.tasks.length ? <div className="loading-state"><span className="loader" /><span>Loading tasks...</span></div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setActiveTask(boardState.tasks.find((task) => task.id === String(active.id)) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}><div className="board-scroll"><div className="board-grid">{STATUSES.map((status) => <BoardColumn key={status} status={status} tasks={visible.filter((task) => task.status === status)} dragDisabled={filtered || !canEdit} readOnly={!canEdit} onAdd={setStatusModal} onOpen={(task) => setModal({ task, status: task.status })} />)}</div></div><DragOverlay>{activeTask ? <TaskCard task={activeTask} onOpen={() => undefined} dragDisabled /> : null}</DragOverlay></DndContext>}
    </div></section>{modal && <TaskModal key={modal.task?.id ?? `new-${modal.status}`} task={modal.task} initialStatus={modal.status} readOnly={!canEdit} onClose={() => setModal(null)} onSave={save} onDelete={canEdit && modal.task ? (task) => boardState.remove(task) : undefined} />}
    {settingsOpen && <div className="modal-backdrop"><section className="task-modal"><header className="modal-header"><div><span className="eyebrow">BOARD SETTINGS</span><h2>Manage board</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header><div className="share-form"><label className="form-field"><span>Board name</span><input value={boardName} maxLength={80} onChange={(event) => setBoardName(event.target.value)} /></label><div className="form-grid"><button className="button button-primary" onClick={async () => { try { const result = await api.updateBoard(boardId, { name: boardName.trim(), ...(board?.visibility ? { visibility: board.visibility } : {}) }); setBoard(result.board); } catch (reason) { setBoardError(reason instanceof Error ? reason.message : 'Could not rename board.'); } }}>Save name</button><button className="button button-quiet" onClick={async () => { if (!board) return; try { const result = await api.updateBoard(boardId, { visibility: board.visibility === 'public' ? 'private' : 'public' }); setBoard(result.board); } catch (reason) { setBoardError(reason instanceof Error ? reason.message : 'Could not change visibility.'); } }}>{board?.visibility === 'public' ? 'Make private' : 'Make public'}</button></div><button className="delete-button" onClick={async () => { if (!confirm('Delete this board and all of its tasks?')) return; try { await api.deleteBoard(boardId); setSettingsOpen(false); onDashboard(); } catch (reason) { setBoardError(reason instanceof Error ? reason.message : 'Could not delete board.'); } }}>Delete board</button></div></section></div>}
    {shareOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false); }}><section className="task-modal share-modal"><header className="modal-header"><div><span className="eyebrow">BOARD ACCESS</span><h2>Share board</h2></div><button className="icon-button" onClick={() => setShareOpen(false)}><X size={18} /></button></header><form onSubmit={share} className="share-form"><div className="form-grid"><label className="form-field"><span>Username</span><input value={shareName} onChange={(event) => setShareName(event.target.value)} minLength={3} maxLength={30} required /></label><label className="form-field"><span>Permission</span><select value={shareRole} onChange={(event) => setShareRole(event.target.value as 'viewer' | 'editor')}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label></div>{shareError && <div className="form-error">{shareError}</div>}<button className="button button-primary" disabled={shareBusy}>Share</button></form><div className="member-list">{board?.members.map((member) => <div className="member-row" key={member.userId}><span className="presence-avatar">{member.username.slice(0,1).toUpperCase()}</span><strong>{member.username}</strong><select value={member.role} onChange={(event) => void api.updateMember(boardId, member.userId, event.target.value as 'viewer' | 'editor').then((result) => setBoard(result.board)).catch((reason) => setShareError(reason instanceof Error ? reason.message : 'Could not update member.') )}><option value="viewer">Viewer</option><option value="editor">Editor</option></select><button className="delete-button" onClick={() => void api.removeMember(boardId, member.userId).then((result) => setBoard(result.board)).catch((reason) => setShareError(reason instanceof Error ? reason.message : 'Could not revoke access.'))}>Remove</button></div>)}</div></section></div>}
  </main>;
}
