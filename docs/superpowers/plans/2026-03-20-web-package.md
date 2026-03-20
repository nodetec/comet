# Web Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the landing page, admin portal, and user dashboard from comet-server into a TanStack Start app (`web/`) in the comet monorepo.

**Architecture:** Single TanStack Start app with three route groups: `/` (SSR landing), `/admin/*` (SSR+client admin portal), `/dashboard/*` (client-only Nostr dashboard). Server functions replace the Hono admin API with direct Drizzle queries. Relay and blossom get lightweight admin endpoints for data the web app can't query from the DB.

**Tech Stack:** TanStack Start + Router + Query, React 19, Drizzle ORM, Postgres, Tailwind CSS v4, shadcn/ui, Recharts, nostr-tools, @noble/ciphers

**Spec:** `docs/superpowers/specs/2026-03-20-web-package-design.md`

---

## File Structure

### New files in `web/`

```
web/
├── app.config.ts                          # TanStack Start config (Vinxi/Nitro, node-server preset)
├── package.json                           # @comet/web package
├── tsconfig.json                          # TypeScript config
├── Dockerfile                             # Production build (node-server)
├── app/
│   ├── client.tsx                         # Client entry (hydrateRoot)
│   ├── router.tsx                         # Router config + QueryClient
│   ├── ssr.tsx                            # SSR entry
│   ├── global.css                         # Tailwind + global styles
│   ├── routes/
│   │   ├── __root.tsx                     # HTML shell, providers
│   │   ├── index.tsx                      # Landing page (/)
│   │   ├── _admin.tsx                     # Admin layout + auth guard
│   │   ├── _admin/
│   │   │   ├── index.tsx                  # Admin dashboard (/admin)
│   │   │   ├── login.tsx                  # Admin login (/admin/login)
│   │   │   ├── events.tsx                 # Event management
│   │   │   ├── blobs.tsx                  # Blob management
│   │   │   ├── allowlist.tsx              # User allowlist
│   │   │   ├── users.tsx                  # Per-user stats
│   │   │   ├── invite-codes.tsx           # Invite codes
│   │   │   └── connections.tsx            # Relay connections
│   │   ├── _dashboard.tsx                 # Dashboard layout + Nostr guard
│   │   └── _dashboard/
│   │       ├── index.tsx                  # Notes view (/dashboard)
│   │       └── login.tsx                  # Nostr sign-in
│   ├── components/
│   │   ├── ui/                            # shadcn/ui primitives (fresh install)
│   │   ├── admin/
│   │   │   ├── app-layout.tsx             # Admin sidebar nav
│   │   │   ├── data-table.tsx             # Reusable data table (TanStack Table)
│   │   │   ├── stats-cards.tsx            # Stat card grid
│   │   │   └── charts.tsx                 # Recharts wrappers (area, pie, bar)
│   │   ├── dashboard/
│   │   │   ├── app-layout.tsx             # Dashboard sidebar nav
│   │   │   ├── note-list.tsx              # Infinite scroll note list
│   │   │   ├── note-detail.tsx            # Note markdown renderer
│   │   │   └── blob-image.tsx             # Encrypted blob image loader
│   │   └── landing/
│   │       ├── hero.tsx                   # Hero section + download buttons
│   │       └── features.tsx               # Feature grid
│   ├── lib/
│   │   ├── utils.ts                       # cn(), formatBytes, formatTimestamp, etc.
│   │   ├── blob-crypto.ts                 # ChaCha20-Poly1305 blob decryption
│   │   └── nostr/
│   │       ├── client.ts                  # RelayClient (WebSocket NIP-01)
│   │       ├── nip59.ts                   # Gift wrap unwrapping
│   │       ├── rumor.ts                   # Rumor parsing (Note/Notebook types)
│   │       ├── use-nostr.tsx              # NostrProvider context + useNostr hook
│   │       └── use-notes.ts               # useNotes infinite query hook
│   └── server/
│       ├── db.ts                          # Drizzle client init
│       ├── middleware.ts                  # assertAdmin(), getCookie() helpers
│       ├── github.ts                      # GitHub release fetcher (cached)
│       ├── relay-client.ts                # HTTP client for relay admin API
│       ├── admin/
│       │   ├── auth.ts                    # Login/logout server functions
│       │   ├── stats.ts                   # Stats + chart data server functions
│       │   ├── allowlist.ts               # Allowlist CRUD server functions
│       │   ├── events.ts                  # Events list/delete server functions
│       │   ├── blobs.ts                   # Blobs list/delete server functions
│       │   ├── invite-codes.ts            # Invite code CRUD server functions
│       │   ├── users.ts                   # User stats server function
│       │   └── connections.ts             # Relay connections proxy server function
│       └── landing.ts                     # Landing page loader (GitHub releases)
```

### Modified files in existing packages

```
relay/src/server.ts                        # Add GET /admin/connections route
relay/test/admin.test.ts                   # Tests for admin endpoint (NEW)
blossom/src/server.ts                      # Add DELETE /admin/{sha256} route
blossom/test/admin.test.ts                 # Tests for admin endpoint (NEW)
pnpm-workspace.yaml                        # Add web entry
package.json (root)                        # Add web:* convenience scripts, lint-staged for web/
```

---

## Task 1: Monorepo Configuration

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Step 1: Add web to pnpm workspace**

```yaml
# pnpm-workspace.yaml
packages:
  - app
  - blossom
  - relay
  - web
  - packages/*
```

- [ ] **Step 2: Add web convenience scripts and lint-staged to root package.json**

Add to `scripts`:

```json
"web:dev": "pnpm --filter @comet/web dev",
"web:build": "pnpm --filter @comet/web build",
"web:typecheck": "pnpm --filter @comet/web typecheck",
"web:lint": "pnpm --filter @comet/web lint",
"web:lint:fix": "pnpm --filter @comet/web lint:fix"
```

Add to `lint-staged`:

```json
"web/**/*.{ts,tsx}": [
  "pnpm --filter @comet/web exec eslint --fix",
  "prettier --write"
]
```

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml package.json
git commit -m "Add web package to monorepo workspace config"
```

---

## Task 2: TanStack Start Scaffolding

**Files:**

- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/app.config.ts`
- Create: `web/app/client.tsx`
- Create: `web/app/ssr.tsx`
- Create: `web/app/router.tsx`
- Create: `web/app/global.css`
- Create: `web/app/routes/__root.tsx`
- Create: `web/app/routes/index.tsx`
- Create: `web/app/lib/utils.ts`

- [ ] **Step 1: Create web/package.json**

```json
{
  "name": "@comet/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vinxi dev --port 3100",
    "build": "vinxi build",
    "start": "vinxi start",
    "lint": "eslint --cache --cache-location node_modules/.cache/eslint .",
    "lint:fix": "eslint --cache --cache-location node_modules/.cache/eslint . --fix",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@comet/data": "workspace:*",
    "@tanstack/react-query": "^5.90.0",
    "@tanstack/react-router": "^1.120.0",
    "@tanstack/react-start": "^1.120.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.1",
    "lucide-react": "^0.475.0",
    "postgres": "^3.4.7",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwind-merge": "^3.3.0",
    "vinxi": "^0.5.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@tailwindcss/vite": "^4.2.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "eslint": "^9.39.1",
    "globals": "^17.2.3",
    "tailwindcss": "^4.2.1",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.46.4"
  }
}
```

Note: Exact version numbers should be resolved at install time. Use the latest stable TanStack Start release.

- [ ] **Step 2: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./app/*"]
    }
  },
  "include": ["app/**/*.ts", "app/**/*.tsx", "app.config.ts"]
}
```

- [ ] **Step 3: Create web/app.config.ts**

```typescript
import { defineConfig } from "@tanstack/react-start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 4: Create web/app/router.tsx**

```typescript
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
      },
    },
  });

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

- [ ] **Step 5: Create web/app/client.tsx and web/app/ssr.tsx**

`client.tsx`:

```typescript
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { createRouter } from "./router";

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

`ssr.tsx`:

```typescript
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createRouter } from "./router";

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);
```

- [ ] **Step 6: Create web/app/global.css**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create web/app/routes/\_\_root.tsx**

```typescript
import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import globalCss from "@/global.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Comet" },
    ],
    links: [{ rel: "stylesheet", href: globalCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create placeholder web/app/routes/index.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Comet</h1>
    </div>
  );
}
```

- [ ] **Step 9: Create web/app/lib/utils.ts**

Port from `comet-server/admin-ui/src/lib/utils.ts` and `dashboard-ui/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}

export function usagePercent(used: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

const KIND_LABELS: Record<number, string> = {
  0: "Metadata",
  1: "Note",
  3: "Contacts",
  4: "DM",
  5: "Delete",
  7: "Reaction",
  9: "Delete",
  23: "Long-form",
  1059: "Gift Wrap",
  10002: "Relay List",
  24242: "Blossom Auth",
  30023: "Long-form",
};

export function kindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? `Kind ${kind}`;
}

export function shortPubkey(pubkey: string): string {
  return pubkey.slice(0, 8) + "…";
}

export function usageColor(pct: number): string {
  if (pct >= 95) return "bg-destructive";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-primary";
}

export const DEFAULT_STORAGE_LIMIT_BYTES = 1_073_741_824; // 1 GB
```

- [ ] **Step 10: Create web/eslint.config.js**

ESLint flat config for React + TypeScript (matching the pattern from relay/blossom packages):

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  { ignores: [".output/", "node_modules/"] },
);
```

- [ ] **Step 11: Install dependencies and verify dev server starts**

```bash
cd web && pnpm install
pnpm dev
# Verify: http://localhost:3100 shows "Comet" heading
```

- [ ] **Step 12: Initialize shadcn/ui**

Run shadcn init in `web/`, configure for Tailwind v4, default theme. Install base components needed across admin and dashboard: `button`, `card`, `input`, `label`, `dialog`, `badge`, `table`, `scroll-area`, `skeleton`, `separator`, `sheet`, `dropdown-menu`, `select`, `progress`, `tooltip`, `sonner`.

- [ ] **Step 13: Add turbo build output override for web package**

TanStack Start/Vinxi outputs to `.output/` (not `dist/`). Add to `web/package.json`:

```json
"turbo": {
  "tasks": {
    "build": {
      "outputs": [".output/**"]
    }
  }
}
```

This overrides the root `turbo.json` `"outputs": ["dist/**"]` for this package only.

- [ ] **Step 14: Commit**

```bash
git add web/
git commit -m "Scaffold TanStack Start web package with shadcn/ui"
```

---

## Task 3: Relay Admin Connections Endpoint

**Files:**

- Modify: `relay/src/server.ts`
- Create: `relay/test/admin.test.ts`

Reference: `relay/src/connections.ts` — `ConnectionManager` has `.entries()` and `.getAuthedPubkeys(id)`.

- [ ] **Step 1: Write the test**

Create `relay/test/admin.test.ts`. Follow the existing relay test pattern: `startTestRelay(port)` in `beforeAll`, `ctx.cleanup()` in `afterAll`. Set `ADMIN_TOKEN` env var in setup.

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startTestRelay, type TestContext } from "./helpers";

const ADMIN_TOKEN = "test-admin-token";
let ctx: TestContext;

beforeAll(async () => {
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  ctx = await startTestRelay(39200);
});

afterAll(async () => {
  await ctx.cleanup();
  delete process.env.ADMIN_TOKEN;
});

describe("GET /admin/connections", () => {
  test("returns 401 without admin token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`);
    expect(res.status).toBe(401);
  });

  test("returns 401 with wrong token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns connections array with valid token", async () => {
    const res = await fetch(`http://localhost:${ctx.port}/admin/connections`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("connections");
    expect(Array.isArray(body.connections)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd relay && bun test test/admin.test.ts
```

Expected: FAIL (endpoint doesn't exist yet, returns 404).

- [ ] **Step 3: Add admin connections route to relay server**

In `relay/src/server.ts`, add before the 404 fallback in the `fetch` handler. The handler uses `req` (not `request`) and `connections` is a local variable in `createRelayServer` scope (not `runtime.connections`):

```typescript
if (url.pathname === "/admin/connections" && req.method === "GET") {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return Response.json({ error: "admin not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${adminToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = [];
  for (const [id, state] of connections.entries()) {
    result.push({
      id,
      authedPubkeys: Array.from(state.authedPubkeys),
    });
  }
  return Response.json({ connections: result });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd relay && bun test test/admin.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add relay/src/server.ts relay/test/admin.test.ts
git commit -m "Add GET /admin/connections endpoint to relay"
```

---

## Task 4: Blossom Admin Delete Endpoint

**Files:**

- Modify: `blossom/src/server.ts`
- Create: `blossom/test/admin.test.ts`

Reference: Existing `DELETE /{sha256}` uses `validateBlossomAuth()` (Nostr-auth). New `DELETE /admin/{sha256}` uses Bearer token auth and calls `blobDb.deleteBlob()` + `objectStorage.deleteBlob()`.

- [ ] **Step 1: Write the test**

Create `blossom/test/admin.test.ts`. Follow the existing blossom test pattern: `startTestBlossom()` in `beforeEach`, `ctx.cleanup()` in `afterEach`. Set `ADMIN_TOKEN` env var in setup.

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startTestBlossom, type BlossomTestContext } from "./helpers";

const ADMIN_TOKEN = "test-admin-token";
let ctx: BlossomTestContext | undefined;

describe("DELETE /admin/:sha256", () => {
  beforeEach(async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    ctx = await startTestBlossom();
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = undefined;
    }
    delete process.env.ADMIN_TOKEN;
  });

  test("returns 401 without admin token", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 with wrong token", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 404 for non-existent blob", async () => {
    const fakeSha = "a".repeat(64);
    const res = await fetch(`${ctx!.baseUrl}/admin/${fakeSha}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd blossom && bun test test/admin.test.ts
```

- [ ] **Step 3: Add admin delete route to blossom server**

In `blossom/src/server.ts`, add a new route before the existing `DELETE` handler. Parse the path to match `/admin/{sha256}`:

```typescript
// Admin blob deletion — ADMIN_TOKEN auth (no Nostr signing required)
const adminBlobMatch = url.pathname.match(/^\/admin\/([a-f0-9]{64})$/);
if (request.method === "DELETE" && adminBlobMatch) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return json({ error: "admin not configured" }, 503);
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${adminToken}`) {
    return json({ error: "unauthorized" }, 401);
  }
  const sha256 = adminBlobMatch[1];
  const blob = await blobDb.getBlob(db, sha256);
  if (!blob) {
    return json({ error: "not found" }, 404);
  }
  await objectStorage.deleteBlob(sha256);
  await blobDb.deleteBlob(db, sha256);
  return json({ deleted: true });
}
```

Uses existing `json()` helper, `blobDb`, and `objectStorage` already in scope.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd blossom && bun test test/admin.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add blossom/src/server.ts blossom/test/admin.test.ts
git commit -m "Add DELETE /admin/:sha256 endpoint to blossom"
```

---

## Task 5: Server-Side Foundation

**Files:**

- Create: `web/app/server/db.ts`
- Create: `web/app/server/middleware.ts`
- Create: `web/app/server/github.ts`
- Create: `web/app/server/relay-client.ts`

- [ ] **Step 1: Create db.ts — Drizzle client**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@comet/data";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

- [ ] **Step 2: Create middleware.ts — auth helpers**

```typescript
import { getCookie, setCookie, deleteCookie } from "vinxi/http";

const SESSION_COOKIE = "admin_session";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function assertAdmin(): void {
  const token = getCookie(SESSION_COOKIE);
  if (!token || token !== process.env.ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export function setAdminSession(): void {
  setCookie(SESSION_COOKIE, process.env.ADMIN_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SEVEN_DAYS,
    path: "/",
  });
}

export function clearAdminSession(): void {
  deleteCookie(SESSION_COOKIE);
}

export function isAdminAuthenticated(): boolean {
  const token = getCookie(SESSION_COOKIE);
  return !!token && token === process.env.ADMIN_TOKEN;
}
```

Note: TanStack Start uses Vinxi which provides `getCookie`/`setCookie`/`deleteCookie` from `vinxi/http` for server-side cookie access. If the exact API differs, adapt to the actual Vinxi HTTP utilities available. Check TanStack Start docs at implementation time.

- [ ] **Step 3: Create github.ts — release fetcher**

Port from `comet-server/src/landing/github.ts`:

```typescript
const REPO = "nodetec/comet";

export type ReleaseAsset = {
  name: string;
  url: string;
};

export type Release = {
  tag: string;
  assets: ReleaseAsset[];
};

let cached: { release: Release | null; fetchedAt: number } | null = null;
const CACHE_TTL = 300_000; // 5 minutes

export async function getLatestRelease(): Promise<Release | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.release;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { "User-Agent": "comet-web" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const release: Release = {
      tag: data.tag_name,
      assets: (data.assets ?? []).map(
        (a: { name: string; browser_download_url: string }) => ({
          name: a.name,
          url: a.browser_download_url,
        }),
      ),
    };
    cached = { release, fetchedAt: Date.now() };
    return release;
  } catch {
    return null;
  }
}

export function findAsset(
  assets: ReleaseAsset[],
  pattern: string,
): ReleaseAsset | undefined {
  return assets.find((a) =>
    a.name.toLowerCase().includes(pattern.toLowerCase()),
  );
}
```

- [ ] **Step 4: Create relay-client.ts — relay admin API client**

```typescript
// RELAY_URL must be an HTTP URL (e.g., http://comet-relay.internal:3000),
// NOT the public WebSocket URL (wss://...). On Fly.io, use private networking.
export async function getRelayConnections(): Promise<{
  connections: { id: string; authedPubkeys: string[] }[];
}> {
  const url = process.env.RELAY_URL;
  const token = process.env.ADMIN_TOKEN;
  if (!url || !token) {
    return { connections: [] };
  }
  const res = await fetch(`${url}/admin/connections`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { connections: [] };
  }
  return res.json();
}
```

- [ ] **Step 5: Commit**

```bash
git add web/app/server/
git commit -m "Add server-side foundation: DB, auth, GitHub, relay client"
```

---

## Task 6: Admin Auth + Login Page + Layout

**Files:**

- Create: `web/app/server/admin/auth.ts`
- Create: `web/app/routes/_admin.tsx`
- Create: `web/app/routes/_admin/login.tsx`
- Create: `web/app/components/admin/app-layout.tsx`

- [ ] **Step 1: Create admin auth server functions**

`web/app/server/admin/auth.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import {
  setAdminSession,
  clearAdminSession,
  isAdminAuthenticated,
} from "../middleware";

export const login = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (data.token !== process.env.ADMIN_TOKEN) {
      return { ok: false, error: "Invalid token" };
    }
    setAdminSession();
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearAdminSession();
  return { ok: true };
});

export const checkAuth = createServerFn({ method: "GET" }).handler(async () => {
  return { authenticated: isAdminAuthenticated() };
});
```

- [ ] **Step 2: Create admin layout route with auth guard**

`web/app/routes/_admin.tsx`:

```typescript
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminAppLayout } from "@/components/admin/app-layout";
import { checkAuth } from "@/server/admin/auth";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ location }) => {
    // Don't guard the login page itself
    if (location.pathname === "/admin/login") return;
    const { authenticated } = await checkAuth();
    if (!authenticated) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminAppLayout>
      <Outlet />
    </AdminAppLayout>
  );
}
```

- [ ] **Step 3: Create admin app layout component**

Port from `comet-server/admin-ui/src/components/app-layout.tsx`. Adapt navigation links to use TanStack Router `Link` component. Sidebar with nav items: Dashboard, Events, Blobs, Allowlist, Users, Invite Codes, Connections. Include logout button that calls the `logout` server function and redirects to `/admin/login`.

Key changes from original:

- Replace `react-router` `Link`/`useLocation`/`useNavigate` with `@tanstack/react-router` equivalents
- Replace `api.logout()` call with the `logout` server function

- [ ] **Step 4: Create admin login page**

`web/app/routes/_admin/login.tsx`:

Port from `comet-server/admin-ui/src/pages/login.tsx`. Replace the `api.login(token)` call with the `login` server function from `@/server/admin/auth`. On success, navigate to `/admin`.

Key changes from original:

- Replace `useNavigate` from react-router with TanStack Router's
- Replace `api.login()` with `login({ data: { token } })`
- Replace `<Navigate to="/admin" />` with TanStack Router redirect

- [ ] **Step 5: Verify login flow works**

```bash
cd web && pnpm dev
# Set ADMIN_TOKEN=test-token in .env
# Navigate to http://localhost:3100/admin → should redirect to /admin/login
# Enter "test-token" → should redirect to /admin
# Refresh /admin → should stay (cookie persists)
```

- [ ] **Step 6: Commit**

```bash
git add web/app/server/admin/auth.ts web/app/routes/_admin.tsx web/app/routes/_admin/login.tsx web/app/components/admin/app-layout.tsx
git commit -m "Add admin auth flow with login page and layout guard"
```

---

## Task 7: Admin Stats Server Functions

**Files:**

- Create: `web/app/server/admin/stats.ts`

Port the Drizzle queries from `comet-server/src/admin/routes.tsx` (stats endpoints, lines ~54-114).

- [ ] **Step 1: Create stats server functions**

`web/app/server/admin/stats.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { count, sql, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { events, blobs, blobOwners, users } from "@comet/data";
import { assertAdmin } from "../middleware";

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  assertAdmin();
  const [eventCount] = await db.select({ count: count() }).from(events);
  const [blobCount] = await db.select({ count: count() }).from(blobs);
  const [userCount] = await db.select({ count: count() }).from(users);
  const [storage] = await db
    .select({ total: sql<number>`coalesce(sum(${blobs.size}), 0)` })
    .from(blobs);
  return {
    events: eventCount.count,
    blobs: blobCount.count,
    users: userCount.count,
    blobStorage: storage.total,
  };
});

export const getEventsByKind = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db
      .select({
        kind: events.kind,
        count: count(),
      })
      .from(events)
      .groupBy(events.kind)
      .orderBy(desc(count()))
      .limit(10);
    return { data: rows };
  },
);

export const getEventsOverTime = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db.execute(sql`
      SELECT
        to_char(to_timestamp(created_at), 'YYYY-MM-DD') as date,
        count(*)::int as events
      FROM events
      WHERE created_at > extract(epoch from now() - interval '30 days')
      GROUP BY date
      ORDER BY date
    `);
    return { data: rows };
  },
);

export const getStorageByUser = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    const rows = await db
      .select({
        pubkey: blobOwners.pubkey,
        storage: sql<number>`coalesce(sum(${blobs.size}), 0)`,
      })
      .from(blobOwners)
      .leftJoin(blobs, eq(blobOwners.sha256, blobs.sha256))
      .groupBy(blobOwners.pubkey)
      .orderBy(desc(sql`sum(${blobs.size})`))
      .limit(8);
    return { data: rows };
  },
);
```

Adapt exact SQL to match what comet-server does. The queries above are derived from the comet-server admin routes — verify column names and join conditions match the `@comet/data` schema.

Note: The original monolith's `getStats()` returned a `connections` count from the in-memory ConnectionManager. Since connections now come from the relay's admin API, this server function returns a `users` count instead. The dashboard page (Task 8) should show a "Users" stat card instead of "Connections" — connection count is shown on the dedicated connections page via the relay API.

- [ ] **Step 2: Commit**

```bash
git add web/app/server/admin/stats.ts
git commit -m "Add admin stats server functions"
```

---

## Task 8: Admin Dashboard Page

**Files:**

- Create: `web/app/routes/_admin/index.tsx`
- Create: `web/app/components/admin/stats-cards.tsx`
- Create: `web/app/components/admin/charts.tsx`

- [ ] **Step 1: Add recharts dependency**

```bash
cd web && pnpm add recharts
```

- [ ] **Step 2: Create stats cards component**

Port the stat cards grid from `comet-server/admin-ui/src/pages/dashboard.tsx`. Four cards: Stored Events, Blobs, Users, Blob Storage. Uses shadcn `Card` component.

- [ ] **Step 3: Create chart components**

Port the three Recharts visualizations from `comet-server/admin-ui/src/pages/dashboard.tsx`:

- `EventsOverTimeChart` — AreaChart, 30-day history
- `EventsByKindChart` — PieChart (donut) with centered count
- `StorageByUserChart` — BarChart, top 8 users

Wrap each in its own component in `web/app/components/admin/charts.tsx`.

- [ ] **Step 4: Create admin dashboard page**

`web/app/routes/_admin/index.tsx`:

Wire the stats server functions to the page. Use React Query (`useQuery`) to poll stats every 5 seconds. Call `getStats`, `getEventsByKind`, `getEventsOverTime`, `getStorageByUser` server functions.

Port the layout from `comet-server/admin-ui/src/pages/dashboard.tsx`:

- Replace `api.fetchStats()` with `getStats()` server function calls via React Query
- Replace `api.fetchEventsByKind()` etc. with corresponding server functions
- Use the new `StatsCards` and chart components

- [ ] **Step 5: Verify dashboard renders with stats**

```bash
cd web && pnpm dev
# Navigate to http://localhost:3100/admin (after login)
# Should see stat cards and charts (may show zeros without data)
```

- [ ] **Step 6: Commit**

```bash
git add web/app/routes/_admin/index.tsx web/app/components/admin/stats-cards.tsx web/app/components/admin/charts.tsx
git commit -m "Add admin dashboard page with stats and charts"
```

---

## Task 9: Admin CRUD Server Functions

**Files:**

- Create: `web/app/server/admin/allowlist.ts`
- Create: `web/app/server/admin/events.ts`
- Create: `web/app/server/admin/blobs.ts`
- Create: `web/app/server/admin/invite-codes.ts`
- Create: `web/app/server/admin/users.ts`
- Create: `web/app/server/admin/connections.ts`

Port Drizzle queries from `comet-server/src/admin/routes.tsx` for each resource.

- [ ] **Step 1: Create allowlist server functions**

Port `GET /api/allow`, `POST /api/allow`, `DELETE /api/allow/:pubkey`, `PATCH /api/allow/:pubkey/storage-limit` as `createServerFn` functions. Each calls `assertAdmin()` first. Queries the `users` table, joins `blobOwners`/`blobs` for storage usage.

- [ ] **Step 2: Create events server functions**

Port `GET /api/events` (cursor-paginated, filterable by kind/pubkey) and `DELETE /api/events` (bulk delete by IDs). Cursor is the `firstSeen` timestamp of the last event.

- [ ] **Step 3: Create blobs server functions**

Port `GET /api/blobs` (cursor-paginated, 50 per page). For `deleteBlob`, call `DELETE {BLOSSOM_URL}/admin/{sha256}` using fetch — this hits the new blossom admin endpoint from Task 4.

```typescript
export const deleteBlob = createServerFn({ method: "POST" })
  .validator((data: { sha256: string }) => data)
  .handler(async ({ data }) => {
    assertAdmin();
    const blossomUrl = process.env.BLOSSOM_URL;
    const adminToken = process.env.ADMIN_TOKEN;
    const res = await fetch(`${blossomUrl}/admin/${data.sha256}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete blob");
    }
    return { deleted: true };
  });
```

- [ ] **Step 4: Create invite codes server functions**

Port `GET /api/invite-codes`, `POST /api/invite-codes`, `DELETE /api/invite-codes/:id`. Code generation: random 12-char lowercase alphanumeric string (matching the existing monolith pattern from `comet-server/src/access.ts`).

- [ ] **Step 5: Create users server function**

Port `GET /api/users` — aggregated query joining `users`, `blobOwners`, `blobs`, and `events` for per-user stats (blob count, storage used, storage limit, event count).

- [ ] **Step 6: Create connections server function**

Proxy to relay admin API:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { assertAdmin } from "../middleware";
import { getRelayConnections } from "../relay-client";

export const listConnections = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    return getRelayConnections();
  },
);
```

- [ ] **Step 7: Commit**

```bash
git add web/app/server/admin/
git commit -m "Add admin CRUD server functions for all resources"
```

---

## Task 10: Admin Data Table Component

**Files:**

- Create: `web/app/components/admin/data-table.tsx`

- [ ] **Step 1: Add TanStack Table dependency**

```bash
cd web && pnpm add @tanstack/react-table
```

- [ ] **Step 2: Port data table component**

Port from `comet-server/admin-ui/src/components/data-table.tsx`. Same props interface: columns, data, defaultPageSize, emptyMessage, hasNextPage, isFetchingNextPage, onLoadMore, enableRowSelection, getRowId, actionBar. Uses shadcn `Table` components.

No framework-specific changes needed — this is a pure React component using TanStack Table.

- [ ] **Step 3: Commit**

```bash
git add web/app/components/admin/data-table.tsx
git commit -m "Add reusable admin data table component"
```

---

## Task 11: Admin Pages — Events + Blobs

**Files:**

- Create: `web/app/routes/_admin/events.tsx`
- Create: `web/app/routes/_admin/blobs.tsx`

- [ ] **Step 1: Port events page**

Port from `comet-server/admin-ui/src/pages/events.tsx`. Key changes:

- Replace `api.fetchEvents()` with `listEvents()` server function via `useInfiniteQuery`
- Replace `api.deleteEvents()` with `deleteEvents()` server function via `useMutation`
- Replace React Router hooks with TanStack Router equivalents
- Use the new `DataTable` component

- [ ] **Step 2: Port blobs page**

Port from `comet-server/admin-ui/src/pages/blobs.tsx`. Key changes:

- Replace `api.fetchBlobs()` with `listBlobs()` server function via `useInfiniteQuery`
- Replace `api.deleteBlob()` with `deleteBlob()` server function via `useMutation`
- Use the new `DataTable` component

- [ ] **Step 3: Verify both pages render**

```bash
cd web && pnpm dev
# Navigate to /admin/events and /admin/blobs
```

- [ ] **Step 4: Commit**

```bash
git add web/app/routes/_admin/events.tsx web/app/routes/_admin/blobs.tsx
git commit -m "Add admin events and blobs pages"
```

---

## Task 12: Admin Pages — Allowlist + Users

**Files:**

- Create: `web/app/routes/_admin/allowlist.tsx`
- Create: `web/app/routes/_admin/users.tsx`

- [ ] **Step 1: Port allowlist page**

Port from `comet-server/admin-ui/src/pages/allowlist.tsx`. Key changes:

- Replace API calls with server functions
- Replace `nip19.decode` import from `nostr-tools` (add `nostr-tools` dep if not yet installed)
- Storage limit editor dialog, revoke dialog, add pubkey form

```bash
cd web && pnpm add nostr-tools
```

- [ ] **Step 2: Port users page**

Port from `comet-server/admin-ui/src/pages/users.tsx`. Replace API calls with `listUsers()` server function. Auto-refetch every 10s.

- [ ] **Step 3: Commit**

```bash
git add web/app/routes/_admin/allowlist.tsx web/app/routes/_admin/users.tsx
git commit -m "Add admin allowlist and users pages"
```

---

## Task 13: Admin Pages — Invite Codes + Connections

**Files:**

- Create: `web/app/routes/_admin/invite-codes.tsx`
- Create: `web/app/routes/_admin/connections.tsx`

- [ ] **Step 1: Port invite codes page**

Port from `comet-server/admin-ui/src/pages/invite-codes.tsx`. Replace API calls with server functions. Create form, status badges, copy button, revoke dialog.

- [ ] **Step 2: Port connections page**

Port from `comet-server/admin-ui/src/pages/connections.tsx`. Replace `api.fetchConnections()` with `listConnections()` server function. Auto-refetch every 3s.

- [ ] **Step 3: Verify all admin pages work end-to-end**

```bash
cd web && pnpm dev
# Walk through every admin page: dashboard, events, blobs, allowlist, users, invite-codes, connections
# Verify navigation, data loading, and mutations work
```

- [ ] **Step 4: Commit**

```bash
git add web/app/routes/_admin/invite-codes.tsx web/app/routes/_admin/connections.tsx
git commit -m "Add admin invite codes and connections pages"
```

---

## Task 14: Dashboard Nostr Client Libraries

**Files:**

- Create: `web/app/lib/nostr/client.ts`
- Create: `web/app/lib/nostr/nip59.ts`
- Create: `web/app/lib/nostr/rumor.ts`
- Create: `web/app/lib/blob-crypto.ts`

- [ ] **Step 1: Port RelayClient**

Port from `comet-server/dashboard-ui/src/lib/nostr.ts`. This is pure TypeScript with no framework dependencies. Copy and adapt:

- `RelayClient` class with WebSocket connection, auto-reconnect, NIP-42 AUTH
- `NostrEvent`, `NostrFilter`, `UnsignedEvent` types
- `window.nostr` interface declaration (NIP-07)

No changes needed beyond import paths.

- [ ] **Step 2: Port NIP-59 gift wrap unwrapping**

Port from `comet-server/dashboard-ui/src/lib/nip59.ts`. Pure async utility, no changes needed.

- [ ] **Step 3: Port rumor parsing**

Port from `comet-server/dashboard-ui/src/lib/rumor.ts`. Pure TypeScript — `Note`, `Notebook`, `BlobRef` types, `parseNoteRumor()`, `getRumorType()`, helper functions.

- [ ] **Step 4: Port blob crypto**

Port from `comet-server/dashboard-ui/src/lib/blob-crypto.ts`. Add `@noble/ciphers` dependency:

```bash
cd web && pnpm add @noble/ciphers
```

ChaCha20-Poly1305 decryption utility, no changes needed.

- [ ] **Step 5: Commit**

```bash
git add web/app/lib/
git commit -m "Add Nostr client libraries and blob crypto"
```

---

## Task 15: Dashboard Auth + Layout

**Files:**

- Create: `web/app/lib/nostr/use-nostr.tsx`
- Create: `web/app/lib/nostr/use-notes.ts`
- Create: `web/app/routes/_dashboard.tsx`
- Create: `web/app/routes/_dashboard/login.tsx`
- Create: `web/app/components/dashboard/app-layout.tsx`

- [ ] **Step 1: Port NostrProvider context**

Port from `comet-server/dashboard-ui/src/hooks/use-nostr.tsx`. Key changes:

- Import `RelayClient` from `@/lib/nostr/client` instead of relative path
- The `RELAY_URL` for the dashboard WebSocket connection needs to come from the client. Options:
  - Embed it in the HTML via a `<meta>` tag or `window.__ENV__` set by the root route's SSR
  - Or hardcode/env-var it. Use `import.meta.env.VITE_RELAY_URL` (Vite public env var)

- [ ] **Step 2: Port useNotes hook**

Port from `comet-server/dashboard-ui/src/hooks/use-notes.ts`. Update imports to use `@/lib/nostr/*`. No logic changes.

- [ ] **Step 3: Create dashboard layout route**

`web/app/routes/_dashboard.tsx`:

```typescript
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NostrProvider } from "@/lib/nostr/use-nostr";
import { DashboardAppLayout } from "@/components/dashboard/app-layout";

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <NostrProvider>
      <DashboardAppLayout>
        <Outlet />
      </DashboardAppLayout>
    </NostrProvider>
  );
}
```

Note: Auth guard is handled inside `DashboardAppLayout` on the client side (checks localStorage for pubkey, redirects to `/dashboard/login` if missing). The login route is rendered inside the layout but the layout component shows it without the sidebar.

- [ ] **Step 4: Port dashboard app layout**

Port from `comet-server/dashboard-ui/src/components/app-layout.tsx`. Replace React Router navigation with TanStack Router `Link` and `useNavigate`.

- [ ] **Step 5: Port dashboard login page**

`web/app/routes/_dashboard/login.tsx`:

Port from `comet-server/dashboard-ui/src/pages/login.tsx`. Replace `useNavigate` from react-router with TanStack Router's. Replace `<Navigate to="/" />` with redirect to `/dashboard`.

- [ ] **Step 6: Verify dashboard login flow**

```bash
cd web && pnpm dev
# Navigate to http://localhost:3100/dashboard → should show login
# Click sign in (requires NIP-07 extension like Alby)
# Should redirect to /dashboard with notes view
```

- [ ] **Step 7: Commit**

```bash
git add web/app/lib/nostr/use-nostr.tsx web/app/lib/nostr/use-notes.ts web/app/routes/_dashboard.tsx web/app/routes/_dashboard/login.tsx web/app/components/dashboard/app-layout.tsx
git commit -m "Add dashboard auth, layout, and login page"
```

---

## Task 16: Dashboard Notes Page

**Files:**

- Create: `web/app/routes/_dashboard/index.tsx`
- Create: `web/app/components/dashboard/note-list.tsx`
- Create: `web/app/components/dashboard/note-detail.tsx`
- Create: `web/app/components/dashboard/blob-image.tsx`

- [ ] **Step 1: Add markdown dependencies**

```bash
cd web && pnpm add react-markdown remark-gfm
```

- [ ] **Step 2: Port BlobImage component**

Port the `BlobImage` component from `comet-server/dashboard-ui/src/pages/notes.tsx`. Fetches encrypted blob from blossom URL, decrypts with `decryptBlob()`, caches via `URL.createObjectURL`. Extract into its own component file.

- [ ] **Step 3: Port note detail component**

Extract the note detail / markdown rendering from `comet-server/dashboard-ui/src/pages/notes.tsx` into `note-detail.tsx`. Renders markdown via `react-markdown` + `remark-gfm` with custom image handling for `attachment://` URLs.

- [ ] **Step 4: Port note list component**

Extract the infinite-scroll note list from `comet-server/dashboard-ui/src/pages/notes.tsx` into `note-list.tsx`. Uses IntersectionObserver for infinite scroll, renders `NoteListItem` cards.

- [ ] **Step 5: Create dashboard notes page**

`web/app/routes/_dashboard/index.tsx`:

Compose the note list and detail components into a two-pane layout. Use `useNotes()` hook for data. Selected note in local state. Auto-select first note on load.

Port the layout from `comet-server/dashboard-ui/src/pages/notes.tsx` — left pane (note list with scroll), right pane (note detail with markdown).

- [ ] **Step 6: Verify notes page renders**

```bash
cd web && pnpm dev
# Sign into dashboard with NIP-07 extension
# Should see notes list (if user has published notes) with infinite scroll
# Clicking a note should show markdown detail on the right
```

- [ ] **Step 7: Commit**

```bash
git add web/app/routes/_dashboard/index.tsx web/app/components/dashboard/
git commit -m "Add dashboard notes page with infinite scroll and markdown rendering"
```

---

## Task 17: Landing Page

**Files:**

- Modify: `web/app/routes/index.tsx`
- Create: `web/app/server/landing.ts`
- Create: `web/app/components/landing/hero.tsx`
- Create: `web/app/components/landing/features.tsx`

- [ ] **Step 1: Create landing page server function**

`web/app/server/landing.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { getLatestRelease, findAsset, type Release } from "./github";

export const getDownloads = createServerFn({ method: "GET" }).handler(
  async () => {
    const release = await getLatestRelease();
    if (!release) return { tag: null, downloads: {} };
    return {
      tag: release.tag,
      downloads: {
        macArm: findAsset(release.assets, "aarch64.dmg")?.url,
        macIntel: findAsset(release.assets, "x64.dmg")?.url,
        linuxAppImage: findAsset(release.assets, ".AppImage")?.url,
        linuxDeb: findAsset(release.assets, ".deb")?.url,
        linuxRpm: findAsset(release.assets, ".rpm")?.url,
      },
    };
  },
);
```

- [ ] **Step 2: Create hero component**

Port the hero section from `comet-server/src/landing/page.tsx`. Convert from Hono JSX to React. Includes: logo, tagline, version badge, download buttons (macOS ARM/Intel, Linux AppImage/deb/rpm). Download URLs come from the route loader data.

- [ ] **Step 3: Create features component**

Port the features grid from `comet-server/src/landing/page.tsx`. Four cards: local-first, markdown-native, Nostr publish, organization.

- [ ] **Step 4: Wire up the landing page route**

Replace the placeholder in `web/app/routes/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { getDownloads } from "@/server/landing";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";

export const Route = createFileRoute("/")({
  loader: () => getDownloads(),
  head: () => ({
    meta: [
      { title: "Comet — The best place to leave a trail" },
      {
        name: "description",
        content: "A desktop notes app. Local-first, markdown-native, beautifully simple.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { tag, downloads } = Route.useLoaderData();
  return (
    <div className="min-h-screen">
      <Hero tag={tag} downloads={downloads} />
      <Features />
    </div>
  );
}
```

- [ ] **Step 5: Add navigation header/footer**

Add a header with links to GitHub, Sign In (`/dashboard/login`), and an admin link. Add a footer matching the comet-server landing page.

- [ ] **Step 6: Verify landing page SSR**

```bash
cd web && pnpm dev
# Navigate to http://localhost:3100
# Should see landing page with download buttons
# View source → should see server-rendered HTML (SSR working)
```

- [ ] **Step 7: Commit**

```bash
git add web/app/routes/index.tsx web/app/server/landing.ts web/app/components/landing/
git commit -m "Add SSR landing page with GitHub release downloads"
```

---

## Task 18: Dockerfile + Deployment Config

**Files:**

- Create: `web/Dockerfile`
- Create: `web/fly.toml`
- Create: `web/.env.example`

- [ ] **Step 1: Create .env.example**

```
DATABASE_URL=postgres://user:pass@localhost:5432/comet
ADMIN_TOKEN=your-admin-token
# RELAY_URL is the HTTP URL for server-to-server calls (NOT the public wss:// URL)
RELAY_URL=http://localhost:3000
# BLOSSOM_URL is the HTTP URL for server-to-server calls
BLOSSOM_URL=http://localhost:3001
# VITE_RELAY_URL is the public WebSocket URL used by the dashboard client
VITE_RELAY_URL=wss://relay.example.com
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
COPY packages/data/package.json packages/data/
COPY packages/nostr/package.json packages/nostr/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=deps /app/packages/data/node_modules ./packages/data/node_modules
COPY --from=deps /app/packages/nostr/node_modules ./packages/nostr/node_modules
COPY web/ web/
COPY packages/ packages/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
WORKDIR /app/web
RUN pnpm build

FROM base AS runtime
COPY --from=build /app/web/.output .output
EXPOSE 3100
CMD ["node", ".output/server/index.mjs"]
```

Note: TanStack Start with Vinxi builds to `.output/` by default with the `node-server` preset. Verify the exact output path at build time.

- [ ] **Step 3: Create fly.toml**

```toml
app = "comet-web"
primary_region = "ord"

[build]

[http_service]
  internal_port = 3100
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/"
  timeout = "5s"
```

- [ ] **Step 4: Verify production build works locally**

```bash
cd web && pnpm build && pnpm start
# Verify http://localhost:3100 serves the landing page
```

- [ ] **Step 5: Commit**

```bash
git add web/Dockerfile web/fly.toml web/.env.example
git commit -m "Add Dockerfile and Fly.io config for web package"
```
