import { Router } from 'express';
import { getBoard, patchTask, postTask, removeTask } from './controllers/taskController.js';
import { addClient } from './events/broadcaster.js';

export const apiRouter = Router();
apiRouter.get('/board', getBoard);
apiRouter.post('/tasks', postTask);
apiRouter.patch('/tasks/:id', patchTask);
apiRouter.delete('/tasks/:id', removeTask);
apiRouter.get('/events', (_req, res) => {
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const remove = addClient(res);
  res.on('close', remove);
});
