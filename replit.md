# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Auth**: JWT (jsonwebtoken) + bcryptjs; token stored in localStorage; query-param fallback for SSE
- **Database**: SQLite (better-sqlite3) for user/auth data; schema seeded on startup
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── haproxy-analyzer/   # React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks + customFetch (supports setAuthTokenGetter)
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection (PostgreSQL)
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json            # Root: pnpm.onlyBuiltDependencies: ["better-sqlite3"]
```

## Auth System

- SQLite database at `artifacts/api-server/msb.db` (auto-created on startup)
- Default admin: `admin@msb.local` / `Admin@123!`
- Roles: Admin (all perms), Viewer (view_dashboard), Operator (view_dashboard)
- Permissions: `view_dashboard`, `manage_users`, `manage_roles`, `manage_policy`
- JWT tokens expire in 24h; `requireAuth` middleware checks Bearer header OR `?token=` query param
- Password policy enforced server-side + client-side strength meter

## Frontend Routes

- `/` — Dashboard (protected)
- `/login` — Login page (public)
- `/users` — User & Role management (requires `manage_users`)
- `/password-policy` — Password policy settings (requires `manage_policy`)
- `/profile` — User profile, password change, color theme picker

## Color Themes

CSS custom property `--primary` overridden via `html.theme-<name>` class:
- `red` (default), `blue`, `green`, `orange`, `pink`, `default` (classic cyan)
- Dark/light mode independent of color theme
- User preference stored in `localStorage` as `msb-color-theme` and synced to DB via `PUT /api/profile/theme`

## Permissions

- `view_dashboard` — view traffic dashboard
- `manage_users` — user CRUD
- `manage_roles` — role CRUD
- `manage_policy` — password policy
- `view_metrics` — view Server Metrics dashboard (Viewer + Admin)
- `manage_metrics` — add/remove metrics hosts (Admin only)

## Artifacts

### `artifacts/haproxy-analyzer` (`@workspace/haproxy-analyzer`)

React + Vite frontend. Features:
- Login gate with protected routes (wouter)
- Layout with top nav (Dashboard, Users & Roles, Password Policy) + user menu (Profile, Logout)
- Drag-and-drop log file upload; dashboard with summary stats, traffic chart, backend table, server events, connections table
- Live tail mode via SSE (`EventSource` with `?token=` query param)
- Color theme picker (Red/Blue/Green/Orange/Pink/Default) per user profile
- "Thinking..." spinner on all loading states
- Screenshot capture → download JPG + POST to `/api/screenshot`

### `artifacts/apistrator-ux` (`@workspace/apistrator-ux`)

React + Vite frontend (port 18118). Pages:
- `/` — HAProxy log dashboard (TopStats + BackendTable)
- `/security` — Security Events dashboard (SSH-collected RHEL host data via cron)
- `/metrics` — **Server Metrics** dashboard: heatmap table (CPU/Mem/Disk%) + bar + line history charts; powered by `GET /api/metrics/*`
- `/users`, `/password-policy`, `/profile`, `/log-config` — admin pages

Nav visible per-permission. `view_metrics` shown to Viewer and Admin. `manage_metrics` (Add/Remove hosts) shown to Admin only.

### `artifacts/apistrator-backend` (`@workspace/apistrator-backend`)

Express 5 API (port 8080). Key routes:
- `POST /api/auth/login`, `GET /api/auth/me`
- `GET|POST|PUT|DELETE /api/users`, `/api/roles`, `/api/password-policy`, `/api/profile`
- `GET|POST /api/security/*` — SSH-scanned RHEL security events; SSE stream
- `GET /api/metrics/servers`, `POST /api/metrics/servers`, `DELETE /api/metrics/servers/:ip`
- `GET /api/metrics/latest` — latest CPU/mem/disk per server (heatmap source)
- `GET /api/metrics/history/:ip` — up to 120 scans per host
- `POST /api/metrics/trigger/:ip` — on-demand collection
- `GET /api/metrics/stream` — SSE live push (also accepts `?token=` for EventSource)

Key lib files:
- `src/lib/db.ts` — SQLite setup, permissions seeding
- `src/lib/metrics-db.ts` — `metrics_servers` + `metrics_scans` tables
- `src/lib/metrics-collector.ts` — SSH Python script for CPU/mem/disk collection
- `src/lib/metrics-scheduler.ts` — 5-min interval + SSE event bus (`metricsBus`)
- `src/lib/security-db.ts` — SSH config shared by security + metrics schedulers

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API. All routes under `/api/`. Auth via `requireAuth` middleware (applied after `/api/auth/login`).

Key routes:
- `POST /api/auth/login` — returns JWT + user profile
- `GET /api/auth/me` — returns current user (protected)
- `GET|POST|PUT|DELETE /api/users` — user CRUD (requires `manage_users`)
- `GET|POST|PUT|DELETE /api/roles` — role CRUD (requires `manage_roles`)
- `GET /api/roles/permissions` — list all permissions
- `GET|PUT /api/password-policy` — password policy (PUT requires `manage_policy`)
- `GET|PUT /api/profile` — own profile update (protected)
- `PUT /api/profile/password` — change own password (enforces policy)
- `PUT /api/profile/theme` — update color theme, returns new JWT
- `POST /api/logs/parse` — parse log content
- `GET /api/logs/stream` — SSE live tail
- `GET|POST /api/screenshot` — screenshot store

Key lib files:
- `src/lib/db.ts` — SQLite setup, schema creation, seed data
- `src/lib/auth-middleware.ts` — JWT middleware, createToken, requirePermission
- `src/lib/password-validator.ts` — validatePassword(password, policy)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Run `pnpm run typecheck` from root.

## Root Scripts

- `pnpm run build` — typecheck + recursive build
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`
