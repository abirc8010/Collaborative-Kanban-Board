import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, Trash2, X } from 'lucide-react';
import { STATUSES, type Status, type Task, type TaskDraft } from '../types';

const blankDraft = (status: Status): TaskDraft => ({ title: '', description: '', priority: 'medium', assignee: '', status });
export function TaskModal({ task, initialStatus, onClose, onSave, onDelete }: { task: Task | null; initialStatus: Status; onClose: () => void; onSave: (draft: TaskDraft) => Promise<void>; onDelete?: (task: Task) => Promise<void> }) {
  const [draft, setDraft] = useState<TaskDraft>(task ? { title: task.title, description: task.description, priority: task.priority, assignee: task.assignee, status: task.status } : blankDraft(initialStatus));
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) { setValidation('Add a clear title before saving.'); return; }
    if (!draft.assignee.trim()) { setValidation('Choose an assignee for this task.'); return; }
    setSaving(true); setValidation('');
    try { await onSave({ ...draft, title: draft.title.trim(), assignee: draft.assignee.trim() }); onClose(); }
    catch (error) { setValidation(error instanceof Error ? error.message : 'Could not save this task.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!task || !onDelete) return;
    setDeleting(true); setValidation('');
    try { await onDelete(task); onClose(); } catch (error) { setValidation(error instanceof Error ? error.message : 'Could not delete this task.'); } finally { setDeleting(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><span className="eyebrow">{task ? 'TASK DETAILS' : 'NEW TASK'}</span><h2 id="modal-title">{task ? 'Edit task' : 'Create a task'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>
      <form onSubmit={submit}>
        <label className="form-field"><span>Task title <b>*</b></span><input autoFocus maxLength={120} placeholder="What needs to be done?" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="form-field"><span>Description <small>Optional</small></span><textarea rows={4} maxLength={2000} placeholder="Add context, links, or acceptance criteria..." value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="form-grid">
          <label className="form-field"><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskDraft['priority'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="form-field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <label className="form-field"><span>Assignee <b>*</b></span><input maxLength={80} placeholder="e.g. Maya Chen" value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} /></label>
        {validation && <div className="form-error"><AlertCircle size={15} />{validation}</div>}
        <footer className="modal-footer">{task && <button type="button" className="delete-button" onClick={() => void remove()} disabled={saving || deleting}>{deleting ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Delete</button>}<span className="footer-spacer" /><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || deleting}>{saving && <LoaderCircle className="spin" size={15} />}{task ? 'Save changes' : 'Create task'}</button></footer>
      </form>
    </section>
  </div>;
}
