# Collaborative Kanban

A multi-user Kanban application built with React/Vite, Express/TypeScript, MongoDB, and native Server-Sent Events.

## Features

- Username/password accounts (no email), Argon2id password hashing, opaque hashed server-side sessions, 7-day expiration, logout, password change, and CSRF validation.
- Multiple boards; board ownership; public/private visibility; username sharing; Viewer and Editor roles.
- Four fixed columns: Backlog, Todo, In Progress, Done.
- Task search, priority and assignee filters, drag-and-drop, optimistic updates and rollback, mutation reconciliation, and SSE resynchronization.
- Board-specific live presence for authenticated users, with deduplicated usernames across tabs and 75-second heartbeat leases.
- Safe legacy task migration to a private board owned by the first registered account.

## Local setup

Requirements: Node.js 20+, npm 10+, MongoDB.

```sh
npm install
cp backend/.env.example backend/.env
npm run dev
```

Frontend: `http://localhost:5173`. API: `http://localhost:4000`. Vite proxies `/api` to the local API target.

Forgotten passwords cannot be recovered automatically because accounts do not contain email addresses.

## Environment

### Render backend

| Variable | Required | Value |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `CLIENT_ORIGIN` | Yes | Exact Vercel origin, for example `https://your-app.vercel.app` |
| `NODE_ENV` | Yes | `production` |
| `PORT` | Render supplies | `10000` in render.yaml |

No Argon2 secret, session signing secret, or MongoDB credential is required in the frontend.

### Vercel frontend

The project root is `frontend`. `VITE_API_BASE_URL` should normally be empty: `/api` is served through the Vercel same-origin rewrite in `vercel.json`.

Set the rewrite destination in `frontend/vercel.json` or root `vercel.json` to the exact Render API origin, including `https://`. Keep `backend` behind the proxy rather than using direct cross-origin credentials.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/me`, `POST /api/auth/change-password`
- `GET/POST /api/boards`, `GET/PATCH/DELETE /api/boards/:boardId`
- `POST/PATCH/DELETE /api/boards/:boardId/members(/:userId)`
- `GET /api/board?boardId=...`, `POST /api/tasks`, `PATCH/DELETE /api/tasks/:id?boardId=...`
- `GET /api/events?boardId=...&connectionId=...`

Public boards allow anonymous reads and task views. Private boards require owner or member access. Only owners/editors can write. Owners manage settings and members. Viewers are read-only.

## Session and CSRF security

Session cookies are opaque random tokens stored only as SHA-256 hashes in MongoDB. The browser receives HttpOnly, Secure (production), SameSite=Lax cookies through the same-origin Vercel proxy. State-changing requests require the session CSRF token in `X-CSRF-Token`. Logout and password change invalidate sessions as appropriate.

Registration and login endpoints are rate limited. Passwords use Argon2id with a unique salt from the library. Passwords are never logged or returned.

## MongoDB migration

On the first registration, an idempotent transaction marker (`system_migrations/legacy-kanban-board-v1`) protects the legacy migration. Existing tasks without `boardId` are assigned to one private board owned by the first registrant. Task IDs and task fields are preserved; no tasks are deleted or reseeded. MongoDB transactions require a replica set, so Atlas is appropriate. If Atlas migration cannot run transactionally, a one-time migration script may be added and run only once against the existing database.

## Tests and verification

```sh
npm run typecheck
npm test
npm run build
```

Backend tests cover existing HTTP/validation behavior and SSE. Frontend tests cover ordering, filtering, URL state, snapshots and optimistic state utilities. Multi-user browser acceptance, MongoDB transactions, and production proxy behavior require external Atlas/Render/Vercel testing.

## Deployment

1. Deploy `backend` from the repository with `npm ci && npm run build --workspace backend` and `npm run start --workspace backend`.
2. Set Render environment variables above and redeploy.
3. Set the Vercel project root to `frontend` and root `vercel.json` destination to the exact Render HTTPS origin.
4. Set Render `CLIENT_ORIGIN` to the exact Vercel HTTPS origin.
5. Redeploy frontend and verify login/logout cookies, REST requests, and SSE network streams.

SSE may require disabling proxy buffering at the Render/Vercel edge. Vercel rewrites must preserve streaming headers and long-lived connections; direct cross-origin cookies must not be used as a workaround.
