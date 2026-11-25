import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Activity, ArrowDownUp, Check, ChevronDown, CircleHelp, Command, LayoutGrid, ListFilter, Plus, Search, SlidersHorizontal, Sparkles, Users, X } from 'lucide-react';
import { BoardColumn } from './components/BoardColumn';
import { TaskCard } from './components/TaskCard';
import { TaskModal } from './components/TaskModal';
import { useBoard } from './hooks/useBoard';
import { filterTasks } from './utils/board';
import { STATUSES, type Status, type Task, type TaskDraft } from './types';

export default function App() {
  const board = useBoard();
  const [modal, setModal] = useState<{ task: Task | null; status: Status } | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const visible = useMemo(() => filterTasks(board.tasks, board.filters), [board.tasks, board.filters]);
  const assignees = useMemo(() => [...new Set(board.tasks.map((task) => task.assignee))].sort(), [board.tasks]);
  const setStatusModal = (status: Status) => setModal({ task: null, status });
  const onDragStart = ({ active }: { active: { id: string | number } }) => setActiveTask(board.tasks.find((task) => task.id === String(active.id)) ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const destination = overId.startsWith('column:') ? overId.slice('column:'.length) as Status : board.tasks.find((task) => task.id === overId)?.status;
    if (destination && STATUSES.includes(destination)) void board.move(activeId, overId, destination).catch(() => undefined);
  };
  const save = async (draft: TaskDraft) => {
    if (modal?.task) await board.update(modal.task, draft);
    else await board.create(draft);
  };
  const filtered = Boolean(board.filters.search || board.filters.priority !== 'all' || board.filters.assignee !== 'all');
  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><LayoutGrid size={18} /></div><span>orbit<span className="brand-period">.</span></span><button className="workspace-switch" aria-label="Switch workspace"><ChevronDown size={14} /></button></div>
      <div className="workspace-card"><div className="workspace-avatar">N</div><div className="workspace-copy"><span>WORKSPACE</span><strong>Northstar Studio</strong></div><ChevronDown size={15} /></div>
      <div className="nav-label">WORKSPACE</div><nav className="side-nav"><button className="nav-item active"><LayoutGrid size={17} />Project board <span className="nav-current">●</span></button><button className="nav-item"><Users size={17} />Team</button><button className="nav-item"><Activity size={17} />Activity</button></nav>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-spark"><Sparkles size={16} /></span><strong>Keep the momentum</strong><p>Small steps add up. Keep your board moving.</p><div className="tip-progress"><i /></div><span className="tip-caption">YOUR TEAM IS MAKING PROGRESS</span></div><button className="nav-item help-link"><CircleHelp size={17} />Help & feedback</button><div className="user-profile"><div className="avatar avatar-0 user-avatar">AB</div><div><strong>Abir</strong><span>Workspace owner</span></div><button aria-label="Account menu"><ChevronDown size={15} /></button></div></div>
    </aside>
    <section className="main-area"><header className="topbar"><div className="breadcrumbs"><span>Projects</span><span className="crumb-slash">/</span><strong>Website redesign</strong><span className="private-pill"><Users size={12} />Shared</span></div><div className="top-actions"><span className={`connection ${board.connected ? 'is-connected' : ''}`}><i />{board.connected ? 'Live' : 'Reconnecting'}</span><button className="icon-button top-help" aria-label="Help"><CircleHelp size={18} /></button><div className="avatar avatar-0 top-avatar">AB</div></div></header>
      <div className="content"><section className="project-heading"><div className="project-heading-copy"><div className="eyebrow"><span className="project-dot" />PRODUCT & DESIGN</div><h1>Website redesign</h1><p>Plan, track, and ship your best work together.</p></div><div className="project-actions"><div className="avatar-stack"><span className="avatar avatar-1">MC</span><span className="avatar avatar-2">LW</span><span className="avatar avatar-3">JT</span><span className="avatar-stack-more">+2</span></div><button className="button button-primary add-task-top" onClick={() => setStatusModal('Backlog')}><Plus size={16} />New task</button><button className="icon-button more-button" aria-label="Project actions"><Command size={17} /></button></div></section>
      {board.error && <div className="error-banner"><span>{board.error}</span><button onClick={() => void board.refresh()}>Retry</button><button className="banner-close" onClick={() => board.setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
      {board.notice && <div className="notice-banner"><span>{board.notice}</span><button onClick={() => board.setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
      <section className="board-toolbar"><div className="board-view"><button className="view-tab selected"><LayoutGrid size={15} />Board</button><button className="view-tab" title="List view coming soon"><ListFilter size={15} />List</button></div><div className="toolbar-controls"><label className="search-box"><Search size={16} /><input placeholder="Search tasks..." value={board.filters.search} onChange={(event) => board.changeFilters({ search: event.target.value })} /><kbd>⌘ K</kbd>{board.filters.search && <button onClick={() => board.changeFilters({ search: '' })} aria-label="Clear search"><X size={13} /></button>}</label><button className={`filter-button ${showFilters || filtered ? 'filter-active' : ''}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={15} />Filters{filtered && <span className="filter-count">{Number(board.filters.priority !== 'all') + Number(board.filters.assignee !== 'all') + Number(Boolean(board.filters.search))}</span>}</button><button className="icon-button sort-button" aria-label="Sort tasks by position" title="Tasks are ordered manually"><ArrowDownUp size={15} /></button></div></section>
      {showFilters && <div className="filter-panel"><div className="filter-select"><label>Priority</label><select value={board.filters.priority} onChange={(event) => board.changeFilters({ priority: event.target.value as typeof board.filters.priority })}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><div className="filter-select"><label>Assignee</label><select value={board.filters.assignee} onChange={(event) => board.changeFilters({ assignee: event.target.value })}><option value="all">All assignees</option>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></div>{filtered && <button className="clear-filters" onClick={() => board.changeFilters({ search: '', priority: 'all', assignee: 'all' })}>Clear filters</button>}<span className="filter-hint">Filters update the board and URL automatically.</span></div>}
      <div className="board-summary"><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}{filtered ? ' found' : ' in this project'}</span><span className="summary-divider" /><span>Updated just now</span><span className="summary-spacer" /><span className="board-private"><Check size={13} />Changes sync live</span></div>
      {board.loading && !board.tasks.length ? <div className="loading-state"><span className="loader" /><span>Getting your board ready...</span></div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}><div className="board-scroll"><div className="board-grid">{STATUSES.map((status) => <BoardColumn key={status} status={status} tasks={visible.filter((task) => task.status === status)} onAdd={setStatusModal} onOpen={(task) => setModal({ task, status: task.status })} />)}</div></div><DragOverlay>{activeTask ? <TaskCard task={activeTask} onOpen={() => undefined} dragDisabled /> : null}</DragOverlay></DndContext>}
      {filtered && visible.length === 0 && !board.loading && <div className="no-results"><div className="no-results-icon"><Search size={21} /></div><strong>No tasks match these filters</strong><span>Try adjusting your search or clearing one of the filters.</span><button className="button button-quiet" onClick={() => board.changeFilters({ search: '', priority: 'all', assignee: 'all' })}>Clear filters</button></div>}
      <footer className="board-footer"><span><span className={`live-dot ${board.connected ? '' : 'sync-offline'}`} />{board.error ? 'Board sync unavailable' : board.connected ? 'All changes saved' : 'Waiting for connection'}</span><span>{board.connected ? 'Live updates on' : 'Reconnects automatically'}</span></footer>
      </div>
    </section>
    {modal && <TaskModal key={modal.task?.id ?? `new-${modal.status}`} task={modal.task} initialStatus={modal.status} onClose={() => setModal(null)} onSave={save} onDelete={modal.task ? (task) => board.remove(task) : undefined} />}
  </main>;
}
