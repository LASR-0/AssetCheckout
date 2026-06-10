# AssetCheckout — Deployment

How we recommend deploying AssetCheckout to production. For local development,
see the root [README](../README.md); for how the app works and is configured,
see [DOCUMENTATION](DOCUMENTATION.md).

## Contents

- [Deployment model at a glance](#deployment-model-at-a-glance)
- [Security prerequisites](#security-prerequisites)
- [Running alongside Snipe-IT](#running-alongside-snipe-it)
- [Centralised authentication (forward auth)](#centralised-authentication-forward-auth)
- [Running with Docker](#running-with-docker)
- [Environment configuration for production](#environment-configuration-for-production)
- [The database in production](#the-database-in-production)
- [Updating a deployment](#updating-a-deployment)

---

## Deployment model at a glance

A production AssetCheckout deployment has three pieces:

1. **AssetCheckout itself** — the Node backend serving the built frontend, in a
   container or as a service, with its SQLite database on a persisted volume.
2. **A Snipe-IT instance** it can reach over HTTP — commonly on the same host.
3. **An authenticating reverse proxy in front of it** — this is not optional.
   AssetCheckout performs no authentication of its own; the proxy validates the
   user's session against your identity provider and injects the
   `X-User-Email` / `X-User-Name` headers the app trusts.

```
            ┌────────────────────────── your server ──────────────────────────┐
            │                                                                  │
 user ──────┼──► reverse proxy (Caddy) ──► AssetCheckout ──► Snipe-IT API      │
            │        │                        (port 3000)      (same host or   │
            │        ▼                                          elsewhere)     │
            │   identity provider                                              │
            │   (your SSO / auth service)                                      │
            └──────────────────────────────────────────────────────────────────┘
```

## Security prerequisites

Two things must be true before this app faces any users:

**1. An auth proxy sits in front of it.** Exposed directly, anyone can set the
`X-User-Email` header themselves and impersonate any user — including an admin.
The proxy is the security boundary.

**2. The proxy strips client-supplied identity headers.** The proxy must remove
any `X-User-Email` / `X-User-Name` headers arriving from the client *before*
injecting its own. If it forwards client-supplied values, the trust model is
broken even with the proxy in place. Verify this explicitly in your proxy
config.

Additionally, the production service must run with **`NODE_ENV=production`**.
This disables the development impersonation headers (`x-dev-user-*`) at the
backend — the check fails closed, but set it explicitly rather than relying on
the default. See [Authentication](DOCUMENTATION.md#authentication).

## Running alongside Snipe-IT

We recommend running AssetCheckout on the same server as your Snipe-IT
instance. The app talks to Snipe-IT constantly (every request flow, the price
and category caches, the cleanup jobs), so co-locating them keeps that traffic
on-host and removes a network dependency.

Point `SNIPEIT_API_URL` at the local instance — depending on how Snipe-IT is
hosted on the box this is typically a localhost port or an internal hostname.
The bot token and permissions are covered in the
[README](../README.md#snipe-it-bot-setup).

> 🚧 **Stub — specifics pending.** Details of our reference co-located setup
> (how the containers/services are arranged on the host, the exact
> `SNIPEIT_API_URL` form, any Docker networking between AssetCheckout and
> Snipe-IT) will be documented here once written up from the live deployment.

## Centralised authentication (forward auth)

The recommended pattern is a reverse proxy doing **forward auth**: every request
to AssetCheckout is checked against an authentication service before being
passed through.

The flow:

1. A request arrives at the proxy for AssetCheckout.
2. The proxy makes a sub-request to your auth service: "is this session valid?"
3. **Authenticated** → the auth service responds OK with the user's identity;
   the proxy copies that identity onto the request as `X-User-Email` /
   `X-User-Name` and forwards it to AssetCheckout.
4. **Not authenticated** → the auth service responds with a redirect to its
   login page; the proxy relays it; after login the user is returned to where
   they were headed.

[Caddy](https://caddyserver.com/) with its `forward_auth` directive is our
reference proxy, with a separate service acting as the centralised identity
source — this lets one login session cover AssetCheckout and anything else you
put behind the same proxy. Any proxy with an equivalent mechanism works
(Traefik's `forwardAuth` middleware, nginx's `auth_request`, or a dedicated
auth gateway such as Authelia or oauth2-proxy in front of your IdP).

Whichever you use, the two security prerequisites above apply: the proxy is
mandatory, and it must strip inbound `X-User-*` headers before injecting its
own.

> 🚧 **Stub — reference Caddyfile pending.** A sanitised copy of our working
> Caddy forward-auth configuration (including the header stripping and
> injection) will be added here. Until then, consult Caddy's `forward_auth`
> documentation and verify header stripping in your own config before going
> live.

## Running with Docker

A `docker-compose.yml` and `Dockerfile` are included. The image builds the
frontend, compiles the backend, and runs database migrations on startup.

```bash
docker compose up --build
```

- The app is served on port `3000`.
- Configure `backend/.env` **before** building — the compose file reads it via
  `env_file`.
- The SQLite database file is persisted to `/assetc/data` on the host via a
  volume mount. Back this path up (see
  [The database in production](#the-database-in-production)).
- Ensure `NODE_ENV=production` is set in the environment the container runs
  with.

The proxy is not part of the compose file — it fronts the published port. Do
not publish port 3000 beyond the host (or your proxy network) for the reasons
in [Security prerequisites](#security-prerequisites).

> 🚧 **Stub — full compose walkthrough pending.** An annotated compose example
> showing the volume layout, env wiring, and (optionally) proxy networking will
> be added from the reference deployment.

## Environment configuration for production

The two-kind split described in the [README](../README.md#2-configure-environment-variables)
matters most in production:

- **Backend variables** are read at runtime by the server. Set them in the
  environment the service/container actually runs with: `SNIPEIT_API_URL`,
  `SNIPEIT_BOT_TOKEN`, `ADMIN_EMAILS`, `DATABASE_URL`, and explicitly
  `NODE_ENV=production`.
- **Frontend (`VITE_`) variables** are baked in at build time and are public.
  Changing branding values requires a rebuild. Branding *images* can be swapped
  without a rebuild by replacing the files under `frontend/public/branding/` —
  the paths are baked, the file contents are not.

Runtime application configuration (requestable categories, standard models, job
schedules, etc.) does **not** live in environment variables — admins set it in
the in-app settings page and it persists in the database across deploys. See
[Application settings](DOCUMENTATION.md#application-settings).

## The database in production

AssetCheckout uses a single SQLite file. Two operational consequences:

**Back it up.** It's one file — a copy *is* a backup:

```bash
cp /assetc/data/database.db /assetc/data/backup/database.$(date +%F).db
```

Take one on a schedule, and **always take one immediately before deploying a
new version** (see below).

**Migrations run on startup.** The app applies Prisma migrations against the
live database when it boots. This makes deploys simple — pull, restart, done —
but it means a new version can mutate your data the moment it starts. Code is
revertible via git; a migration that has already run against live data is not.
The pre-deploy backup is the rollback path for data.

## Updating a deployment

The repository uses a two-branch model: `main` is the integration branch where
development happens; **`production`** is the branch deployments pull from. It
only ever advances (fast-forwards) to a verified point on `main` — it never
receives direct commits.

Recommended update procedure:

1. Verify the target version on `main`: it builds, and any new Prisma
   migrations have been reviewed for destructive operations (dropped/renamed
   columns, new non-null fields without defaults).
2. **Back up the database file.**
3. Advance the production branch:
   ```bash
   git checkout production
   git merge --ff-only main
   git push origin production
   ```
4. On the server, pull `production` and rebuild/restart the service (with
   Docker: `docker compose up --build -d`). Migrations apply on startup.
5. Smoke-test the live app.
6. If something is wrong: restore the database backup and redeploy the previous
   code. Restore the data **first** — rolling back code against an
   already-migrated database can fail.

> 🚧 **Stub — server pull mechanism pending.** How the server obtains the new
> code (manual pull vs. an automated mechanism) will be documented once the
> reference deployment's process is finalised.