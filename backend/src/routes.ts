import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, login, logout, me, register } from './controllers/authController.js';
import { addMember, connectToBoard, createBoardController, deleteBoardController, deleteMemberController, listBoards, patchBoard, patchMember, presenceHeartbeat, readBoard } from './controllers/boardController.js';
import { getBoard, patchTask, postTask, removeTask } from './controllers/taskController.js';
import { loadBoardAccess, requireEditor, requireOwner } from './middleware/boardAccess.js';
import { optionalAuth, requireAuth, verifyCsrf } from './middleware/auth.js';

export const apiRouter = Router();
const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many registration attempts. Try again later.' } });

apiRouter.use(optionalAuth);
apiRouter.post('/auth/register', registerLimiter, asyncRoute(register));
apiRouter.post('/auth/login', authLimiter, asyncRoute(login));
apiRouter.get('/auth/me', asyncRoute(me));
apiRouter.post('/auth/logout', requireAuth, verifyCsrf, asyncRoute(logout));
apiRouter.post('/auth/change-password', requireAuth, verifyCsrf, asyncRoute(changePassword));

apiRouter.get('/boards', requireAuth, asyncRoute(listBoards));
apiRouter.post('/boards', requireAuth, verifyCsrf, asyncRoute(createBoardController));
apiRouter.get('/boards/:boardId', loadBoardAccess, asyncRoute(readBoard));
apiRouter.patch('/boards/:boardId', requireAuth, loadBoardAccess, requireOwner, verifyCsrf, asyncRoute(patchBoard));
apiRouter.delete('/boards/:boardId', requireAuth, loadBoardAccess, requireOwner, verifyCsrf, asyncRoute(deleteBoardController));
apiRouter.post('/boards/:boardId/members', requireAuth, loadBoardAccess, requireOwner, verifyCsrf, asyncRoute(addMember));
apiRouter.patch('/boards/:boardId/members/:userId', requireAuth, loadBoardAccess, requireOwner, verifyCsrf, asyncRoute(patchMember));
apiRouter.delete('/boards/:boardId/members/:userId', requireAuth, loadBoardAccess, requireOwner, verifyCsrf, asyncRoute(deleteMemberController));
apiRouter.post('/boards/:boardId/presence/heartbeat', requireAuth, verifyCsrf, asyncRoute(presenceHeartbeat));

apiRouter.get('/board', loadBoardAccess, asyncRoute(getBoard));
apiRouter.post('/tasks', loadBoardAccess, requireEditor, verifyCsrf, asyncRoute(postTask));
apiRouter.patch('/tasks/:id', loadBoardAccess, requireEditor, verifyCsrf, asyncRoute(patchTask));
apiRouter.delete('/tasks/:id', loadBoardAccess, requireEditor, verifyCsrf, asyncRoute(removeTask));
apiRouter.get('/events', asyncRoute(connectToBoard));
