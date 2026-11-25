import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, GripVertical, MessageSquareText } from 'lucide-react';
import type { Task } from '../types';

function timeAgo(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TaskCard({ task, onOpen, dragDisabled = false }: { task: Task; onOpen: (task: Task) => void; dragDisabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: dragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const initials = task.assignee.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <article ref={setNodeRef} style={style} className="task-card" onClick={() => onOpen(task)}>
    <div className="task-card-top">
      <span className={`priority-badge priority-${task.priority}`}><i />{task.priority}</span>
      <button className="drag-handle" aria-label={`Drag ${task.title}`} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}><GripVertical size={16} /></button>
    </div>
    <h3>{task.title}</h3>
    {task.description && <p className="task-description">{task.description}</p>}
    <div className="task-card-footer">
      <div className="assignee"><span className={`avatar avatar-${(task.assignee.charCodeAt(0) || 0) % 5}`}>{initials}</span><span>{task.assignee}</span></div>
      <div className="task-meta"><span title={`Updated ${new Date(task.updatedAt).toLocaleString()}`}><CalendarDays size={13} />{timeAgo(task.updatedAt)}</span>{task.description && <span title="Has description"><MessageSquareText size={13} /></span>}</div>
    </div>
  </article>;
}
