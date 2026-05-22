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

## Prerequisites

- Node.js 20+
- A running [Snipe-IT](https://snipeitapp.com/) instance you can hit over HTTP
- A Snipe-IT service user with an API token (see [Snipe-IT bot setup](#snipe-it-bot-setup) below)

## Setup

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in `backend/.env` with at minimum:

| Variable | Description |
|---|---|
| `SNIPEIT_API_URL` | Your Snipe-IT base URL, e.g. `https://snipe.example.com/api/v1` |
| `SNIPEIT_BOT_TOKEN` | API token for the Snipe-IT service user |
| `ADMIN_NAMES` | Comma-separated names of users who should have admin access |
| `DATABASE_URL` | `file:./src/db/database.db` works for local dev |

Frontend env values (`frontend/.env`) are optional and cover branding (company name, logo paths, watermark images for 404/403 pages).

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev
```

The database starts empty. There's no seed script in this version — once the app is running, an admin user configures requestable categories, standard models, and the skeleton asset status through the in-app `/settings` page. A seed script for demo data is planned for a future version.

### 4. Run the dev servers

Backend:

```bash
cd backend
npm run dev
```

Frontend (in a separate terminal):

```bash
cd frontend
npm run dev
```

## Authentication

> **Note:** AssetCheckout currently uses a dev-only auth toggle in the navbar to switch between user identities. Proper SSO integration is planned and the dev toggle will be removed in a future version. Don't deploy this to a real internal network as-is.

Admin access is granted by adding the user's name to the `ADMIN_NAMES` environment variable (comma-separated). The dev auth toggle reads from this list and lets you impersonate either an admin or a regular user during development.

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
cd backend
npx prisma migrate reset
```

This wipes everything, including the in-app settings — you'll need to reconfigure categories, standard models, and the skeleton status afterwards.