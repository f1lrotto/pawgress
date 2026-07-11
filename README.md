# Pawgress

Pawgress is an English and Slovak progressive web app for a puppy's
routine, training, agenda, timeline, and health insights. The React client is
hosted as a static SPA; Convex provides the online database, realtime functions,
and password authentication.

The installed app caches its shell, not household data or pending writes. Convex
data is online-only. When the device loses connectivity, the UI reports that it
is reconnecting and resumes live data after the connection returns.

## Local development

### Prerequisites

- Node.js 22.12 or newer
- npm
- A Convex account and access to the intended development project

Install dependencies and initialize or select a personal Convex development
deployment:

```sh
npm install
npm run convex:dev
```

`convex dev` creates `.env.local`. The expected variable names are documented
in `.env.example`; do not commit `.env.local` or copy real values into the
example.

On first setup, configure Convex Auth for the development deployment in another
terminal:

```sh
npx @convex-dev/auth --web-server-url http://localhost:5173
```

This repository already contains the Auth source files. The command generates
and stores the development deployment's `JWT_PRIVATE_KEY` and `JWKS` in Convex,
not in the Vite environment file. Keep `npm run convex:dev` running, then start
the client:

```sh
npm run dev
```

Before handing off a change, run:

```sh
npm run convex:codegen
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
```

The browser smoke journey needs the local Convex process too:

```sh
npm run e2e
```

## Environment contract

| Name                   | Location                                                  | Purpose                                                                               |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOYMENT`    | Local `.env.local`                                        | Selects the developer's Convex deployment.                                            |
| `VITE_CONVEX_URL`      | Local `.env.local` and Cloudflare Pages build environment | Public `https://…convex.cloud` URL used by the React client.                          |
| `VITE_CONVEX_SITE_URL` | Local `.env.local`                                        | Public `https://…convex.site` HTTP-actions URL written by Convex tooling.             |
| `JWT_PRIVATE_KEY`      | Convex deployment environment only                        | Private signing key used by Convex Auth. Never expose it to Vite or Cloudflare Pages. |
| `JWKS`                 | Convex deployment environment only                        | Public-key set paired with that deployment's private key.                             |

Development and production must use separately generated
`JWT_PRIVATE_KEY`/`JWKS` pairs. Never copy the development pair to production,
put either value in `.env.local`, or prefix a secret with `VITE_`.

## Production deployment

Production changes require explicit operator authorization. The recommended
low-maintenance setup is managed Convex plus Cloudflare Pages Git integration;
no Wrangler configuration is needed.

### 1. Prepare Convex production

Run every release from a clean, reviewed commit that is already proven against a
development deployment. If a release changes data or the schema, take a manual
production backup in the Convex dashboard first.

For the first production Auth setup only, generate a production-specific key
pair:

```sh
npx @convex-dev/auth --prod
```

If production already has `JWT_PRIVATE_KEY` or `JWKS`, do not overwrite them
during a normal deploy. Deliberate key rotation is a separate security operation
and can invalidate active sessions.

Inspect and then deploy the backend:

```sh
npx convex deploy --dry-run
npx convex deploy --message "release <version-or-commit>"
```

Record the production deployment's public `https://…convex.cloud` URL. Convex
environment values are deployment-specific; verify the command targets the
correct project and production deployment before confirming it.

### 2. Connect Cloudflare Pages

In Cloudflare, choose **Workers & Pages → Create application → Pages → Connect
to Git**, authorize the repository, and use:

| Setting                         | Value                                            |
| ------------------------------- | ------------------------------------------------ |
| Production branch               | `main` (or the repository's release branch)      |
| Root directory                  | Leave blank; this app is the repository root     |
| Build command                   | `npm run build`                                  |
| Build output directory          | `dist`                                           |
| Production environment variable | `VITE_CONVEX_URL=<production .convex.cloud URL>` |

Use the React (Vite) preset or enter those values directly. Preview branches get
separate Pages URLs; do not point an untrusted preview at production Convex data.
If previews need a backend, create a separately authorized Convex preview
deployment and give that branch its own `VITE_CONVEX_URL`.

Cloudflare Pages treats a project without a top-level `404.html` as an SPA and
routes unknown paths to `/`. Therefore this repository intentionally has no
`_redirects`, `_routes.json`, or Wrangler file. After deployment, verify direct
loads and refreshes on `/`, `/timeline`, `/insights`, and `/settings`.

For later releases, deploy backward-compatible Convex changes first, smoke-test
them, and then push the same reviewed commit to the Pages production branch.

## Production verification

On the production URL:

1. Sign in with a dedicated smoke account and confirm the selected dog, current
   locale, dashboard data, and settings load.
2. Open a second authenticated tab, create a disposable log entry, and confirm
   realtime delivery before removing it.
3. Switch English/Slovak, refresh, and confirm the account preference persists.
4. Refresh several nested routes directly and confirm the SPA still loads.
5. Disconnect the network: the app shell should remain available and report
   reconnecting. Do not expect reads or writes to work offline. Reconnect and
   confirm live data resumes without reloading.
6. Confirm the manifest, icons, standalone launch, and install flow on desktop
   Chrome or Edge and Android Chrome. On iOS Safari, use **Share → Add to Home
   Screen**, then launch from the icon.
7. On at least one Android and one iOS device, background the installed app,
   restore it, repeat the offline/reconnect check, and confirm no duplicate
   activity was recorded.

## Rollback

### Frontend

In the Pages project, open **Deployments**, choose the last known-good successful
production deployment, and select **Rollback to this deployment**. Pages preview
deployments cannot be rollback targets. Re-run the production smoke checks after
traffic switches.

### Backend and data

Convex code rollback means deploying known-good source; it does not roll back
data automatically:

1. Revert to a reviewed release whose schema still accepts all current data.
2. Run `npx convex deploy --dry-run`; stop if schema validation or compatibility
   is uncertain.
3. Deploy that source with a rollback message, then smoke-test it.

Use expand/migrate/contract schema changes so both the new and preceding client
and backend versions remain valid during a release. Do not remove a field or
narrow a validator until existing documents have been migrated.

If data itself is corrupted, take another backup before restoring a known-good
Convex backup. Restore is destructive and replaces current table data; backups
do not include functions, environment variables, or pending scheduled work.
Restore code and environment configuration separately, and do not rotate Auth
keys as part of an ordinary rollback.

## Official deployment references

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages SPA routing](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Convex production deployment](https://docs.convex.dev/production/overview)
- [Convex deploy command](https://docs.convex.dev/cli/reference/deploy)
- [Convex environment variables](https://docs.convex.dev/production/environment-variables)
- [Convex backup and restore](https://docs.convex.dev/database/backup-restore)
- [Convex Auth production setup](https://labs.convex.dev/auth/production)
