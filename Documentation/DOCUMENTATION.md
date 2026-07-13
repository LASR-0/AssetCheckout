# AssetCheckout — Documentation

In-depth reference for how AssetCheckout works, how to configure it, and how its
data is structured. For getting it running locally, see the root
[README](../README.md); for production deployment, see [DEPLOYMENT](DEPLOYMENT.md).

## Contents

- [How it works](#how-it-works)
- [Authentication](#authentication)
- [Snipe-IT bot setup](#snipe-it-bot-setup)
- [The Tier custom field](#the-tier-custom-field)
- [Application settings](#application-settings)
- [Common configuration issues](#common-configuration-issues)
- [Email and notifications](#email-and-notifications)
- [Background jobs](#background-jobs)
- [SharePoint sync](#sharepoint-sync)
- [Feedback](#feedback)
- [Integrations](#integrations)
- [Database](#database)

---

## How it works

### The request lifecycle

A request moves through a small state machine. Standard and non-standard
requests share the same outer states and the same **two-stage sign-off**
(manager first, then IT admin), but diverge in how they're fulfilled after
that.

**Outer states (the `Request`):**

- **PENDING** — a user has submitted a request; it's awaiting the nominated
  manager's decision.
- **APPROVED** — the manager has approved it. Both request types now wait on
  IT admin sign-off: for standard requests the admin's approval *is* the
  fulfilment step; for non-standard requests it unlocks the model-creation
  sub-flow.
- **COMPLETED** — an asset has been checked out to the user. Terminal for the
  outer state machine, but not the end of the story: a completed request then
  moves through the [shipping or collection flow](#shipping-and-collection)
  until the device is in the user's hands.
- **REJECTED** — the request was declined (by a person, or automatically by
  the stale-request cleanup job). Carries a reason. Terminal. The requester is
  notified either way.

**Standard requests** are for hardware you stock and have pre-configured as a
"standard model" for its category:

1. **Manager approval** records the decision and moves the request to
   APPROVED. Nothing is assigned yet.
2. **IT admin approval** performs fulfilment in one step: the app finds an
   available asset of the configured primary model (or the backup, or — if
   neither is configured — any model in the category with availability),
   compares the user's and the asset's locations to decide
   [ship vs collect](#shipping-and-collection), checks the asset out to the
   user, and the request reaches COMPLETED.

**Non-standard requests** are for hardware that has to be sourced or modelled
specifically. They go through additional sub-steps tracked on a child
`ModelRequest` record:

1. **Manager approval** creates the `ModelRequest` (status PENDING) alongside
   the approved request — atomically, so a failed write can never leave an
   approved request with no `ModelRequest` to drive the rest of the flow.
2. **Admin approval** advances the `ModelRequest` to APPROVED.
3. **Model creation** — the admin either links an existing Snipe-IT model or
   creates a new one:
   - **Linking a model with available stock** links the request straight to an
     available asset. If that asset already has all required fields populated
     in Snipe-IT, the asset-details step is skipped entirely.
   - **Linking a model with no available stock** (the UI flags this — it's a
     deliberate choice, e.g. stock is on order) creates a barebones "skeleton"
     asset under that existing model rather than duplicating the model.
   - **Creating a new model** creates the model and a skeleton asset under it.
     If the skeleton-asset creation fails after the model was created, the
     model is rolled back so Snipe-IT doesn't accumulate orphans.
4. **Asset details** — the admin fills in the asset's company, location,
   status, serial, tier, and price (saved progressively; partial saves are
   allowed).
5. **Auto-fulfilment** — there is no separate "Complete" step. The
   asset-details submit that makes the asset complete triggers fulfilment
   automatically: the app reads the device's location (*before* checkout,
   since checkout overwrites it), checks the asset out to the user, computes
   ship-vs-collect, and the request reaches COMPLETED.

If a non-standard request is rejected at any point before completion, any
skeleton asset already created in Snipe-IT is intentionally left in place
rather than auto-deleted (it may still be useful). Cleaning that up is handled
separately — see the orphaned-model cleanup job in
[Background jobs](#background-jobs).

### Phone-request options

Requests for phone-type categories carry additional option fields captured at
submission:

- **`callText`** — the user needs call/text capability. Setting it forces
  `needsData` on.
- **`needsData`** — the device needs a data plan.
- **`numberOption`** — what happens with the phone number: `NEW` (provision a
  new number), `REUSE` (keep an existing one), or `NONE`.
- **`reuseNumberFromEmail` / `reuseNumberPhone`** — when reusing, the email
  identifying whose number is being reused, and a snapshot of that resolved
  number at request time. Number resolution against Snipe-IT user records is
  governed by the [mobile number recognition](#mobile-number-recognition)
  settings.

> The legacy `newNumber` boolean still exists in the schema but is superseded
> by `numberOption` and is expected to be removed once the frontend no longer
> reads it.

### Shipping and collection

Completion answers "who gets which asset" — but not "how does it physically
reach them." At the moment of checkout, the app compares the **user's
location** in Snipe-IT against the **device's location**:

| User location | Device location | Outcome |
|---|---|---|
| Known | Known, **different** | `needsShipping = true` — shipping path |
| Known | Known, **same** | `needsShipping = false` — collection path |
| Either missing | — | `locationMissing = true`, `needsShipping = false` — defaults to the collection path, flagged for the admin |

The unknown-location default is deliberate: rather than guessing a shipping
destination, the request lands on the collection path with a visible
`locationMissing` flag so an admin can resolve it with the requester directly.

**The shipping path:**

1. An admin marks the request **shipped** (optionally recording a tracking
   code and/or tracking URL). Valid only once, and only on a completed
   shipping-path request. Stamps `shippedAt` and emails the requester —
   including tracking details and the configurable delivery estimate
   (`shipping_estimate_days`).
2. The requester (or an admin on their behalf) marks the device **received**,
   stamping `receivedAt`. A shipped-path request cannot be received before it
   has been shipped.
3. If a shipped device is *not* marked received, an escalating reminder
   sequence kicks in — see
   [Shipment reminders](#shipment-reminders-and-escalation).

**The collection path:**

1. An admin marks the request **ready for collection** (stamps
   `collectionReadyAt` and emails the requester).
2. The requester collects the device and marks it collected (stored in the
   same `receivedAt` field).

Marking a device received/collected also tells the UI whether to show the
[feedback](#feedback) nudge, gated on the `feedback_enabled` setting.

> 🚧 **Stub — approve-from-email.** Approving a request directly from the
> notification email is under evaluation: the preferred route is Outlook
> **actionable messages** (requires tenant-level enablement); the fallback is
> an in-app confirmation page the email links to. This section will be
> completed once the path is confirmed.

---

## Authentication

AssetCheckout has two distinct authentication paths: **humans** authenticate
via an upstream reverse proxy, and **machines** (external integrations)
authenticate via a shared API token. They are entirely separate mechanisms.

### Human users: proxy-injected identity

AssetCheckout does not implement login, sessions, or an identity provider of
its own. Its entire human-auth contract is one assumption:

> Every request that reaches the backend has already been authenticated by an
> upstream reverse proxy, which injects the signed-in user's identity as the
> `X-User-Email` and `X-User-Name` headers.

You place an authenticating proxy in front of the app. The proxy validates the
user's session against whatever SSO/identity provider you run and, on success,
forwards the request to AssetCheckout with the user's email and name injected
as those two headers. Any proxy/SSO combination that can do this works; see
[DEPLOYMENT](DEPLOYMENT.md) for the recommended forward-auth setup with Caddy.

> **The proxy must strip any client-supplied `X-User-*` headers before
> injecting its own.** Otherwise a user can forge them and impersonate anyone,
> including an admin. This is the single most important detail of the auth
> model.

From those headers the backend derives identity and role:

- **Admin** — the `X-User-Email` matches an entry in the `ADMIN_EMAILS`
  environment variable. Keyed on email so it survives display-name changes.
- **Manager** — the `X-User-Name` appears as the `manager` on at least one
  existing request. (Requests also store a `managerId` — the manager's
  Snipe-IT user ID — but that is used for notification and sync lookups, not
  role resolution.)
- **Requester** — the `X-User-Name` appears as the `userName` on at least one
  existing request.
- Otherwise, no access (the user is shown a "no access" page).

Note that role resolution happens *after* authentication: a user with no role
is an authenticated person who simply has no access to this tool, not someone
who failed to log in — login is the proxy's responsibility, upstream of the
app.

### Machine-to-machine: API token

External systems (see [Integrations](#integrations)) don't carry an SSO
session, so the `/api/integrations/*` routes authenticate differently: a
shared secret supplied in the **`X-API-Key`** header, validated against the
`HRT_API_KEY` environment variable.

- If `HRT_API_KEY` is unset, the integration endpoints respond `503` — the
  integration is effectively disabled until configured.
- A missing or non-matching key responds `401`.
- The token is the **sole guard** on these routes — keep the endpoint on the
  internal network, and treat the key like a password (generate it with
  something like `openssl rand -hex 32`).

This path deliberately bypasses the forward-auth identity model: the calling
service is responsible for supplying valid Snipe-IT identities in its payloads
where required.

### Development authentication

Standing up a full SSO proxy just to develop locally would be painful, so in
development the app provides an impersonation shortcut:

- When `NODE_ENV=development`, a **DevAuthToggle** in the settings page lets
  you set `x-dev-user-name` / `x-dev-user-email` headers (stored in
  `localStorage`), impersonating any user so you can exercise the different
  roles without real SSO.
- The frontend toggle is gated on the build mode and is not rendered in a
  production build.
- The dev path uses the `ADMIN_NAMES` environment variable (comma-separated
  display names) to recognise admins, since impersonation is name-driven —
  production admin resolution uses `ADMIN_EMAILS` only, keyed on the
  proxy-verified email.
- **The backend refuses to honour the `x-dev-user-*` headers unless
  `NODE_ENV === "development"`.** Outside development those headers are
  ignored entirely and only the proxy-injected `X-User-*` headers are trusted.
  The check fails closed: anything other than `NODE_ENV=development`
  (including an unset value) is treated as production. The dev impersonation
  mechanism therefore cannot be abused in production even though the code path
  still exists.

---

## Snipe-IT bot setup

AssetCheckout acts on Snipe-IT through a service user's API token. Without it,
the app can't read or write Snipe-IT data and will show connection errors, so
this is required even for a local run to be meaningful.

Create a Snipe-IT user with API access, generate a token from their profile
page, and set it as `SNIPEIT_BOT_TOKEN`. The bot needs the following Snipe-IT
permissions — the rows are the operations AssetCheckout performs against each
permission category:

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

Asset **checkout** is a distinct capability in Snipe-IT from editing an asset —
ensure the bot can check out hardware.

---

## The Tier custom field

AssetCheckout relies on a Snipe-IT **custom field named "Tier"** to band assets
by specification (for example Standard / Service / Pro). The allowed Tier values
are read live from your Snipe-IT custom-field configuration — the app does not
define them itself. The Tier field is central to how assets are matched and
checked out, and assets without a Tier value are invisible to the matching logic
(see [Common configuration issues](#common-configuration-issues)).

### Finding Custom Fields in Snipe-IT

![Navigating to custom fields in Snipe-IT](Photos/Tier_navigation.png)

### Example Tier field setup
Once you are in CustomFields, you will want to add a new custom field, orange plus icon under custom fields (do not get confused with field sets).

The Tier field should be configured as a custom field with the spec bands you
want to use as its values, then included in the fieldset(s) attached to the
models you manage through AssetCheckout.

Once you have configured the Tier custom Field, you should make a fieldSet for your assets that should have the custom Tier field and add the asset models to the fieldSet.

![Example Tier custom field configuration](Photos/Tier_Setup_Example.png)

---

## Application settings

All runtime configuration lives in the in-app `/settings` page (admin-only) and
is persisted in the `Setting` table — not in environment variables — so admins
can change it without a redeploy.

**Seeding.** On startup, every known setting is upserted by `ensureDefaults()`:
if no row exists it's created from the matching environment variable (or a
hardcoded default when the env var is unset); if a row already exists, only its
`description` is refreshed and the **value is never overwritten**.
Admin-configured values survive deploys; env-var changes only affect fresh
installs. Env-seeded values for the structured settings (requestable
categories, standard models) pass through a normalisation hook — the
categories accept either JSON (`[1,2,5]`) or comma-separated (`1, 2, 5`) input,
and an invalid env value falls back to the default with a startup warning
rather than seeding garbage.

### Requestable categories

By default every Snipe-IT asset category is requestable. You can restrict the
set to a chosen list — useful for hiding categories that shouldn't be
self-requestable (printers, networking gear, etc.). An empty list means "all
categories allowed."

![Configuring requestable device categories](Photos/Configure_Device_Categories.png)

### Standard models (standard devices)

A "standard model" is a model you've designated as the default issue for a
category — for example, the standard laptop everyone gets. You configure a
**primary** and optional **backup** model per category. On a standard request,
the app tries the primary first, then the backup.

For a model to be usable as a standard (and assignable at admin approval), its
underlying assets must satisfy the same conditions the checkout flow enforces:

- **At least one available asset** — status "Ready to Deploy" and not currently
  checked out.
- **A non-empty Tier value** on that asset — assets without a Tier are invisible
  to the matching logic.

![Configuring standard devices](Photos/Configure_Standard_Devices.png)

### Skeleton asset status

When the app creates a skeleton asset for a non-standard request (either under
a newly-created model, or under an existing model chosen with no available
stock), that asset needs a Snipe-IT status. You can configure which status to
use; if left unset, the app falls back to a status named "Pending". If neither
is available, model creation fails with a message pointing back to this
setting.

![Configuring the skeleton asset status](Photos/Configure_Skeleton_Status.png)

### Mobile number recognition

The reuse-a-number flow needs to tell mobile numbers apart from landlines when
resolving a user's number from Snipe-IT (which stores both a Phone and a
Mobile field). What counts as "a mobile" is region-specific, so it's
configurable:

- **Country code** (`mobile_country_code`) — the international calling code,
  digits only. Default `61` (Australia).
- **Mobile leading digit** (`mobile_leading_digit`) — the first digit after
  the prefix that marks a number as mobile. Default `4` (Australian mobiles
  are `+61 4xx…` / `04xx…`).

A number is recognised as a mobile when it matches `+{code}{digit}…` or
`0{digit}…`. Both values are validated independently on read and fall back to
the Australian defaults if a stored value is empty or malformed — a bad row can
never break number resolution.

### Shipping and reminder settings

- **`shipping_estimate_days`** (default `5`) — the delivery estimate quoted in
  the "your device has shipped" email.
- **`reminder_days_1` / `reminder_days_2` / `reminder_days_3`** (defaults
  `7` / `14` / `30`) — the escalation thresholds for shipped-but-unreceived
  devices. See
  [Shipment reminders](#shipment-reminders-and-escalation).

### Feature toggles

- **`feedback_enabled`** (default `true`) — whether the anonymous
  [feedback](#feedback) feature is active (page, post-receipt nudge, and
  landing CTA).
- **`sharepoint_sync_enabled`** (default `false`) — whether the nightly
  [SharePoint sync](#sharepoint-sync) runs. Off by default; enable it once the
  receiving mailbox and Power Automate flow are live.

---

## Common configuration issues

Most problems trace back to Snipe-IT data not matching what the matching logic
expects. The recurring ones:

**Assets without a Tier value are invisible.** The checkout/matching logic
requires every candidate asset to have a non-empty Tier custom field. An asset
that is otherwise available but has no Tier set will never be selected, and a
standard request can fail with "no available assets" even though assets appear
to exist in Snipe-IT. Fix: ensure assets have a Tier assigned.

**Model search won't find a model during non-standard model creation.** When an
admin searches for an existing model to link, the search deliberately excludes
several things, any of which can make an expected model "disappear" from
results:

- Models with **no available asset** (nothing Ready-to-Deploy and unassigned)
  are excluded — the search only surfaces models you could actually fulfil
  from.
- Models whose available assets have **no Tier value** are excluded.
- Models configured as a **standard** (primary or backup for the category) are
  excluded. The model-creation flow is for *non-standard* devices, so standards
  are intentionally hidden from it. If you search for a model you've set as a
  standard, it will not appear — this is by design, not a bug.

**Creating a new model fails in a category with no existing models.** New
models inherit their Snipe-IT *fieldset* (which defines custom fields,
including Tier) from a sibling model in the same category. If a category has no
models yet, the app can't infer the fieldset and model creation fails. Fix:
create at least one model in that category manually in Snipe-IT first.

**Model creation fails with no skeleton status.** If no skeleton status is
configured and Snipe-IT has no status named "Pending" to fall back to, creating
a skeleton asset fails. Fix: set a skeleton status in the settings page.

**Emails aren't being sent.** Notification jobs show as Failed in the
Background Jobs history when SMTP is unconfigured or the relay is unreachable.
Check that `SMTP_HOST` and `SMTP_FROM` are set in the backend environment and
that the app host can reach the relay. Missing *recipient* emails behave
differently: a notification with no resolvable recipient is skipped (the job
Completes with a skip summary) rather than failed, since retrying wouldn't
help.

---

## Email and notifications

AssetCheckout emails people when their request changes state, when their device
ships or is ready to collect, and when a shipped device goes unacknowledged.
It also uses email as the [SharePoint sync](#sharepoint-sync) transport. All
sending flows through one place.

### The SMTP transport

A single pooled Nodemailer transporter pointed at your SMTP relay.
Configuration is **environment-only** — this is infrastructure, not runtime
settings:

| Variable | Meaning |
|---|---|
| `SMTP_HOST` | Relay hostname. Required for email to be considered configured. |
| `SMTP_PORT` | Relay port. Default `587`. |
| `SMTP_USER` / `SMTP_PASS` | Optional LOGIN credentials (a service account). Leave **both** unset for an IP-allowlisted anonymous relay. |
| `SMTP_FROM` | The sender address. Required. |
| `APP_BASE_URL` | The app's public base URL — used to build the links and buttons inside notification emails. |

Transport behaviour worth knowing:

- **STARTTLS is enforced.** The transporter connects plain on port 587 and
  upgrades (`secure: false` + `requireTLS: true`) — if the TLS upgrade fails,
  it refuses to send rather than continuing unencrypted.
- **Certificate validation is disabled** (`rejectUnauthorized: false`). This is
  a deliberate choice for an *internal* relay whose certificate chain isn't
  trusted by every host: traffic to the relay is still encrypted end-to-end,
  but the relay's certificate identity is not verified. Do not point this
  transport at an untrusted network path.
- **Email is optional.** If `SMTP_HOST`/`SMTP_FROM` are unset, the app runs
  normally — notification and sync jobs fail (visibly, in the job history)
  when they try to send, but nothing else is affected.

### Notification kinds

Notifications are sent by a background job (`SEND_REQUEST_NOTIFICATION`), not
inline: after a state transition commits, the app enqueues a notification job
fire-and-forget — an enqueue failure is logged but **never breaks the
transition the user just performed**. The job later loads the request fresh
and renders the email.

Every email is built as **plain text + HTML** together. The HTML templates use
table layout and inline styles for Outlook compatibility, with a bulletproof
CTA button and a plain-text fallback for clients that strip HTML.

| Kind | Recipient | Fired when |
|---|---|---|
| `MANAGER_APPROVAL_NEEDED` | The nominated manager | A request is created. |
| `ADMIN_APPROVAL_NEEDED` | All `ADMIN_EMAILS` | A manager approves (standard or non-standard). |
| `DEVICE_ASSIGNED` | The requester | The asset is checked out and the request completes — at admin approval (standard) or the completing asset-details submit (non-standard). |
| `DEVICE_SHIPPED` | The requester | An admin marks the request shipped. Includes tracking code/URL when recorded and the `shipping_estimate_days` estimate. |
| `DEVICE_READY_FOR_COLLECTION` | The requester | An admin marks the request ready for collection. |
| `REQUEST_REJECTED` | The requester | The request is rejected — by a person or an automated cleanup job. Includes the rejection reason. |
| `SHIPMENT_REMINDER` | The requester | Reminder stages 1–2 (see below). |
| `SHIPMENT_OVERDUE` | The requester **and** all admins | Reminder stage 3 (see below). |

**Skip vs fail.** The handler distinguishes conditions a retry can't fix from
transient ones:

- No resolvable recipient email, request not found, or a malformed payload →
  the job **Completes with a skip summary** (retrying would change nothing).
- The actual send throws (relay down, TLS failure, transient error) → the job
  is marked **Failed** and retried with backoff.

### Shipment reminders and escalation

A daily job (`REMIND_SHIPPED_REQUESTS`, default 10am) scans completed requests
that have been **shipped but not marked received** and escalates through three
stages, with thresholds measured in whole days since `shippedAt`:

| Stage | Threshold setting | Default | What happens |
|---|---|---|---|
| 1 | `reminder_days_1` | 7 days | `SHIPMENT_REMINDER` to the requester. |
| 2 | `reminder_days_2` | 14 days | `SHIPMENT_REMINDER` to the requester again. |
| 3 | `reminder_days_3` | 30 days | `SHIPMENT_OVERDUE` to the requester **and** all admins — flagged as a possible postage issue. |

Each request records its `reminderStage` (0–3). A reminder fires only when the
*due* stage (the highest threshold the elapsed time has crossed) exceeds the
stage already recorded — so a daily run never re-sends, and a request that
crosses several thresholds in one gap (e.g. after downtime) jumps straight to
its highest due stage rather than replaying superseded reminders. The job only
*enqueues* notification jobs; sending and recipient resolution live in the
notification handler. Marking the device received ends the sequence — received
requests drop out of the scan.

---

## Background jobs

AssetCheckout runs an in-process background-job system for scheduled
maintenance and event-driven work like notifications. Jobs are recorded in the
`BackgroundJob` table, which doubles as a live queue and a history log visible
in the Background Jobs settings section.

A single-worker poll runner picks up pending jobs one at a time; a cron
scheduler enqueues recurring jobs on configurable schedules. The scheduler's
cron callbacks never run job logic directly — they only enqueue, so scheduled
and manual triggers flow through the same execution path. Failed jobs retry
with exponential backoff, except for "one-shot" jobs (cache refreshes,
cleanups, and the shipment-reminder scan) which fail once rather than
retrying — their next scheduled tick is the retry.

### Current jobs

| Job | Purpose | Schedule (default) | Manually triggerable |
|---|---|---|:---:|
| Refresh Categories Cache | Re-fetch the Snipe-IT category list | Hourly | ✅ |
| Refresh Prices Cache | Re-fetch the hardware list used for price averages | Every 10 minutes | ✅ |
| Cleanup Stale Requests | Auto-reject non-terminal requests with no activity past a configurable window | Daily, midnight | ✅ |
| Cleanup Orphan Snipe Models | Delete models whose skeleton asset was removed out-of-band, and reject the stranded request | Weekly, Sunday 2am | ✅ |
| Purge Old Job History | Delete completed/failed job rows past the retention window | Daily, 3am | ✅ |
| Remind Shipped Requests | Escalating received-reminders for shipped-but-unacknowledged devices | Daily, 10am | ❌ |
| Send Request Notification | Email the relevant party when a request changes state | — (event-driven) | ❌ |
| Sync Requests to SharePoint | Email unsynced requests to the SharePoint ledger mailbox | Daily (see [SharePoint sync](#sharepoint-sync)) | ✅ |

### Manual vs event-driven jobs

Maintenance jobs can be triggered on demand from the Background Jobs settings
section ("Run now"), in addition to running on their schedule. A manual trigger
respects the same retry policy as the scheduled run.

Two jobs are deliberately **not** manually triggerable:

- **Send Request Notification** fires in response to specific request events
  and carries the context of that event in its payload — a "run now" button
  would have nothing meaningful to act on.
- **Remind Shipped Requests** is excluded so reminder cadence can't be
  accidentally accelerated; its daily schedule *is* the retry policy.

The SharePoint sync, by contrast, **is** manually triggerable: it's an
idempotent batch over the unsynced backlog (the watermark makes re-runs safe),
which makes "Run now" useful for testing the pipeline or catching up after an
outage.

### Schedules and the schedule editor

Each scheduled job's cron expression lives in the `Setting` table under a
`jobs.*Cron` key. The Background Jobs settings UI provides a human-friendly
editor for these: an **Interval** mode (every N minutes / hours) and a
**Scheduled** mode (daily / weekly / monthly / quarterly / yearly at a set
time), which generate the underlying cron expression for you. Schedules that
can't be represented by the editor (set manually via the database) are shown
read-only.

> **Schedules are registered once at startup, so a schedule change takes effect
> after the next server restart.** The editor notes this on save. Invalid or
> missing cron expressions are skipped at startup with a logged warning — the
> job simply won't be scheduled until fixed.

### Destructive jobs and dry-run mode

The orphaned-model cleanup job deletes models from Snipe-IT, so it ships with
guard rails: a **dry-run mode** (on by default) that reports what it *would*
delete without deleting anything, a per-run cap on deletions, and a full audit
of every action in the job's result summary. Review a dry-run result before
switching to live deletion. The UI shows a green "Dry-run" / red "Live" badge
and a toggle.

### Adding your own recurring job

The job system is small and explicit. To add a `REFRESH_USERS_CACHE` job (for
example):

1. **Write the handler** under `backend/src/jobs/handlers/` — an async function
   that does the work and returns a summary object (stored as `resultSummary`):

   ```typescript
   // backend/src/jobs/handlers/refreshUsersCache.ts
   import { refreshUsersCache } from "../../services/snipeit.js";

   export async function refreshUsersCacheHandler(): Promise<Record<string, unknown>> {
     const count = await refreshUsersCache();
     return { refreshed: count };
   }
   ```

2. **Add the job type** to the `JobType` enum in the Prisma schema, then
   migrate and regenerate the client (the custom client output means `generate`
   runs separately after `migrate`):

   ```prisma
   enum JobType {
     // ...existing...
     REFRESH_USERS_CACHE
   }
   ```

   ```bash
   pnpm --filter @asset-checkout/backend exec prisma migrate dev --name add_refresh_users_cache
   pnpm --filter @asset-checkout/backend exec prisma generate
   ```

3. **Register the handler** in `backend/src/jobs/index.ts`:

   ```typescript
   import { refreshUsersCacheHandler } from "./handlers/refreshUsersCache.js";
   registerHandler("REFRESH_USERS_CACHE", refreshUsersCacheHandler);
   ```

4. **Seed a schedule setting** in `SETTING_DEFAULTS`
   (`backend/src/services/settings.ts`):

   ```typescript
   {
     key: "jobs.refreshUsersCron",
     envVar: "JOBS_REFRESH_USERS_CRON",
     defaultValue: "*/30 * * * *",
     description: "Cron expression for refreshing the Snipe users cache.",
   },
   ```

5. **Wire it into the scheduler** via `SCHEDULE_KEYS` in
   `backend/src/jobs/scheduler.ts`:

   ```typescript
   const SCHEDULE_KEYS: Record<string, JobType> = {
     // ...existing...
     "jobs.refreshUsersCron": "REFRESH_USERS_CACHE",
   };
   ```

6. **(Optional) Set the retry policy.** If it shouldn't retry on failure, add
   it to `ONE_SHOT_JOBS` in `backend/src/jobs/policy.ts`. To make it manually
   triggerable, add it to the allow-list in `backend/src/routes/jobRoutes.ts`.
   To give it a dry-run mode, add it to `DRY_RUN_JOBS` with its setting key.

7. **Rebuild and restart** — schedules are registered once at startup.

---

## SharePoint sync

AssetCheckout keeps an audit trail of every request; the SharePoint sync
publishes that trail to a company SharePoint list so stakeholders in other
departments can see what was requested, approved, and issued — without being
granted access to the admin tooling or to Snipe-IT.

### The ledger model

SharePoint is treated as an **append-only ledger of request details**, not a
mirror of lifecycle state. Each request is sent exactly **once**: the
`syncedToSharepointAt` watermark column marks a request as synced and excludes
it from all future runs. Later changes to a request (shipping, receipt) are
not re-synced — the ledger records that the request happened and what it was,
not its ongoing state.

### How it works

The transport is the SMTP relay — no SharePoint credentials live in this app:

1. The nightly job scans for requests where `syncedToSharepointAt` is `NULL`.
2. For each one, it resolves the manager's display name from Snipe-IT (cached
   per run — many requests share a manager) and serialises the full request
   row plus that `managerName` as JSON.
3. The JSON is wrapped in unambiguous extraction markers and emailed as plain
   text to the SharePoint service mailbox (`SHAREPOINT_SYNC_TO`):

   ```
   === ASSETCHECKOUT-PAYLOAD-START ===
   { ...request JSON... }
   === ASSETCHECKOUT-PAYLOAD-END ===
   ```

4. A **Power Automate flow** triggers on that mailbox, extracts the JSON
   between the markers, maps the fields (decoding enums and booleans,
   resolving the tablet/phone filter, formatting the ISO dates), and creates
   the SharePoint list item.

All mapping and filtering logic lives in the flow; the backend's only job is
to reliably emit the data. A manager lookup failure doesn't abort that
request's sync — the ledger records a `null` managerName rather than missing
the row entirely.

### Exactly-once and retry semantics

- A request is stamped `syncedToSharepointAt` only **after** its send
  succeeds — a failure leaves it `NULL`, so the next run retries it.
- Within a run, failures are caught per-request: one bad send doesn't block
  the rest of the night's batch.
- If *any* request failed, the handler throws at the end, so the job is marked
  Failed and retried on the standard budget (3 attempts). Already-synced
  requests are already stamped, so a retry re-scans and only re-attempts the
  still-`NULL` ones. Anything still failing after the budget is picked up by
  the next scheduled run.

This idempotency is also why the sync — unlike the other email-sending job —
**is manually triggerable** from the Background Jobs section.

### Enabling the sync

Two switches, both off/empty by default:

- **`SHAREPOINT_SYNC_TO`** (environment) — the service mailbox address the
  ledger emails are sent to. Unset → the job skips with a logged warning.
- **`sharepoint_sync_enabled`** (setting, default `false`) — the master
  toggle, checked at the start of every run. Enable it from the settings page
  once the receiving mailbox is deliverable from your relay and the Power
  Automate flow is live.

The schedule lives under the `jobs.sharepointSyncCron` setting key
(registered in the scheduler like every other recurring job). **Note:** this
key is currently created when an admin first enables the sync through the
settings UI, rather than being seeded at startup like the other `jobs.*Cron`
keys — until the row exists, the scheduler logs a warning at startup and skips
registering the job.

> 🚧 **Roadmap — seed the sync schedule.** `jobs.sharepointSyncCron` should
> join the seeding registry so fresh installs schedule the job without a UI
> round-trip. Implementation: add an entry to `SETTING_DEFAULTS` in
> `backend/src/services/settings.ts` with `envVar: "JOBS_SHAREPOINT_SYNC_CRON"`
> and a default expression (e.g. `0 1 * * *` for 1am daily). No scheduler
> change is needed — `SCHEDULE_KEYS` already maps the key to
> `SYNC_REQUEST_TO_SHAREPOINT`.

---

## Feedback

An anonymous internal feedback channel, aimed at measuring whether the app is
actually an improvement.

### Anonymity by design

Feedback sits behind the forward-auth proxy like everything else — only
authenticated staff can submit — but it is **role-unrestricted** and the
stored record deliberately contains **nothing about who submitted**: no user
ID, no actor name or email, no link to a request. Anonymity is a property of
the schema, not a promise of the UI.

### What's collected

Two required questions, each answered `improved` / `no_change` / `worse`:

1. Is this an improvement to how you request hardware?
2. Is this an improvement to IT in general?

Plus an optional free-text comment on how the service (or IT generally) could
improve. Submissions with anything other than the three allowed answers are
rejected with a `400`.

### Where it surfaces

When `feedback_enabled` is on (the default), feedback is invited from three
places:

- The **`/feedback` page** itself.
- A **post-receipt nudge dialog** — shown after a user marks their device
  received/collected (the API response tells the UI whether to prompt).
- A **call-to-action on the landing page**.

The gate is enforced **server-side**: with the setting off, the submit
endpoint rejects with a `403` regardless of what the client shows. The
enabled/disabled state is admin-toggleable from the settings page.

### Admin review and export

Admins get a feedback view (newest first) and a **CSV export** —
RFC-4180-escaped, one row per submission
(`id, improvedRequesting, improvesItOverall, comments, createdAt`), served as
a dated `feedback-export-YYYY-MM-DD.csv` download. Both are admin-only,
enforced against `ADMIN_EMAILS`.

---

## Integrations

AssetCheckout exposes a machine-to-machine API under `/api/integrations/` so
an external system can create requests and manage the Snipe-IT user lifecycle
without holding Snipe-IT credentials itself. In our reference deployment the
consumer is **NextHRT** (the HR tool), which is why the routes live under
`/api/integrations/hrt/` and the shared secret is named `HRT_API_KEY` — but
the surface is generic: anything that can send an HTTP request with a header
can use it.

All routes require the `X-API-Key` shared secret — see
[Machine-to-machine authentication](#machine-to-machine-api-token). Keep these
endpoints on the internal network; the token is the sole guard.

### Creating requests

**`POST /api/integrations/hrt/request`**

Creates a hardware request programmatically. The payload maps onto the **same
`createRequest` service the UI uses**, so integration-origin requests behave
identically once created — same validation (the category must be
requestable), same lifecycle, same notifications (the nominated manager is
emailed for approval).

The caller is responsible for supplying valid Snipe-IT identities (`userId`,
`userName`, `managerId`, `manager`) and may include the full set of
phone-request options (`callText`, `needsData`, `numberOption`,
`reuseNumberFromEmail`, `reuseNumberPhone`).

### Category catalogue

**`GET /api/integrations/hrt/categories`**

Returns the requestable asset categories as `{ id, name }` — the same shape
the request payload keys on — so the external system can seed or reconcile its
own hardware catalogue against what's actually requestable here. Restricted to
the admin-whitelisted requestable categories; non-requestable categories are
never exposed through this endpoint.

### Snipe-IT user lifecycle

The external system owns the employee lifecycle; these routes let it mirror
that lifecycle into Snipe-IT:

| Route | Purpose |
|---|---|
| `POST /hrt/users` | Find-or-create a Snipe user, keyed on email. **Idempotent by design** — the caller invokes this from retryable background jobs, so a retry after a partial failure returns the existing user (`created: false`) rather than erroring or duplicating. Requires `firstName`, `lastName`, `email`. |
| `GET /hrt/users/lookup?email=` | Resolve a Snipe user by email. `404` if none. |
| `GET /hrt/users/:id/assets` | List the assets currently checked out to a user. |
| `GET /hrt/users/phones` | All users' phone data — supports the caller's number-reuse tooling. |
| `POST /hrt/users/:id/offboard` | Exit flow: check in everything the user has out, then deactivate the account. |

**Offboarding and partial failure.** The offboard response reports per-asset
outcomes: check-ins that failed come back in a `failed` list with `success`
still `true`. This is deliberate — the successfully checked-in assets make a
naive retry non-idempotent, so the caller is expected to surface failures for
manual follow-up rather than blindly retrying the whole operation.

---

## Database

AssetCheckout uses SQLite via Prisma with the `better-sqlite3` driver. Identity
is header-trusted (see [Authentication](#authentication)), so there is no
`User` table. There are five tables: `Request`, `ModelRequest`, `Setting`,
`BackgroundJob`, and `Feedback`.

### `Request`

A single hardware request and its lifecycle.

| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | Autoincrement. |
| `userId` | Int | The Snipe-IT user ID the request is *for*. |
| `userName` | String | Display name of the requester. Role resolution matches against this. |
| `categoryId` | Int | Snipe-IT category ID being requested. |
| `categoryName` | String | Denormalised category name (snapshot at request time). |
| `requestType` | enum `RequestType` | `STANDARD` or `NON_STANDARD`. |
| `status` | enum `RequestStatus` | `PENDING` → `APPROVED` → `COMPLETED` / `REJECTED`. Defaults `PENDING`. |
| `reason` | String? | The requester's stated reason. On rejection this is overwritten with the rejection reason. |
| `manager` | String? | The named approver. Role resolution matches managers against this. |
| `managerId` | Int | The approver's Snipe-IT user ID. Used to resolve the manager's email (notifications) and display name (SharePoint sync). |
| `callText` | Boolean | Phone option: needs call/text capability. Forces `needsData` on. Defaults false. |
| `newNumber` | Boolean | **Deprecated** — superseded by `numberOption`; retained until the frontend no longer reads it. Defaults false. |
| `needsData` | Boolean | Phone option: needs a data plan. Defaults false. |
| `numberOption` | enum `NumberOption`? | `NEW`, `REUSE`, or `NONE`. |
| `reuseNumberFromEmail` | String? | When reusing a number: the email identifying whose number is reused. |
| `reuseNumberPhone` | String? | Snapshot of the resolved number at request time. |
| `collectionReadyAt` | DateTime? | When an admin marked a collection-path request ready for pickup. |
| `shippedAt` | DateTime? | When an admin marked a shipping-path request dispatched. |
| `receivedAt` | DateTime? | When the device was marked received (shipped path) or collected (collection path). |
| `needsShipping` | Boolean | Ship-vs-collect decision from the location comparison at checkout. Defaults false. |
| `locationMissing` | Boolean | The comparison couldn't run (user or device location missing) — defaulted to collection, flagged for the admin. Defaults false. |
| `trackingCode` | String? | Optional tracking number recorded at mark-shipped. |
| `trackingUrl` | String? | Optional tracking link recorded at mark-shipped. |
| `syncedToSharepointAt` | DateTime? | SharePoint sync watermark — stamped only after a successful send; `NULL` means "not yet synced". |
| `reminderStage` | Int | Highest shipment-reminder stage sent (0–3). Defaults 0. |
| `approvedBy` | String? | Who gave manager approval. |
| `approvedAt` | DateTime? | When manager approval was given. |
| `adminApprovedBy` | String? | Who gave IT admin sign-off. |
| `adminApprovedAt` | DateTime? | When admin sign-off was given. |
| `rejectedBy` | String? | Who rejected it. Automated rejections record `"Automated Job"`. |
| `rejectedAt` | DateTime? | When it was rejected. |
| `modelRequest` | relation | Optional 1:1 child `ModelRequest` (non-standard only). |
| `createdAt` | DateTime | Defaults to now. |
| `updatedAt` | DateTime | `@updatedAt` — auto-stamped on every write. Used as the staleness anchor. |

**Rejection reason format.** When a request is rejected, `reason` is
overwritten:

```
REJECTED: <rejection reason>
 REQUEST: <original reason>
```

Automated stale rejection uses `Rejected by automated system; Stale Request`;
orphan-model cleanup uses `Rejected by automated system; Orphaned Asset and
Model`. The notification handler parses this format to show the requester just
the rejection reason.

### `ModelRequest`

Child of a non-standard `Request`. Tracks the model-creation and asset-detail
sub-flow. One per non-standard request (unique on `requestId`).

| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | Autoincrement. |
| `requestId` | Int (unique FK) | The parent `Request`. |
| `manufacturer` | String? | Working buffer for the admin's Create Model form — persisted on partial submits so the form can resume if Snipe-IT creation fails midway. |
| `modelName` | String? | Working buffer. |
| `modelNumber` | String? | Working buffer. |
| `price` | Float? | Persisted price (the only asset detail stored locally; the rest live in Snipe-IT). |
| `linkedAssetId` | Int? | The Snipe-IT asset ID this request is linked to. |
| `snipeModelId` | Int? | The Snipe-IT model ID created/linked for this request. |
| `status` | enum `ModelRequestStatus` | `PENDING` → `APPROVED` → `COMPLETED`. Defaults `PENDING`. |
| `assetReady` | Boolean | Whether the linked asset has all required fields and is ready for checkout. The submit that flips this true also fulfils the request. Defaults false. |
| `createdAt` | DateTime | Defaults to now. |
| `updatedAt` | DateTime | `@updatedAt`. |

**Why this table matters for the cleanup jobs.** After a non-standard request
is approved, subsequent activity writes the `ModelRequest`, not the parent
`Request`. So the parent's `updatedAt` can look stale while the request is
actively being worked. The stale-cleanup job uses the *later* of
`Request.updatedAt` and `ModelRequest.updatedAt` so in-progress non-standard
requests aren't wrongly rejected.

### `Setting`

Key/value runtime configuration, set via the admin `/settings` UI.

| Field | Type | Notes |
|---|---|---|
| `key` | String (PK) | The setting key. |
| `value` | String | JSON-serialised or plain string. Empty string conventionally means "unset / use fallback." |
| `description` | String? | Human-readable description, refreshed from defaults on each deploy. |
| `updatedAt` | DateTime | `@updatedAt`. |
| `updatedBy` | String? | Email of the admin who last changed it. |

**Seeding behaviour.** On startup, `ensureDefaults()` upserts every known
setting: if missing it's created from the matching environment variable (or a
hardcoded default); if it already exists, only the `description` is refreshed
and the **value is never overwritten**. Admin-configured values survive
deploys; environment-variable changes only affect fresh installs. Structured
settings validate/normalise their env input and fall back to the default (with
a startup warning) when it's invalid.

**Setting key catalogue**

Asset configuration:

| Key | Env override | Default | Meaning |
|---|---|---|---|
| `requestable_categories` | `REQUESTABLE_CATEGORY_IDS` | `""` (all) | JSON array of category IDs allowed for new requests. Empty = all allowed. Env accepts JSON or comma-separated. |
| `standard_models` | `STANDARD_MODELS_JSON` | `""` | JSON object mapping `categoryId → { primary, backup }` model IDs. |
| `skeleton_status_id` | `SKELETON_STATUS_ID` | `""` | Status ID for newly-created skeleton assets. Empty falls back to a status named "Pending". |
| `mobile_country_code` | `MOBILE_COUNTRY_CODE` | `61` | Country calling code (digits only) used to recognise mobile numbers. |
| `mobile_leading_digit` | `MOBILE_LEADING_DIGIT` | `4` | First digit after the prefix that marks a number as a mobile. Single digit. |

Shipping, reminders, and features:

| Key | Env override | Default | Meaning |
|---|---|---|---|
| `shipping_estimate_days` | `SHIPPING_ESTIMATE_DAYS` | `5` | Delivery estimate quoted in the "your device has shipped" email. |
| `reminder_days_1` | `REMINDER_DAYS_1` | `7` | Days after shipping until the first received-reminder. |
| `reminder_days_2` | `REMINDER_DAYS_2` | `14` | Days after shipping until the second received-reminder. |
| `reminder_days_3` | `REMINDER_DAYS_3` | `30` | Days after shipping until the overdue escalation to user + admins. |
| `feedback_enabled` | `FEEDBACK_ENABLED` | `true` | Whether the anonymous feedback feature is active (page, nudge, CTA). |
| `sharepoint_sync_enabled` | `SHAREPOINT_SYNC_ENABLED` | `false` | Whether the nightly SharePoint request-ledger sync is active. |

Background jobs:

| Key | Env override | Default | Meaning |
|---|---|---|---|
| `jobs.pollIntervalMs` | `JOBS_POLL_INTERVAL_MS` | `5000` | How often the runner polls for pending work (ms). |
| `jobs.historyRetentionDays` | `JOBS_HISTORY_RETENTION_DAYS` | `90` | Terminal job rows older than this are purged. |
| `jobs.refreshCategoriesCron` | `JOBS_REFRESH_CATEGORIES_CRON` | `0 * * * *` | Categories-cache refresh (hourly). |
| `jobs.refreshPricesCron` | `JOBS_REFRESH_PRICES_CRON` | `*/10 * * * *` | Prices-cache refresh (every 10 min). |
| `jobs.cleanupStaleCron` | `JOBS_CLEANUP_STALE_CRON` | `0 0 * * *` | Stale-request cleanup (daily midnight). |
| `jobs.cleanupOrphanCron` | `JOBS_CLEANUP_ORPHAN_CRON` | `0 2 * * 0` | Orphan-model cleanup (weekly, Sunday 2am). |
| `jobs.purgeHistoryCron` | `JOBS_PURGE_HISTORY_CRON` | `0 3 * * *` | Job-history purge (daily 3am). |
| `jobs.shipmentReminderCron` | `JOBS_SHIPMENT_REMINDER_CRON` | `0 10 * * *` | Shipped-request reminder scan (daily 10am). |
| `jobs.sharepointSyncCron` | — (see note) | — | SharePoint sync schedule. Currently created via the settings UI when the sync is enabled; seeding it is on the roadmap (see [SharePoint sync](#sharepoint-sync)). |
| `jobs.staleRequestMonths` | `JOBS_STALE_REQUEST_MONTHS` | `6` | Months of inactivity before a non-terminal request is auto-rejected. |
| `jobs.orphanCleanupDryRun` | `JOBS_ORPHAN_CLEANUP_DRY_RUN` | `true` | When true, orphan cleanup only reports what it would delete. |
| `jobs.orphanCleanupMaxDeletes` | `JOBS_ORPHAN_CLEANUP_MAX_DELETES` | `5` | Max models the orphan cleanup deletes in one run. |

> Cron schedules are registered once at startup; changing one requires a
> restart.

### `BackgroundJob`

The background-job queue and history log in one table.

| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | Autoincrement. |
| `type` | enum `JobType` | Which job this is. |
| `status` | enum `JobStatus` | `Pending` → `Running` → `Completed` / `Failed`. Defaults `Pending`. |
| `payload` | String? | JSON string of job input, if any (e.g. `{ requestId, kind }` for notifications). |
| `resultSummary` | String? | JSON string summarising a successful run (the audit trail for cleanup jobs; skip reasons for notifications). |
| `errorMessage` | String? | The thrown error's message on failure; shown in the history UI. |
| `scheduledAt` | DateTime | When the job becomes eligible to run. A priority/manual trigger sets this to the epoch to jump the queue. |
| `startedAt` | DateTime? | When the runner claimed it. |
| `completedAt` | DateTime? | When it reached a terminal state. |
| `attempts` | Int | How many times it's been attempted. Defaults 0. |
| `maxAttempts` | Int | Retry ceiling. Defaults 3; one-shot jobs use 1. |
| `createdAt` | DateTime | Defaults to now. |

Indexes: `[status, scheduledAt]` (the runner's poll query) and `[type]`.

### `Feedback`

Anonymous feedback submissions. Deliberately stores no submitter identity —
see [Feedback](#feedback).

| Field | Type | Notes |
|---|---|---|
| `id` | Int (PK) | Autoincrement. |
| `improvedRequesting` | String | `improved` / `no_change` / `worse` — is this an improvement to how hardware is requested? |
| `improvesItOverall` | String | `improved` / `no_change` / `worse` — is this an improvement to IT in general? |
| `comments` | String? | Optional free-text comment (trimmed; empty stored as null). |
| `createdAt` | DateTime | Defaults to now. |

### Enums

| Enum | Values |
|---|---|
| `RequestType` | `STANDARD`, `NON_STANDARD` |
| `RequestStatus` | `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED` |
| `ModelRequestStatus` | `PENDING`, `APPROVED`, `COMPLETED` |
| `NumberOption` | `NEW`, `REUSE`, `NONE` |
| `JobType` | `SEND_REQUEST_NOTIFICATION`, `SYNC_REQUEST_TO_SHAREPOINT`, `REFRESH_CATEGORIES_CACHE`, `REFRESH_PRICES_CACHE`, `CLEANUP_STALE_REQUESTS`, `CLEANUP_ORPHAN_SNIPE_MODELS`, `PURGE_OLD_JOB_HISTORY`, `REMIND_SHIPPED_REQUESTS` |
| `JobStatus` | `Pending`, `Running`, `Completed`, `Failed` |