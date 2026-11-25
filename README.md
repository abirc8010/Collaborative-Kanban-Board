# Kanban Board

A real-time shared Kanban board for planning and shipping work. The app includes a responsive four-column board, task CRUD, drag-and-drop ordering, combined search and filters, URL-persisted view state, optimistic mutation handling, MongoDB persistence, and native Server-Sent Events (SSE) collaboration.

## Features

- Exactly four ordered columns: Backlog, Todo, In Progress, Done.
- Create, edit, move, reorder, and delete tasks with title, description, priority, assignee, status, position, and ISO `updatedAt`.
- dnd-kit drag-and-drop across columns and within a column.
- Case-insensitive title search combined with priority and assignee filters; filters are reflected in query parameters and restored on refresh/back/forward.
- Immediate optimistic UI updates with targeted rollback on failed requests.
- Shared-board updates over native SSE, including affected positions for reorders, mutation IDs, pending-task event buffering, and API resynchronization after reconnect.
- MongoDB-backed persistence, startup sample data only when the collection is empty, health endpoint, validation, and deployment configuration.
- Optional deterministic API failure simulation in development for rollback checks.
- Dragging is disabled while filters are active so a partial view cannot corrupt persisted task positions.

## Technology

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, dnd-kit, Lucide React.
- Backend: Node.js, Express, TypeScript, Mongoose, Zod, native SSE.
- Database: MongoDB (Atlas M0 compatible).
- Hosting: Vercel (frontend) and Render (API).

## Architecture

The frontend is a Vite app under `frontend/`. `useBoard` owns board loading, URL state, optimistic mutations, per-task mutation versions, SSE event buffering, event deduplication, and reconnect resynchronization. UI components remain separate for the board columns, cards, and task modal. The API client is isolated in `frontend/src/services/api.ts`. The interface intentionally has no login, workspace, team, activity, profile, or fake collaborator controls.

The API lives under `backend/`: Express routes call controllers, controllers validate requests and delegate to the task service, Mongoose models represent persisted tasks, and an in-process broadcaster manages SSE clients. Mutating operations are serialized within the single API process; ordering changes return and broadcast all affected tasks with canonical timestamps. The server startup seed runs only if the task collection is empty. This intentionally avoids additional infrastructure for a single shared board and one backend instance.

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── controllers/       # Request handling and JSON errors
│   │   ├── events/            # SSE client registry and broadcaster
│   │   ├── models/            # Mongoose Task schema and domain types
│   │   ├── services/          # Persistence, ordering, seed-on-empty
│   │   ├── validation/        # Zod request schemas
│   │   ├── app.ts             # Express middleware and health route
│   │   ├── routes.ts
│   │   └── server.ts
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/        # Board column, card, task modal
│   │   ├── hooks/useBoard.ts  # Board state, optimistic CRUD, SSE, URL state
│   │   ├── services/api.ts
│   │   ├── utils/             # Ordering, filtering, query-state utilities
│   │   ├── App.tsx
│   │   └── styles.css
│   └── .env.example
├── package.json              # npm workspaces and root scripts
├── render.yaml
└── vercel.json
```

## Local installation

Requirements: Node.js 20+ and npm 10+, plus a reachable MongoDB instance.

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`. Set `CLIENT_ORIGIN=http://localhost:5173` for local development.
2. Copy `frontend/.env.example` to `frontend/.env`. The default API URL is `http://localhost:4000`.
3. From the repository root, install once with `npm install`.
4. Start both applications with `npm run dev`.
5. Open `http://localhost:5173`. The API listens on `http://localhost:4000`.

The API intentionally refuses to start without `MONGODB_URI`; frontend static fallback data is not used. If the task collection is empty on initial API connection, five starter tasks are inserted. Existing records are never replaced.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | API port; defaults to `4000` locally. Render supplies its own port. |
| `MONGODB_URI` | Yes | MongoDB connection string. Keep this only in the backend environment. |
| `CLIENT_ORIGIN` | No locally; required for deployment | Comma-separated exact allowed browser origins; defaults to `http://localhost:5173`. Set the exact Vercel origin in Render. |
| `SIMULATE_API_FAILURE` | No | Set `true` to force mutation failures in non-production only. Disabled by default. |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Required for deployment | Backend origin without `/api`. Development defaults to `http://localhost:4000`; production has no localhost fallback and shows a configuration error if unset. This is public configuration, never a secret. |

Do not commit `.env` files. `.gitignore` excludes them.

## MongoDB Atlas setup

1. Create a MongoDB Atlas account and an M0 free cluster.
2. Create a database user with a strong password and grant only the needed database access.
3. Add your development IP address to Network Access. For Render, allow the Render service's outbound IP ranges or use Atlas's broader access rule only if you understand the security tradeoff.
4. Select **Connect → Drivers**, copy the Node.js connection URI, replace the username/password/database placeholders, and put the result in `backend/.env` as `MONGODB_URI`.
5. Never add this URI to a `VITE_` variable or commit it.

## Run and verify

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

`SIMULATE_API_FAILURE=true` in the backend environment forces mutation requests to return 503 in development so the optimistic rollback path can be exercised. It has no effect when `NODE_ENV=production`.

Automated tests cover request validation, structured API errors, malformed IDs, health-check behavior, filter composition, position normalization, status ordering, and URL serialization. Database persistence, real failure rollback, and two-session SSE require an external MongoDB connection and browser sessions; see the acceptance checklist.

## API

All paths are rooted at `/api` and return JSON errors in the form `{ "error": "...", "details": [...] }` where validation details apply.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/board` | Returns `{ tasks }`, grouped in Backlog, Todo, In Progress, Done order and ordered by position within each status. |
| `POST` | `/api/tasks` | Creates a validated task; server assigns ID, position, and timestamp. Optional `mutationId` is echoed in SSE. |
| `PATCH` | `/api/tasks/:id` | Updates task fields; status/position changes reindex affected columns. Returns `{ task, affectedTasks }`. |
| `DELETE` | `/api/tasks/:id` | Deletes a task and reindexes its column. Optional JSON body `{ "mutationId": "..." }`; returns `{ deletedId, deletedAt, affectedTasks }`. |
| `GET` | `/api/events` | Native SSE stream with `task-created`, `task-updated`, and `task-deleted` named events plus heartbeats. |
| `GET` | `/api/health` | Render health check; API only starts after MongoDB connects. |

Task input limits: title 1–120 characters, description up to 2,000 characters, assignee 1–80 characters. Priority is `low`, `medium`, or `high`; status is one of the four board columns.

## Collaboration and consistency

A browser opens one `EventSource` connection. The API broadcaster writes named events with event IDs to connected clients and removes a client when its response closes; heartbeat comments keep idle streams alive. The browser reconnects automatically. On every connection after the first, the app reloads the board from the API to recover events missed while offline. The merge protects newer in-memory updates and pending local tasks from an older in-flight snapshot; deletion tombstones prevent stale snapshots from resurrecting deleted tasks.

Every client mutation receives a UUID `mutationId`, sent in its API body and emitted with the matching SSE event. Own echoes are buffered until the HTTP outcome is known, deduplicated, then discarded on success or applied if the response fails after the server may have committed. During pending changes, events that touch the same task/column task set are buffered. Successful API responses reconcile canonical records only for tasks not superseded by a newer local mutation, after which buffered remote events are applied by `updatedAt`. A failed request restores only task IDs whose local mutation version is still current, then applies buffered remote events. This prevents a failed operation from reverting later local edits or remote changes.

Reorders are serialized by a small in-process mutation queue and broadcast all task positions in the affected columns. MongoDB remains the source of truth. This queue is appropriate for the assignment's single API instance; it is not a distributed lock for horizontally scaled instances.


## Coding agents used

- GitHub Copilot (implementation, code review, and verification).
- Explore subagent (read-only repository audit).
