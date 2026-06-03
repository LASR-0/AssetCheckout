# AssetCheckout

A bridge between [Snipe-IT](https://snipeitapp.com/) and the people who request
hardware but shouldn't have direct access to your asset manager.

Snipe-IT is a capable open source asset manager, when AssetCheckout and Snipe-IT work
in conjunction with each other we can grant access where and when required, without
running the risk of over exposure of access to end users.

On top of that it keeps an audit trail of every request and its outcome, and is
designed to sync that trail to a company SharePoint list — so stakeholders in
other departments who need visibility of what was requested, approved, and
issued can read it without being granted any access to the admin tooling or to
Snipe-IT itself.

> **Status:** the SharePoint audit sync and email notifications are planned and
> partially scaffolded — see [Roadmap](#roadmap). Everything else described
> below is implemented.

## Features

- Standard and non-standard asset request types with category-based routing
- Approval workflow: pending → approved → completed (or rejected with reasoning)
- For non-standard requests: model search against existing Snipe-IT models, with the option to link an existing model or create a new one
- Asset details flow: companies, locations, statuses, tier, serial, and price — saved progressively, with partial-save support
- Tier-based price comparison against historical averages
- Per-category configuration: which categories are requestable, which standard models exist, which Snipe-IT status to assign to skeleton assets
- A background-job system for scheduled maintenance (cache refreshes, stale-request cleanup, orphaned-model cleanup, history retention) with manual triggering and a dry-run safety mode for destructive jobs
- Mobile-responsive UI (drawers on mobile, dialogs on desktop)
- Light and dark themes with theme-aware branding

## Tech stack

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Database:** SQLite via Prisma + `better-sqlite3`
- **UI:** shadcn/ui + base-ui Combobox + TanStack Table + Material Symbols
- **Monorepo:** pnpm workspaces (`@asset-checkout/backend`, `@asset-checkout/frontend`)

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/)
- A running [Snipe-IT](https://snipeitapp.com/) instance you can hit over HTTP
- A Snipe-IT service user with an API token (see [Snipe-IT bot setup](#snipe-it-bot-setup) below)
- **For production auth:** an authenticating reverse proxy in front of the app
  that injects the signed-in user's identity as HTTP headers. AssetCheckout does
  not authenticate users itself — it trusts an upstream proxy to do that. See
  [Authentication](#authentication) for the exact contract. [Caddy](https://caddyserver.com/)
  with any SSO/identity provider is the reference setup, but anything that can
  validate a session and inject the required headers will work.

## Setup

### 1. Install dependencies

From the repo root:

```bash
pnpm install
```

This installs dependencies for both `backend` and `frontend` workspaces in one step.

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env` with at minimum:

| Variable | Description |
|---|---|
| `SNIPEIT_API_URL` | Your Snipe-IT base URL, e.g. `https://snipe.example.com` |
| `SNIPEIT_BOT_TOKEN` | API token for the Snipe-IT service user |
| `ADMIN_EMAILS` | Comma-separated email addresses of users who should have admin access |
| `DATABASE_URL` | `file:./src/db/database.db` works for local dev |
| `NODE_ENV` | `development` or `production`. Gates dev authentication — see [Authentication](#authentication). |

Environment variables come in two distinct kinds, and the distinction matters:

- **Backend variables** (no prefix — `SNIPEIT_BOT_TOKEN`, `DATABASE_URL`,
  `NODE_ENV`, etc.) are read by the Node process at runtime, server-side only,
  and never reach the browser. **Secrets belong here.**
- **Frontend variables** (`VITE_`-prefixed) are baked into the static build at
  build time and are publicly visible in the shipped JavaScript. Use them only
  for non-secret, build-time configuration such as branding. **Never put a
  secret behind a `VITE_` variable** — it will ship to every browser. Changing
  one requires a rebuild.

Frontend env values cover branding (company name, logo paths, watermark images
for the 404/403 pages). Branding image paths point at files under
`frontend/public/branding/`, which Vite serves verbatim in both dev and
production. Copy `frontend/.env.example` to `frontend/.env` and adjust as needed.

### 3. Set up the database

```bash
pnpm --filter @asset-checkout/backend exec prisma generate
pnpm --filter @asset-checkout/backend exec prisma migrate dev
```

The database starts empty. Once the app is running, an admin user configures
requestable categories, standard models, and the skeleton asset status through
the in-app `/settings` page (see [Application settings](#application-settings)).
A seed script for demo data is planned for a future version.

### 4. Run the dev servers

Run both services together from the repo root:

```bash
pnpm dev
```

Or run them individually:

```bash
pnpm dev:backend
pnpm dev:frontend
```

## Running with Docker

A `docker-compose.yml` and `Dockerfile` are included for production deployments. The image builds the frontend, compiles the backend, and runs migrations on startup.

```bash
docker compose up --build
```

The app is served on port `3000`. Configure `backend/.env` before building — the compose file reads it via `env_file`. The database file is persisted to `/assetc/data` on the host via a volume mount.

> Ensure `NODE_ENV=production` is set in the environment the container runs with.
> This disables development authentication (see [Authentication](#authentication)).

## Authentication

AssetCheckout does not implement login, sessions, or an identity provider of its
own. Its entire authentication contract is one assumption:

> Every request that reaches the backend has already been authenticated by an
> upstream reverse proxy, which injects the signed-in user's identity as the
> `X-User-Email` and `X-User-Name` headers.

In other words, you place an authenticating proxy in front of the app. The
reference setup uses [Caddy](https://caddyserver.com/): Caddy validates the
user's SSO session against whatever identity provider you run, and on success
forwards the request to AssetCheckout with the user's email and name injected as
those two headers. Any proxy/SSO combination that can do this works — the app
only cares that the headers arrive and that users cannot set them themselves
(your proxy must strip any client-supplied `X-User-*` headers before injecting
its own).

From those headers the backend derives identity and role:

- **Admin** — the `X-User-Email` matches an entry in the `ADMIN_EMAILS`
  environment variable. Keyed on email so it survives display-name changes.
- **Manager** — the `X-User-Name` appears as the `manager` on at least one
  existing request.
- **Requester** — the `X-User-Name` appears as the `userName` on at least one
  existing request.
- Otherwise, no access.

### Development authentication

Standing up a full SSO proxy just to develop locally would be painful, so in
development the app provides an impersonation shortcut:

- When `NODE_ENV=development`, a **DevAuthToggle** in the settings (/settings)
 lets you set
  `x-dev-user-name` / `x-dev-user-email` headers (stored in `localStorage`),
  effectively impersonating any user so you can exercise the different roles
  without real SSO.
- The frontend toggle is gated on the build mode and is not rendered in a
  production build.
- **More importantly, the backend refuses to honour the `x-dev-user-*` headers
  unless `NODE_ENV === "development"`.** Outside development, those headers are
  ignored entirely and only the proxy-injected `X-User-*` headers are trusted.
  The check fails closed: anything other than `NODE_ENV=development` (including
  an unset value) is treated as production. This means the dev impersonation
  mechanism cannot be abused in production even though the code path still
  exists.

So for local development you set `NODE_ENV=development` and use the toggle; for
production you set `NODE_ENV=production` and the only source of identity is your
proxy.

## Snipe-IT bot setup

Create a Snipe-IT user with API access, generate a token from their profile
page, and paste it into `backend/.env` as `SNIPEIT_BOT_TOKEN`.

The bot acts on Snipe-IT entirely through this token, so it needs permissions
covering every operation the app performs. The matrix below lists the Snipe-IT
permission categories the app touches against the action levels it needs.

| Category | View | Create | Edit | Delete | Checkout | Can Manage |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Assets (Hardware) | ✅ | ✅ | ✅ | – | ✅ | – |
| Models | ✅ | ✅ | – | ✅ | – | – |
| Manufacturers | ✅ | ✅ | – | – | – | – |
| Categories | ✅ | – | – | – | – | – |
| Status Labels | ✅ | – | – | – | – | – |
| Custom Fields | ✅ | – | – | – | – | – |
| Companies | ✅ | – | – | – | – | – |
| Locations | ✅ | – | – | – | – | – |
| Users | ✅ | – | – | – | – | – |
| API Tokens | – | – | – | – | – | ✅ |

### The Tier custom field

AssetCheckout relies on a Snipe-IT **custom field named "Tier"** to band assets
by specification (for example Standard / Service / Pro). The allowed Tier values
are read live from your Snipe-IT custom-field configuration — the app does not
define them itself. The Tier field is central to how assets are matched and
checked out, so see [Common configuration issues](#common-configuration-issues)
for the failure modes when it's missing.

> A detailed walkthrough with screenshots is planned for a future revision —
> see `docs/` once available.

## How it works

### The request lifecycle

A request moves through a small state machine. Standard and non-standard
requests share the same outer states but diverge in how they're fulfilled.

**Outer states (the `Request`):**

- **PENDING** — a user has submitted a request; it's awaiting a manager's
  decision.
- **APPROVED** — a manager (or admin) has approved it. For standard requests
  this is usually transient (the asset is assigned immediately and the request
  goes straight to COMPLETED). For non-standard requests, APPROVED means the
  request now has work to do before it can complete.
- **COMPLETED** — an asset has been checked out to the user. Terminal.
- **REJECTED** — the request was declined (by a person, or automatically by the
  stale-request cleanup job). Carries a reason. Terminal.

**Standard requests** are for hardware you stock and have pre-configured as a
"standard model" for its category. On approval, the app finds an available asset
of the configured primary model (or the backup, or — if neither is configured —
any model in the category with availability), checks it out to the user, and the
request completes in a single step.

**Non-standard requests** are for hardware that has to be sourced or modelled
specifically. They go through additional sub-steps tracked on a child
`ModelRequest` record:

1. **Manager approval** creates the `ModelRequest` (status PENDING) alongside
   the approved request.
2. **Admin approval** advances the `ModelRequest` to APPROVED.
3. **Model creation** — the admin either links an existing Snipe-IT model or
   creates a new one. Creating a new one also creates a barebones "skeleton"
   asset in Snipe-IT. The `ModelRequest` reaches COMPLETED and is linked to that
   asset.
4. **Asset details** — the admin fills in the asset's company, location, status,
   serial, tier, and price (saved progressively; partial saves are allowed).
   When all required fields are present, the asset is marked ready.
5. **Complete** — the now-complete asset is checked out to the user and the
   request reaches COMPLETED.

If a non-standard request is rejected at any point before completion, any
skeleton asset already created in Snipe-IT is intentionally left in place rather
than auto-deleted (it may still be useful). Cleaning that up is handled
separately — see the orphaned-model cleanup job in [Background jobs](#background-jobs).

## Application settings

All runtime configuration lives in the in-app `/settings` page (admin-only) and
is persisted in the `Setting` table — not in environment variables — so admins
can change it without a redeploy. The settings system seeds sensible defaults on
first run; admin changes are never overwritten by subsequent deploys.

The settings page is organised into sections: Appearance (theme), Asset
Configuration (requestable categories and standard models), Snipe-IT
Configuration (skeleton asset status), and Background Jobs (manual triggering and
job history). See [Database](#database) and [`docs/DATABASE.md`](docs/DATABASE.md)
for the full catalogue of setting keys.

### Requestable categories

By default every Snipe-IT asset category is requestable. You can restrict the set
to a chosen list — useful for hiding categories that shouldn't be
self-requestable (printers, networking gear, etc.). An empty list means "all
categories allowed."

> 🚧 **UI walkthrough pending.** Step-by-step instructions for the requestable-
> categories selector will be added once finalised.

### Standard models

A "standard model" is a model you've designated as the default issue for a
category — for example, the standard laptop everyone gets. You configure a
**primary** and optional **backup** model per category. On a standard request,
the app tries the primary first, then the backup.

For a model to be usable as a standard (and for it to be assignable on approval),
the underlying assets must satisfy the same conditions the checkout flow
enforces:

- **At least one available asset** — an asset whose status is "Ready to Deploy"
  and that is not currently checked out to anyone.
- **A non-empty Tier value** on that asset — assets without a Tier are invisible
  to the matching logic (see [Common configuration issues](#common-configuration-issues)).

> 🚧 **UI walkthrough pending.** Step-by-step instructions for the standard-
> models selector will be added once finalised.

### Skeleton asset status

When the app creates a new model for a non-standard request, it also creates a
barebones "skeleton" asset. That asset needs a Snipe-IT status. You can configure
which status to use; if left unset, the app falls back to looking up a status
named "Pending" in Snipe-IT. If neither is available, model creation fails with a
message pointing back to this setting.

> 🚧 **UI walkthrough pending.**

## Common configuration issues

Most problems with AssetCheckout trace back to Snipe-IT data not matching what
the matching logic expects. The recurring ones:

**Assets without a Tier value are invisible.** The checkout/matching logic
requires every candidate asset to have a non-empty Tier custom field. An asset
that is otherwise available but has no Tier set will never be selected, and a
standard request can fail with "no available assets" even though assets appear to
exist in Snipe-IT. Fix: ensure assets have a Tier assigned.

**Model search won't find a model during non-standard model creation.** When an
admin searches for an existing model to link, the search deliberately excludes
several things, any of which can make an expected model "disappear" from results:

- Models with **no available asset** (nothing Ready-to-Deploy and unassigned) are
  excluded — the search only surfaces models you could actually fulfil from.
- Models whose available assets have **no Tier value** are excluded, for the same
  reason as above.
- Models configured as a **standard** (primary or backup for the category) are
  excluded. The model-creation flow is for *non-standard* devices, so standards
  are intentionally hidden from it. If you search for a model that you've set as
  a standard, it will not appear — this is by design, not a bug.

**Creating a new model fails in a category with no existing models.** New models
inherit their Snipe-IT *fieldset* (which defines custom fields, including Tier)
from a sibling model in the same category. If a category has no models yet, the
app can't infer the fieldset and model creation fails. Fix: create at least one
model in that category manually in Snipe-IT first.

**Model creation fails with no skeleton status.** If no skeleton status is
configured in settings and Snipe-IT has no status named "Pending" to fall back
to, creating a skeleton asset fails. Fix: set a skeleton status in Snipe-IT
Configuration (see [Application settings](#application-settings)).

## Background jobs

AssetCheckout runs an in-process background-job system for scheduled maintenance
and (in future) event-driven work like notifications. Jobs are recorded in the
`BackgroundJob` table, which doubles as a live queue and a history log visible in
the Background Jobs settings section.

A single-worker poll runner picks up pending jobs one at a time; a cron scheduler
enqueues recurring jobs on configurable schedules. Failed jobs retry with
exponential backoff, except for "one-shot" jobs (cache refreshes and cleanups)
which fail once rather than retrying — they'll simply run again on their next
scheduled tick.

### Current jobs

| Job | Purpose | Schedule (default) | Manually triggerable |
|---|---|---|:---:|
| Refresh Categories Cache | Re-fetch the Snipe-IT category list | Hourly | ✅ |
| Refresh Prices Cache | Re-fetch the hardware list used for price averages | Every 10 minutes | ✅ |
| Cleanup Stale Requests | Auto-reject non-terminal requests with no activity past a configurable window | Daily | ✅ |
| Cleanup Orphan Snipe Models | Delete models whose skeleton asset was removed out-of-band, and reject the stranded request | Weekly | ✅ |
| Purge Old Job History | Delete completed/failed job rows past the retention window | Daily | ✅ |
| Send Request Notification | Notify the relevant party when a request changes state | — (event-driven) | ❌ |
| Sync Request to SharePoint | Push request audit data to a SharePoint list | — (event-driven) | ❌ |

> **Status:** the last two (notifications and SharePoint sync) are planned and
> scaffolded but not yet implemented — see [Roadmap](#roadmap).

### Manual vs event-driven jobs

Maintenance jobs can be triggered on demand from the Background Jobs settings
section ("Run now"), in addition to running on their schedule. A manual trigger
respects the same retry policy as the scheduled run.

The notification and SharePoint-sync jobs are deliberately **not** manually
triggerable. They aren't periodic maintenance — they're meant to fire in
response to specific request events (a request being created, approved,
completed, etc.) and to carry the context of that specific event. A "run now"
button for them would have nothing meaningful to act on, so they're excluded from
the manual-trigger allow-list and are enqueued by the application flow instead.

### Destructive jobs and dry-run mode

The orphaned-model cleanup job deletes models from Snipe-IT, so it ships with
guard rails: a **dry-run mode** (on by default) that reports what it *would*
delete without deleting anything, a per-run cap on deletions, and a full audit of
every action in the job's result summary. Review a dry-run result before
disabling dry-run mode for real deletion. The Background Jobs UI shows a
green "Dry-run" / red "Live" badge so the current mode is visible before you
trigger it.

### Scheduling and adding your own jobs

**Changing a schedule.** Each scheduled job's cron expression lives in the
`Setting` table under a `jobs.*Cron` key (e.g. `jobs.purgeHistoryCron`). Change
the value to a new cron expression to reschedule it. **Schedules are registered
once at startup, so a change takes effect after an app restart**

**Adding a new recurring job.** The job system is small and explicit; to add your
own:

**Adding a new recurring job.** The job system is small and explicit. The
following walks through adding a hypothetical `REFRESH_USERS_CACHE` job that runs
on a schedule; adapt the names to your job.

**1. Write the handler** — an async function under
`backend/src/jobs/handlers/`. It does the work and returns a summary object that
gets stored (JSON-encoded) in the job's `resultSummary`. Throwing marks the job
failed.

```typescript
// backend/src/jobs/handlers/refreshUsersCache.ts
import { refreshUsersCache } from "../../services/snipeit.js";

export async function refreshUsersCacheHandler(): Promise<Record<string, unknown>> {
  const count = await refreshUsersCache();
  return { refreshed: count };
}
```

**2. Add the job type** to the `JobType` enum in the Prisma schema, then migrate
and regenerate the client (the custom client output path means `generate` must
run separately after `migrate`):

```prisma
// backend/prisma/schema.prisma
enum JobType {
  // ...existing types...
  REFRESH_USERS_CACHE
}
```

```bash
pnpm --filter @asset-checkout/backend exec prisma migrate dev --name add_refresh_users_cache
pnpm --filter @asset-checkout/backend exec prisma generate
```

**3. Register the handler** in `backend/src/jobs/index.ts` so the runner can
resolve the type to a function:

```typescript
import { refreshUsersCacheHandler } from "./handlers/refreshUsersCache.js";

// inside startJobs(), alongside the other registerHandler calls:
registerHandler("REFRESH_USERS_CACHE", refreshUsersCacheHandler);
```

**4. Seed a schedule setting** in `ensureDefaults`
(`backend/src/services/settings.ts`), so the cron expression is configurable and
admin-editable like the others:

```typescript
{
  key: "jobs.refreshUsersCron",
  envVar: "JOBS_REFRESH_USERS_CRON",
  defaultValue: "*/30 * * * *", // every 30 minutes
  description: "Cron expression for refreshing the Snipe users cache.",
},
```

**5. Wire it into the scheduler** by adding an entry to `SCHEDULE_KEYS` in
`backend/src/jobs/scheduler.ts`, mapping the settings key to the job type:

```typescript
const SCHEDULE_KEYS: Record<string, JobType> = {
  // ...existing entries...
  "jobs.refreshUsersCron": "REFRESH_USERS_CACHE",
};
```

**6. (Optional) Set the retry policy.** If the job shouldn't retry on failure —
true for most periodic jobs, since they'll run again next tick — add it to
`ONE_SHOT_JOBS` in `backend/src/jobs/policy.ts`:

```typescript
export const ONE_SHOT_JOBS: Set<JobType> = new Set([
  // ...existing one-shots...
  "REFRESH_USERS_CACHE",
]);
```

To make it manually triggerable from the settings UI, also add it to the
`MANUALLY_TRIGGERABLE` allow-list in `backend/src/routes/jobsRoutes.ts`.

**7. Rebuild and restart.** Schedules are registered once at startup, so the new
job (and any schedule change) only takes effect after a restart.

## Database

AssetCheckout uses SQLite via Prisma. There are four tables:

| Table | Purpose |
|---|---|
| `Request` | A user's hardware request and its lifecycle state (see [How it works](#how-it-works)). |
| `ModelRequest` | Child of a non-standard `Request`; tracks the model-creation and asset-detail sub-flow. |
| `Setting` | Key/value runtime configuration set via the admin UI (categories, standard models, job schedules, etc.). |
| `BackgroundJob` | The background-job queue and history log. |

For a detailed field-by-field walkthrough of each table — and the full catalogue
of `Setting` keys with their defaults and meanings — see
[`docs/DATABASE.md`](docs/DATABASE.md).

## Resetting the database

```bash
pnpm --filter @asset-checkout/backend exec prisma migrate reset
```

This wipes everything, including the in-app settings — you'll need to reconfigure categories, standard models, and the skeleton status afterwards.

## Roadmap

- **Email notifications** — an SMTP-backed notification service and the
  `SEND_REQUEST_NOTIFICATION` job, firing on request state changes.
- **SharePoint audit sync** — the `SYNC_REQUEST_TO_SHAREPOINT` job, pushing
  request audit data to a SharePoint list (via a Power Automate mailbox trigger)
  for read-only stakeholders.
- **Seed script** — demo/starter data for fresh installs.
- **Expanded documentation** — Snipe-IT bot setup walkthrough with screenshots,
  settings UI walkthroughs.

> 🚧 This section will be expanded as features land.