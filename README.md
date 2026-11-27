# Switchboard

Switchboard is a shared support inbox for Acme and Globex. Agents sign in through the supplied identity provider, claim conversations, reply through Pigeon, follow delivery status and leave encrypted private notes. MongoDB stores the inbox and its event history. Redis shares sessions, rate-limit state and dispatch leases between server instances.

## Run from a clean clone

Use Node.js 22.13 or newer in the 22.x line, npm, and Docker with Compose. Run commands from the repository root.

```sh
npm run up
npm run scaffold:install
```

The install command uses both lockfiles and builds the server and web app. Start these commands in separate terminals.

```sh
npm run scaffold:server
npm run scaffold:web
```

Open **http://localhost:5173** and select **Sign in to Switchboard**. Pick Ben for Acme, Chloe for Globex or Eli to switch between both. Asha and Chloe can initialize their workspace's private note key. Pigeon supplies live customer traffic. To send a message immediately, run `npm run inbound`. After a checker run, use `npm run drizzle` to resume background traffic.

For a single-process demo, set `WEB_ORIGIN=http://localhost:4000` in a root `.env` file and run `npm run start:server` after installing. Open **http://localhost:4000**. Express serves the built React assets on the same origin as the API.

## Configuration

The supplied [.env.example](.env.example) contains the simulator settings. Local runs use them automatically. Environment variables take precedence over the optional root `.env`. With `NODE_ENV=production`, supply the app, MongoDB, Redis, Pigeon and OIDC settings explicitly. Use the IdP's registered callback and HTTPS origins when deploying outside localhost. Session cookies become Secure with an HTTPS callback.

Use a dedicated MongoDB database for this deployment. All instances must use that database, the same Redis service and the same OIDC configuration. MongoDB 7 standalone is sufficient. The application creates its indexes before listening.

## Verify

Stop the app server before running the official checker. The checker owns port 4000, starts its own server instances, resets the assessment inbox and clears Pigeon's test history.

```sh
npm run doctor
npm --prefix scaffold/server test
npm --prefix scaffold/web run typecheck
npm run check
npm run check -- --levels 5
npm run check -- --levels 2
npm run check -- --levels 3
npm run check:full
```

Run the checker in Linux. It uses `sh` and sends `SIGKILL` to Unix process groups. On Windows, use a Linux-native checkout and dependency installation in WSL or a Linux development container. Restart latency on a Windows bind mount affected one local crash run. The full check writes [CHECK_REPORT.json](CHECK_REPORT.json). Level 4 runs only in the organizers' private checker.

The regression tests use an isolated, randomly named MongoDB test database. They check raw-body signatures, timestamp boundaries, unknown events, provider retry headers and concurrent inbox operations. The application also underwent browser checks for desktop and mobile workflows and two-agent encrypted note sharing.

## Implementation

- [Server](scaffold/server/src) contains the event store, projections, outbox, OIDC flow, session checks and WebSocket replay.
- [Web app](scaffold/web/src) contains the workspace inbox, reconnecting client, retryable reply drafts and browser-side note encryption. Font and icon notices ship in [licenses](scaffold/web/public/licenses).
- [Decisions](DECISIONS.md) records tradeoffs and known limits. [Private note protocol](PROTOCOL.md) covers key custody and threat limits. The supplied [brief](BRIEF.md) and [Pigeon contract](PIGEON.md) define the assessment APIs.
