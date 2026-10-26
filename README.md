# Unifor Biblioteca — API

REST API for Unifor Biblioteca, a university library app. Node + TypeScript + Express, with Firestore and Firebase Authentication behind it.

Implemented modules include Firebase/passkey authentication, catalog, loans,
queues, fines, the librarian desk and scheduled circulation routines. The live
OpenAPI contract is available at `/docs`.

## Librarian desk and scheduled jobs

All `/librarian/*` routes require an authenticated user with the `librarian`
role (invalid/missing session: `401`; wrong role: `403`):

- `GET /librarian/dashboard` — operational counters.
- `GET /librarian/students/lookup?identifier=...` — matrícula, pickup code or QR token.
- `GET /librarian/pickups?matricula=...` — pending pickups ordered by deadline.
- `POST /librarian/loans/{loanId}/pickup` — register pickup and calculate due date.
- `POST /librarian/loans/{loanId}/return` — register return; `{ "paidNow": true }` records an overdue fine as paid at the desk.

The internal `POST /internal/jobs/{job}` route only accepts the Google-signed
OIDC identity configured for Cloud Scheduler. It runs `expire_pickups`,
`advance_queues`, `due_reminders`, `accrue_fines` or `refresh_holidays`, and
records each execution in `jobRuns`.

## Running locally

### Requirements

- Node.js 24 (LTS)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) and Java 21+, for the Emulator Suite

### Steps

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Create your local environment file. It is ignored by Git; never commit it.

   ```sh
   cp .env.example .env
   ```

   The defaults already point to the local emulators. Secrets (Resend, FeriadosAPI, Gemini) can stay blank until the module that uses them exists.

3. Start the Firebase emulators (Firestore on `8085`, Auth on `9099`, UI on `4000`):

   ```sh
   npm run emulators
   ```

4. In another terminal, start the API (restarts on save):

   ```sh
   npm run dev
   ```

   - Health check: <http://localhost:8080/health>
   - Swagger UI: <http://localhost:8080/docs>

### Other commands

| Command                    | What it does                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `npm test`                 | Unit tests (Vitest)                                                                   |
| `npm run test:watch`       | Unit tests in watch mode                                                              |
| `npm run lint`             | ESLint                                                                                |
| `npm run format`           | Prettier                                                                              |
| `npm run typecheck`        | Type-check without emitting files                                                     |
| `npm run build`            | Compile to `dist/`                                                                    |
| `npm start`                | Run the compiled server                                                               |
| `npm run seed`             | Load the demo data (see below)                                                        |
| `npm run catalog:sync`     | Update the active books that have an ISBN from Open Library and BrasilAPI (see below) |
| `npm run deploy:firestore` | Publish the Firestore rules, indexes and TTL to production (see Deployment)           |
| `npm run deploy`           | Build the image and publish the API on Cloud Run (see Deployment)                     |
| `npm run deploy:scheduler` | Create/update the five authenticated Cloud Scheduler jobs                             |

## Updating the catalog from Open Library and BrasilAPI

`npm run catalog:sync` goes through the active books that have an ISBN and updates each one from Open Library and BrasilAPI (title, subtitle, authors, publisher, year, synopsis, cover and subjects; never the CDU, Cutter, shelf, language or copies). It only fills empty fields: a title, subtitle, authors, publisher, year, synopsis, cover or subjects value that already exists is never overwritten. Open Library comes first for title, authors, cover and subjects; BrasilAPI brings the synopsis and fills what is empty. Neither needs an API key. It calls the same service as `POST /librarian/books/{bookId}/sync`, waits between calls (`SYNC_PAUSE_MS` in `scripts/catalog-sync/run.ts`) and records the audit log entries with the actor `system`. At the end it prints how many books were updated, not found, failed and skipped (no ISBN).

It runs against the emulators by default. To run it against production, pass `--prod` and type the project ID when asked:

```sh
npm run catalog:sync            # emulators
npm run catalog:sync -- --prod  # production, with typed confirmation
```

## Deployment

The API runs on **Google Cloud Run** (service `unibooks-api`, region `southamerica-east1`, project `estoque-pay`) and is published at **<https://api.uni-books.app>** by Firebase Hosting, which forwards every request to Cloud Run.

- Health check: <https://api.uni-books.app/health>
- Swagger UI: <https://api.uni-books.app/docs>

Production never uses the emulators and has no key in the repository: the Resend, FeriadosAPI and Gemini keys come from Secret Manager (`resend-api-key`, `feriados-api-key`, `gemini-api-key`, always the `latest` version), and the other variables come from your local `.env` (see `.env.example` and `docs/infra.md`). `PASSKEY_ANDROID_ORIGINS` is required: without it the passkey of the Android app does not work.

### Requirements

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login`) and the Firebase CLI, both signed in to the account that owns the `estoque-pay` project.
- A clean Git working tree: the image is tagged with the commit hash.

### Steps

Each command asks you to type the project ID before it touches production.

1. Publish the Firestore security rules, indexes and TTL policies:

   ```sh
   npm run deploy:firestore
   ```

2. Build the image in Cloud Build, push it to Artifact Registry and publish the Cloud Run service (0 to 2 instances, public access: the routes are protected by the Firebase ID token inside the API):

   ```sh
   npm run deploy
   ```

3. Only when `firebase.json` or `assetlinks.json` change, publish Firebase Hosting:

   ```sh
   npx firebase deploy --only hosting --project estoque-pay
   ```

4. Create or update the scheduled circulation routines (safe to run again):

   ```sh
   npm run deploy:scheduler
   ```

   Scheduler calls `POST /internal/jobs/{job}` with a Google-signed OIDC token
   from `unibooks-scheduler@<project>.iam.gserviceaccount.com`. The API checks
   the signature, audience and exact service-account e-mail before running a job.

### One-time setup

The Artifact Registry repository keeps only the 2 most recent images (the free tier is 0.5 GiB):

```sh
gcloud artifacts repositories create unibooks --repository-format=docker --location=southamerica-east1 --project=estoque-pay
gcloud artifacts repositories set-cleanup-policies unibooks --location=southamerica-east1 --project=estoque-pay --policy=deploy/artifact-cleanup-policy.json --no-dry-run
```

### Checking a deploy

- `GET /health` answers `200` and `/docs` opens.
- `GET /me` without a token answers `401`.
- <https://uni-books.app/.well-known/assetlinks.json> answers `200`.
- `gcloud run services describe unibooks-api --region=southamerica-east1` shows the service account and the three secrets, and no `*_EMULATOR_HOST` variable.
- Each request shows up in Cloud Logging as a one-line `morgan` entry (`/health` is not logged).

## Firebase Hosting

`hosting/public` is the Hosting site of `uni-books.app` and `api.uni-books.app` (one site, `estoque-pay`). It serves `/.well-known/assetlinks.json`, which links the Android app to the passkey RP ID (`uni-books.app`). The `ignore` list in `firebase.json` must not hide dotfiles, or `.well-known` is left out of the deploy. The `rewrites` entry sends everything that is not a static file to Cloud Run, so `uni-books.app` also answers with the API outside the static files. Deploy only this part with `firebase deploy --only hosting`.

## Loading the demo data

The seed fills the database with the demo data of `docs/modelo-de-dados-firestore.md` (sections 6 and 8). It runs against the emulators by default, so start them first (`npm run emulators`).

1. Set `SEED_TEST_PASSWORD` in your `.env`: the password of the test accounts. The seed stops with a message if it is missing.
2. Run it:

   ```sh
   npm run seed
   ```

All dates are built from the day the seed runs ("today" in America/Fortaleza), keeping the same situations as the documents: a late loan with a fine accruing, an order with a pickup deadline, a book due soon, and so on. The exact dates in `docs/` are only the example of 15/10. The frozen amounts of the open fines stay fixed.

It can be run again at any time and always reaches the same state for the same day. Options (pass them after `--`):

| Option                     | What it does                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--with-external-metadata` | Fill cover, synopsis and publisher from Open Library and BrasilAPI. Off by default: without it the seed makes no request for the catalog (deterministic and offline). Not combinable with `--offline` |
| `--offline`                | No external call at all: holidays come from `scripts/data/holidays-2026.json`                                                                                                                         |
| `--prod`                   | Write to **production** (`estoque-pay`). Asks you to type the project ID first                                                                                                                        |
| `--reset`                  | With `--prod` only: wipe the collections before writing. Asks for a second typed confirmation                                                                                                         |
