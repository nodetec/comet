# Web Package Design — TanStack Start App

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Add `web/` package to the comet monorepo. Ports the landing page, admin portal, and user dashboard from comet-server into a single TanStack Start application.

---

## Context

The comet-server monolith originally served everything: Nostr relay, Blossom blob storage, admin portal, user dashboard, and landing page. The relay and blossom have been extracted as independent services (`relay/` and `blossom/`) in the comet monorepo. The three web surfaces — landing page, admin, and dashboard — remain in comet-server and need to be ported to a new home.

## Decision

Single TanStack Start app in `web/` at the monorepo root. Three route groups (`/`, `/admin/*`, `/dashboard/*`) in one build, one deployment. TanStack Start was chosen for ecosystem alignment (already heavy TanStack Query users), SSR capability for the landing page, and server functions that replace the Hono admin API.

---

## 1. Monorepo Package Structure

```
comet/
├── app/                    # @comet/app — Desktop Tauri app (unchanged)
├── relay/                  # @comet/relay — Nostr relay (unchanged, adds stats API)
├── blossom/                # @comet/blossom — Blob storage (unchanged)
├── web/                    # @comet/web — TanStack Start app (NEW)
│   ├── app/
│   │   ├── routes/
│   │   ├── components/
│   │   ├── lib/
│   │   └── server/
│   ├── public/
│   ├── app.config.ts
│   ├── package.json
│   └── Dockerfile
├── packages/
│   ├── data/               # @comet/data — Postgres schema + Drizzle (unchanged)
│   └── nostr/              # @comet/nostr — Event validation + Blossom auth (unchanged)
├── pnpm-workspace.yaml     # Add web/ entry
└── turbo.json              # Add web build/dev tasks
```

### Changes to existing packages

- **@comet/data** — No changes. Web app imports the same tables and queries Postgres directly.
- **@comet/nostr** — No changes. Not directly used by the web app.
- **@comet/relay** — Adds admin stats HTTP endpoint (`GET /admin/stats`, `GET /admin/connections`), protected by `ADMIN_TOKEN` Bearer auth.
- **pnpm-workspace.yaml** — Add `web` to workspace list.
- **turbo.json** — Add `dev` and `build` tasks for `web`.

### What does NOT become a shared package

- **Shared UI** (shadcn, Tailwind) — stays internal to `web/`. Desktop app has its own setup.
- **Nostr client utilities** (RelayClient, NIP-59, blob crypto) — stays internal to `web/`. YAGNI.
- **Admin Drizzle queries** — stays in `web/app/server/`. Specific to the admin surface.

---

## 2. Web App Architecture

### Route Structure

```
web/app/routes/
├── __root.tsx                    # HTML shell, providers, global styles
├── index.tsx                     # Landing page (/)
├── _admin.tsx                    # Admin layout (sidebar nav, auth guard)
├── _admin/
│   ├── index.tsx                 # Admin dashboard (/admin)
│   ├── login.tsx                 # Admin login (/admin/login)
│   ├── events.tsx                # Event management (/admin/events)
│   ├── blobs.tsx                 # Blob management (/admin/blobs)
│   ├── allowlist.tsx             # User allowlist (/admin/allowlist)
│   ├── users.tsx                 # Per-user stats (/admin/users)
│   ├── invite-codes.tsx          # Invite codes (/admin/invite-codes)
│   └── connections.tsx           # Live relay connections (/admin/connections)
├── _dashboard.tsx                # Dashboard layout (Nostr provider, auth guard)
└── _dashboard/
    ├── index.tsx                 # Notes view (/dashboard)
    └── login.tsx                 # Nostr sign-in (/dashboard/login)
```

### Rendering Strategy

| Route          | Rendering    | Rationale                                                                                       |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `/` (landing)  | SSR          | SEO, fast first paint, GitHub release data fetched server-side                                  |
| `/admin/*`     | SSR + client | Server functions fetch data, client renders charts/tables. Auth checked server-side via cookie. |
| `/dashboard/*` | Client-only  | Depends on NIP-07 browser extension and WebSocket relay. No server rendering value.             |

### Component Organization

```
web/app/
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── admin/                    # Admin components (stats charts, data tables)
│   ├── dashboard/                # Dashboard components (note list, note detail, blob image)
│   └── landing/                  # Landing page sections (hero, features, download)
├── lib/
│   ├── nostr/                    # RelayClient, NIP-59 unwrap, rumor parsing
│   ├── blob-crypto.ts            # Blob decryption (ChaCha20-Poly1305)
│   └── utils.ts                  # cn(), formatBytes, formatTimestamp
└── server/
    ├── db.ts                     # Drizzle client initialization
    ├── admin.ts                  # Admin query functions
    ├── relay-stats.ts            # HTTP client for relay admin stats API
    └── middleware.ts             # Auth validation helpers
```

### Key Dependencies

- `@tanstack/react-start` — Framework
- `@tanstack/react-router` — Type-safe routing
- `@tanstack/react-query` — Server state (admin polling, dashboard infinite queries)
- `@comet/data` — Postgres schema + Drizzle
- `drizzle-orm` + `postgres` — DB access in server functions
- `tailwindcss` v4 + `shadcn/ui` — Styling
- `recharts` — Admin dashboard charts
- `react-markdown` + `remark-gfm` — Dashboard note rendering
- `@noble/ciphers` — Blob decryption
- `nostr-tools` — Event utilities

---

## 3. Data Layer and Auth

### Admin Data Flow

```
Admin UI (React) → TanStack Router loader / server fn → Drizzle queries → Postgres
                                                      → fetch() → Relay admin API
```

Server functions in `web/app/server/admin.ts`:

- **Stats:** `getStats()`, `getEventsByKind()`, `getEventsOverTime()`, `getStorageByUser()`
- **Allowlist:** `listAllowedUsers()`, `allowUser()`, `revokeUser()`, `setStorageLimit()`
- **Events:** `listEvents(kind?, pubkey?, cursor?)`, `deleteEvents(ids[])`
- **Blobs:** `listBlobs(cursor?)`, `deleteBlob(sha256)` — also calls blossom service for S3 removal
- **Invite codes:** `listInviteCodes()`, `createInviteCode()`, `revokeInviteCode()`
- **Users:** `listUsers()` — joins users + blobs + events for per-user stats

Relay stats in `web/app/server/relay-stats.ts`:

- `getRelayStats()` → `GET {RELAY_URL}/admin/stats`
- `getRelayConnections()` → `GET {RELAY_URL}/admin/connections`
- Both authenticated via `ADMIN_TOKEN` in Authorization header.

Blob deletion crosses services: server function deletes from Postgres AND calls `DELETE {BLOSSOM_URL}/{sha256}` to remove from object storage.

### Admin Auth

1. **Login:** Token submitted → server function compares against `ADMIN_TOKEN` env var → sets `admin_session` httpOnly cookie (7-day expiry, sameSite=Lax, secure in production).
2. **Route guard:** `_admin.tsx` layout `beforeLoad` checks cookie server-side. Invalid → redirect to `/admin/login`.
3. **Server functions:** Each validates cookie via `assertAdmin(request)` helper.

### Dashboard Auth

Entirely client-side:

1. **Sign in:** `window.nostr.getPublicKey()` (NIP-07) → pubkey in localStorage → RelayClient connects → NIP-42 AUTH handshake.
2. **Route guard:** `_dashboard.tsx` layout checks localStorage on client. Missing → redirect to `/dashboard/login`.
3. **Data:** All via WebSocket relay subscriptions (NIP-01). No server functions. React Query manages cache.

### Environment Variables

```
DATABASE_URL          # Postgres connection string
ADMIN_TOKEN           # Admin auth token
RELAY_URL             # Internal URL to relay service (for stats API)
BLOSSOM_URL           # Internal URL to blossom service (for blob deletion)
```

---

## 4. Porting Strategy

### What moves from comet-server → web/

| Source (comet-server)          | Destination (web/)                                 | Notes                                                                                     |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/landing/page.tsx`         | `app/routes/index.tsx` + `app/components/landing/` | Rewrite from Hono JSX to React. SSR via route loader for GitHub release data.             |
| `src/landing/github.ts`        | `app/server/github.ts`                             | Port as-is. Called from route loader.                                                     |
| `admin-ui/src/pages/*.tsx`     | `app/routes/_admin/*.tsx`                          | Replace React Router with TanStack Router. Replace fetch API calls with server functions. |
| `admin-ui/src/components/`     | `app/components/admin/`                            | Port app-layout, data-table, chart components.                                            |
| `admin-ui/src/lib/api.ts`      | Deleted                                            | Replaced by server functions.                                                             |
| `src/admin/routes.tsx`         | `app/server/admin.ts`                              | Extract Drizzle queries into server functions. Drop Hono handling.                        |
| `src/admin/middleware.ts`      | `app/server/middleware.ts`                         | Simplify to `assertAdmin()` helper.                                                       |
| `dashboard-ui/src/pages/*.tsx` | `app/routes/_dashboard/*.tsx`                      | Port with TanStack Router. Mostly unchanged — client components.                          |
| `dashboard-ui/src/hooks/`      | `app/lib/nostr/`                                   | `use-nostr.tsx` → context provider. `use-notes.ts` → React Query hook.                    |
| `dashboard-ui/src/lib/`        | `app/lib/nostr/` + `app/lib/`                      | Nostr utilities → `app/lib/nostr/`. `blob-crypto.ts` → `app/lib/`.                        |
| `admin-ui/src/components/ui/`  | `app/components/ui/`                               | Fresh shadcn/ui install with clean config.                                                |

### What stays in comet-server (not ported)

- `src/relay/` — already in `relay/`
- `src/blossom/` — already in `blossom/`
- `src/schema.ts` — already in `packages/data`
- `src/access.ts` — relay uses internally. Web app queries `users` table directly via Drizzle.

### New work (doesn't exist in comet-server)

- **Relay admin stats endpoint** — new HTTP routes on `relay/` (`GET /admin/stats`, `GET /admin/connections`), protected by `ADMIN_TOKEN` Bearer auth.
- **Blossom delete proxy** — web server function calls `DELETE {BLOSSOM_URL}/{sha256}` when admin deletes a blob.
- **Dockerfile for web/** — Node-based (TanStack Start runs on Vinxi/Nitro). Deployed to Fly.io.

### Intentionally not ported

- Hono JSX admin views (`src/admin/views/`) — old server-rendered UI, superseded by React SPA.
- `src/connections.ts` — connection tracking lives in relay. Web reads via stats API.
