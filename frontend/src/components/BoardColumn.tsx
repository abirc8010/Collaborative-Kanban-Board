import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Circle, CircleCheck, CircleDashed, CircleDot, Plus } from 'lucide-react';
import type { Status, Task } from '../types';
import { TaskCard } from './TaskCard';

const icons = { Backlog: CircleDashed, Todo: Circle, 'In Progress': CircleDot, Done: CircleCheck };
const iconClasses = { Backlog: 'status-backlog', Todo: 'status-todo', 'In Progress': 'status-progress', Done: 'status-done' };
export function BoardColumn({ status, tasks, onAdd, onOpen, dragDisabled = false }: { status: Status; tasks: Task[]; onAdd: (status: Status) => void; onOpen: (task: Task) => void; dragDisabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const Icon = icons[status];
  return <section ref={setNodeRef} className={`board-column ${isOver ? 'column-over' : ''}`} aria-label={`${status} column`}>
    <div className="column-heading">
      <div className="column-title"><Icon size={17} className={iconClasses[status]} /><h2>{status}</h2><span className="task-count">{tasks.length}</span></div>
      <button className="icon-button column-menu" aria-label={`Add task to ${status}`} onClick={() => onAdd(status)}><Plus size={17} /></button>
    </div>
    <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      <div className="column-list">
        {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpen} dragDisabled={dragDisabled} />) : dragDisabled ? <div className="empty-filtered" /> : <div className="empty-column"><span className="empty-icon"><Icon size={19} /></span><strong>Nothing here yet</strong><span>Drop a task here or add one to get started.</span><button onClick={() => onAdd(status)}><Plus size={15} /> Add a task</button></div>}
      </div>
    </SortableContext>
  </section>;
}
