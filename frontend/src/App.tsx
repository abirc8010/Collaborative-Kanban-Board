import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { LayoutGrid, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }));
  const visible = useMemo(() => filterTasks(board.tasks, board.filters), [board.tasks, board.filters]);
  const assignees = useMemo(() => [...new Set(board.tasks.map((task) => task.assignee))].sort(), [board.tasks]);
  const filtered = Boolean(board.filters.search || board.filters.priority !== 'all' || board.filters.assignee !== 'all');
  const setStatusModal = (status: Status) => setModal({ task: null, status });

  const onDragStart = ({ active }: { active: { id: string | number } }) => {
    setActiveTask(board.tasks.find((task) => task.id === String(active.id)) ?? null);
  };
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
  const clearFilters = () => board.changeFilters({ search: '', priority: 'all', assignee: 'all' });

  return <main className="app-shell">
    <section className="main-area">
      <header className="topbar"><div className="brand topbar-brand"><div className="brand-mark"><LayoutGrid size={17} /></div><span>Kanban</span></div><span className={`connection ${board.connected ? 'is-connected' : ''}`}><i />{board.connected ? 'Live updates' : 'Reconnecting'}</span></header>
      <div className="content">
        <section className="project-heading"><div className="project-heading-copy"><div className="eyebrow"><span className="project-dot" />PROJECT BOARD</div><h1>Kanban board</h1><p>Organize tasks and keep work moving.</p></div><button className="button button-primary add-task-top" onClick={() => setStatusModal('Backlog')}><Plus size={16} />New task</button></section>
        {board.error && <div className="error-banner"><span>{board.error}</span><button onClick={() => void board.refresh()}>Retry</button><button className="banner-close" onClick={() => board.setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {board.notice && <div className="notice-banner"><span>{board.notice}</span><button onClick={() => board.setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
        <section className="board-toolbar"><div className="toolbar-controls"><label className="search-box"><Search size={16} /><input placeholder="Search tasks..." value={board.filters.search} onChange={(event) => board.changeFilters({ search: event.target.value })} />{board.filters.search && <button onClick={() => board.changeFilters({ search: '' })} aria-label="Clear search"><X size={13} /></button>}</label><button className={`filter-button ${showFilters || filtered ? 'filter-active' : ''}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={15} />Filters{filtered && <span className="filter-count">{Number(board.filters.priority !== 'all') + Number(board.filters.assignee !== 'all') + Number(Boolean(board.filters.search))}</span>}</button></div></section>
        {showFilters && <div className="filter-panel"><div className="filter-select"><label>Priority</label><select value={board.filters.priority} onChange={(event) => board.changeFilters({ priority: event.target.value as typeof board.filters.priority })}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><div className="filter-select"><label>Assignee</label><select value={board.filters.assignee} onChange={(event) => board.changeFilters({ assignee: event.target.value })}><option value="all">All assignees</option>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></div>{filtered && <button className="clear-filters" onClick={clearFilters}>Clear filters</button>}<span className="filter-hint">{filtered ? 'Clear filters to reorder tasks.' : 'Search and filters are saved in the URL.'}</span></div>}
        <div className="board-summary"><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}{filtered ? ' shown' : ' on this board'}</span><span className="summary-spacer" /><span className="board-private">{board.connected ? 'Changes sync live' : 'Changes save when connected'}</span></div>
        {board.loading && !board.tasks.length ? <div className="loading-state"><span className="loader" /><span>Loading your board...</span></div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}><div className="board-scroll"><div className="board-grid">{STATUSES.map((status) => <BoardColumn key={status} status={status} tasks={visible.filter((task) => task.status === status)} dragDisabled={filtered} onAdd={setStatusModal} onOpen={(task) => setModal({ task, status: task.status })} />)}</div></div><DragOverlay>{activeTask ? <TaskCard task={activeTask} onOpen={() => undefined} dragDisabled /> : null}</DragOverlay></DndContext>}
        {filtered && visible.length === 0 && !board.loading && <div className="no-results"><div className="no-results-icon"><Search size={21} /></div><strong>No tasks match these filters</strong><span>Try adjusting your search or clearing a filter.</span><button className="button button-quiet" onClick={clearFilters}>Clear filters</button></div>}
        <footer className="board-footer"><span><span className={`live-dot ${board.connected ? '' : 'sync-offline'}`} />{board.error ? 'Board sync unavailable' : board.connected ? 'All changes saved' : 'Waiting for connection'}</span><span>{board.connected ? 'Live updates on' : 'Reconnects automatically'}</span></footer>
      </div>
    </section>
    {modal && <TaskModal key={modal.task?.id ?? `new-${modal.status}`} task={modal.task} initialStatus={modal.status} onClose={() => setModal(null)} onSave={save} onDelete={modal.task ? (task) => board.remove(task) : undefined} />}
  </main>;
}
