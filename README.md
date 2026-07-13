# AssetCheckout

A bridge between [Snipe-IT](https://snipeitapp.com/) and the people who request
hardware but shouldn't have direct access to your asset manager.

Snipe-IT is a capable open-source asset manager, but its interface assumes an
IT-literate operator. AssetCheckout puts a simple request form in front of your
non-technical users — they ask for hardware in plain terms — and gives admins a
single place to approve those requests and drive the resulting asset creation
and checkout in Snipe-IT through a service account. Used together, you grant
access where and when it's required, without over-exposing your asset manager to
end users.

Beyond the approval flow itself, it emails every party at every step, decides
whether an issued device should be shipped or collected based on where the user
and the device actually are, chases unreceived shipments automatically, and
keeps an audit trail of every request — syncable to a company SharePoint list
so stakeholders in other departments can see what was requested, approved, and
issued without being granted access to the admin tooling or to Snipe-IT itself.

> **Security note:** AssetCheckout does **not** authenticate users itself. It
> trusts identity headers injected by an authenticating reverse proxy in front
> of it, and **must not** be exposed directly to users without one. See
> [Deployment](Documentation/DEPLOYMENT.md) and the
> [Authentication](Documentation/DOCUMENTATION.md#authentication) docs.

## Features

- Standard and non-standard asset request types with category-based routing
- Two-stage approval workflow — manager approval, then IT admin sign-off —
  ending in completion (or rejection with reasoning, notified to the requester)
- For non-standard requests: model search against existing Snipe-IT models,
  with the option to link an existing model or create a new one
- Asset details flow: companies, locations, statuses, tier, serial, and price —
  saved progressively, with partial-save support; fulfilment fires
  automatically the moment the asset is complete
- Ship-or-collect on completion: the user's and device's Snipe-IT locations
  decide whether a device is dispatched or picked up, with tracking details and
  escalating received-reminders on the shipping path
- HTML email notifications (Outlook-safe, plain-text fallback) to the right
  party at every state change
- SharePoint request-ledger sync — an append-only export of every request via
  email to a Power Automate flow, exactly-once
- Anonymous staff feedback with an admin view and CSV export
- A machine-to-machine integration API so an external system (e.g. an HR tool)
  can raise requests and mirror its employee lifecycle into Snipe-IT without
  holding Snipe-IT credentials
- Tier-based price comparison against historical averages
- Per-category configuration: which categories are requestable, which standard
  models exist, which Snipe-IT status to assign to skeleton assets
- A background-job system for scheduled maintenance and event-driven work, with
  manual triggering, a human-friendly schedule editor, and a dry-run safety
  mode for destructive jobs
- An internal dashboard home page, mobile-responsive UI (drawers on mobile,
  dialogs on desktop), and light/dark themes with theme-aware branding

## Tech stack

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Database:** SQLite via Prisma + `better-sqlite3`
- **UI:** shadcn/ui + base-ui Combobox + TanStack Table + Material Symbols
- **Monorepo:** pnpm workspaces (`@asset-checkout/backend`, `@asset-checkout/frontend`)

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/)
- A running [Snipe-IT](https://snipeitapp.com/) instance you can reach over HTTP
- A Snipe-IT service user with an API token (see [Snipe-IT bot setup](Documentation/DOCUMENTATION.md#snipe-it-bot-setup))
- **For email notifications:** an SMTP relay the backend can send through (see
  [Email notifications](Documentation/DOCUMENTATION.md#email-notifications)).
  Optional for a local run — everything else works without it.
- **For production:** an authenticating reverse proxy in front of the app (see
  [Deployment](Documentation/DEPLOYMENT.md)). Not required for local development.

## Quick start (local development)

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
| `ADMIN_NAMES` | Comma-separated display names for admin recognition in dev impersonation |
| `DATABASE_URL` | `file:./src/db/database.db` works for local dev |
| `NODE_ENV` | `development` enables dev authentication (see below) |

Beyond the minimum, three optional groups unlock specific features — email
notifications (`SMTP_*` + `APP_BASE_URL`), the SharePoint ledger sync
(`SHAREPOINT_SYNC_TO`), and the integration API (`HRT_API_KEY`). The
`.env.example` documents every variable; the
[Documentation](Documentation/DOCUMENTATION.md) covers what each feature does.

Environment variables come in two distinct kinds:

- **Backend variables** (no prefix) are read by the Node process at runtime,
  server-side only, and never reach the browser. **Secrets belong here.**
- **Frontend variables** (`VITE_`-prefixed) are baked into the static build at
  build time and are publicly visible in the shipped JavaScript. Use them only
  for non-secret, build-time configuration such as branding. **Never put a
  secret behind a `VITE_` variable.**

Frontend branding values (company name, logo, watermark images) live in
`frontend/.env` — copy `frontend/.env.example` to `frontend/.env`. Branding
images are served from `frontend/public/branding/`.

#### Snipe-IT bot setup

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
| Users | ✅ | ✅* | ✅* | – | – | – |
| API Tokens | – | – | – | – | – | ✅ |

\* User create/edit is only needed if you use the
[integration API](Documentation/DOCUMENTATION.md#integration-api)'s
employee-lifecycle routes; view-only is sufficient otherwise.

Note that **asset checkout** is a distinct capability in Snipe-IT from editing an
asset — ensure the bot can check out hardware. AssetCheckout also relies on a
Snipe-IT custom field named **"Tier"**; see
[The Tier custom field](Documentation/DOCUMENTATION.md#the-tier-custom-field).

### 3. Set up the database

```bash
pnpm --filter @asset-checkout/backend exec prisma generate
pnpm --filter @asset-checkout/backend exec prisma migrate dev
```

The database starts empty. Once running, an admin configures requestable
categories, standard models, and everything else through the in-app
`/settings` page — see the
[Application settings](Documentation/DOCUMENTATION.md#application-settings) docs.

### 4. Run the dev servers

```bash
pnpm dev
```

Or individually:

```bash
pnpm dev:backend
pnpm dev:frontend
```

In development (`NODE_ENV=development`), a DevAuthToggle in the settings page
lets you impersonate users without standing up an auth proxy — see
[Authentication](Documentation/DOCUMENTATION.md#authentication).

## Documentation

- **[Documentation](Documentation/DOCUMENTATION.md)** — how it works: the
  request lifecycle and ship-or-collect flow, authentication (including the
  machine-to-machine path), application settings, Snipe-IT bot setup, the Tier
  field, background jobs, email notifications, the SharePoint sync, feedback,
  the integration API, common configuration issues, and the database schema.
- **[Deployment](Documentation/DEPLOYMENT.md)** — recommended production setup:
  running alongside Snipe-IT, centralised authentication via a forward-auth
  proxy, and Docker.

## License

See [LICENSE](LICENSE).