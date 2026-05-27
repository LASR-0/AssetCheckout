# AssetCheckout

An internal asset request and checkout workflow built on top of [Snipe-IT](https://snipeitapp.com/). Lets users request hardware (standard or non-standard), routes the request through an approval flow, and once approved, drives the asset creation and checkout in Snipe-IT through a service account.

## Features

- Standard and non-standard asset request types with category-based routing
- Approval workflow: pending → approved → completed (or rejected with reasoning)
- For non-standard requests: model search against existing Snipe-IT models, with the option to link an existing model or create a new one
- Asset details flow: companies, locations, statuses, tier, serial, and price — saved progressively, with partial-save support
- Tier-based price comparison against historical averages
- Per-category configuration: which categories are requestable, which standard models exist, which Snipe-IT status to assign to skeleton assets
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
- **For production auth:** [Caddy](https://caddyserver.com/) configured with [HRT SSO](https://github.com/WhatTheShuck/NextHRT) — Caddy sits in front of the app and injects the `X-User-Email` header after authenticating the user. Without this, the app has no user identity in production.

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

Frontend env values are optional and cover branding (company name, logo paths, watermark images for 404/403 pages). Copy `frontend/.env.example` if it exists, or create `frontend/.env` manually.

### 3. Set up the database

```bash
pnpm --filter @asset-checkout/backend exec prisma generate
pnpm --filter @asset-checkout/backend exec prisma migrate dev
```

The database starts empty. Once the app is running, an admin user configures requestable categories, standard models, and the skeleton asset status through the in-app `/settings` page. A seed script for demo data is planned for a future version.

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

## Authentication

Authentication is handled by [Caddy](https://caddyserver.com/) (via the HRT SSO setup), which injects the authenticated user's identity as request headers. The backend reads the `X-User-Email` header to identify the current user and determine admin status.

In development, a `DevAuthToggle` component in the navbar lets you switch between user identities by setting a `x-dev-user-email` header. This toggle is only included in development builds.

Admin access is granted by adding the user's email address to the `ADMIN_EMAILS` environment variable (comma-separated).

## Snipe-IT bot setup

Create a Snipe-IT user with API access, generate a token from their profile page, and paste it into `backend/.env` as `SNIPEIT_BOT_TOKEN`.

The bot needs the following Snipe-IT permissions:

- View / Create / Edit Assets
- Checkout Assets
- View Users
- View / Create / Delete Models
- View Categories
- View Status Labels
- View Custom Fields
- View / Create Manufacturers
- View Locations
- View Companies
- Manage API Tokens

The bot also uses a Snipe-IT custom field called **Tier** to categorise assets by spec band (e.g. Standard/Service/Pro). Any asset that gets checked out through AssetCheckout needs to have a Tier value assigned, otherwise the checkout will fail. The Tier values themselves are pulled live from your Snipe-IT custom field configuration.

A more detailed walkthrough with screenshots is planned for a future revision of this README.

## Resetting the database

```bash
pnpm --filter @asset-checkout/backend exec prisma migrate reset
```

This wipes everything, including the in-app settings — you'll need to reconfigure categories, standard models, and the skeleton status afterwards.
