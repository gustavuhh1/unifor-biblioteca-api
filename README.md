# Unifor Biblioteca — API

REST API for **Unifor Biblioteca**, a university library app with two profiles: **student** and **librarian**. Students search the catalog, request and renew loans, join queues, save books into folders and receive notices. Librarians run the desk: they register pickups and returns by QR code, manage the catalog, the queues and the fines.

The app (React Native with Expo) never talks to the database: everything goes through this API, which applies the business rules and the permissions of each profile.

- **Production:** <https://api.uni-books.app> (health check: [`/health`](https://api.uni-books.app/health), Swagger UI: [`/docs`](https://api.uni-books.app/docs))
- **Course project** for _Técnicas de Integração de Sistemas_ (Unifor). The app lives in the `unifor-biblioteca-app` repository.

## Contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Features](#features)
- [Routes](#routes)
- [Authentication and permissions](#authentication-and-permissions)
- [External API integration](#external-api-integration)
- [Business rules](#business-rules)
- [Notices: in-app, push and e-mail](#notices-in-app-push-and-e-mail)
- [Scheduled jobs](#scheduled-jobs)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Tests and code quality](#tests-and-code-quality)
- [Loading the demo data](#loading-the-demo-data)
- [Updating the catalog from Open Library and BrasilAPI](#updating-the-catalog-from-open-library-and-brasilapi)
- [Deployment](#deployment)
- [Security](#security)
- [Status and documentation](#status-and-documentation)

## Stack

| Area            | Choice                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 24 (LTS), TypeScript in `strict` mode, Express 5                                                                                      |
| Validation      | Zod, for body, params, query and environment variables                                                                                        |
| API docs        | OpenAPI 3.1 generated from the Zod schemas (`@asteasolutions/zod-to-openapi`) and served by `swagger-ui-express` at `/docs`                   |
| Database / auth | Firestore and Firebase Authentication through `firebase-admin`; Firebase Emulator Suite for local work                                        |
| Passkeys        | `@simplewebauthn/server` (RP ID `uni-books.app`)                                                                                              |
| Dates           | `date-fns` and `@date-fns/tz`, always in `America/Fortaleza`; the business-day rule is our own function in `src/shared/calendar`              |
| E-mail          | Resend                                                                                                                                        |
| Push            | Expo Push (Android only), called over HTTP with the Node `fetch`                                                                              |
| Logging         | `morgan` (`dev` format locally, `short` in production; never logs bodies or headers; `/health` is not logged)                                 |
| Tests           | Vitest, unit tests only                                                                                                                       |
| Tooling         | `tsx` for development, `tsc` for the production build, ESLint and Prettier (no semicolons)                                                    |
| Hosting         | Google Cloud Run (`southamerica-east1`) behind Firebase Hosting at `api.uni-books.app`; Cloud Scheduler for the jobs; Secret Manager for keys |

## Architecture

Every module in `src/modules/<module>/` has the same layers, and each layer has one job:

```text
src/modules/<module>/
  <module>.routes.ts        path + middlewares → controller
  <module>.controller.ts    validates the input with the schema, calls the service, answers
  <module>.docs.ts          Swagger of every route (written before the code)
  <module>.errors.ts        errors with a stable English `code` and a Portuguese message
  schemas/                  Zod schemas of the requests and the responses
  services/                 the flow of each use case; opens the Firestore transactions
  repositories/             the only code that touches Firestore
  rules/                    pure functions (no Firestore, no hidden clock), easy to test
  __tests__/                unit tests
```

A request goes **route → controller → service → repository**. Business rules are pure functions in `rules/`; any write that touches more than one document (loan, queue, fine, signup) runs inside a Firestore transaction, with all reads before the first write.

```text
src/
  app.ts, server.ts        Express app and entry point
  config/                  environment (Zod) and Firebase Admin
  middlewares/             session, role, errors, request log, notice delivery, scheduler auth
  modules/
    auth/                  signup, e-mail token, password, passkeys, session
    catalog/               catalog, book page, librarian CRUD, Open Library and BrasilAPI
    loans/                 requests, renewal, cancellation, expiry, reminders
    queues/                queues and the turn of the first person
    fines/                 fine calculation, freeze and payment
    desk/                  librarian desk: lookup, pickup, return, pickup list, summary
    saved/                 saved books and folders
    notifications/         in-app notices, push, e-mail, preferences, devices
    jobs/                  Cloud Scheduler routines
    assistant/             reserved for the AI assistant (see Status)
  shared/                  types, calendar and business days, repositories used by several modules
  docs/                    OpenAPI document
scripts/                   seed, catalog sync, deploy scripts
docs/                      project documents (in Portuguese)
```

Fundamental types (one per Firestore document and the enums) live only in `src/shared/types`. The Firestore data model has 24 collections (`docs/modelo-de-dados-firestore.md`).

## Features

### Student

- Sign up with the institutional e-mail (`@edu.unifor.br`) and a 20-minute e-mail token; log in with a **passkey** (main way) or with registration number and password.
- Search the catalog, open a book page, request a loan, cancel it before pickup, renew it once, list loans, queues and fines.
- Join the queue of a book (several editions at once), confirm the turn within 24 hours, leave the queue.
- Save books, organize them in folders.
- In-app notices, push notifications and e-mails, with on/off preferences.

### Librarian

- Desk: find the student by QR code, pickup code (`RET-1234`) or registration number; register the pickup and the return; "fine paid now".
- Pending pickups list and the day's summary.
- Catalog management: register a book from its ISBN (Open Library + BrasilAPI), edit, mark as unavailable for new requests, remove, update from the external sources.
- Queues: see, add, move (with confirmation), resend the notice, remove with a reason.
- Fines: open, accruing and paid; register the payment made at the desk.

### System

- Scheduled routines: expire unclaimed orders, advance the queues, reminders, start counting fines, refresh holidays.

## Routes

All routes are documented in the Swagger UI at [`/docs`](https://api.uni-books.app/docs). Routes are in English; error messages for the user are in Portuguese, with a stable English `code`. No session answers `401`; the wrong profile answers `403`.

| Area                    | Routes                                                                                                                                                                           | Access                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| System                  | `GET /health`                                                                                                                                                                    | public                              |
| Signup and recovery     | `POST /auth/signup/start`, `/auth/signup/confirm`, `/auth/signup/resend`, `POST /auth/password/recover`, `/auth/password/reset`                                                  | public                              |
| Passkey login           | `POST /auth/passkey/register`, `/auth/passkey/login/options`, `/auth/passkey/login/verify`                                                                                       | public                              |
| Session and passkeys    | `GET`/`PATCH /me`, `POST /auth/logout`, `GET`/`POST /auth/passkeys`, `DELETE /auth/passkeys/{id}`                                                                                | signed in                           |
| Catalog                 | `GET /books`, `GET /books/{bookId}`                                                                                                                                              | signed in                           |
| Loans                   | `POST /loans`, `GET /me/loans`, `POST /loans/{loanId}/cancel`, `POST /loans/{loanId}/renew`                                                                                      | student                             |
| Queues                  | `GET /books/{bookId}/queue/preview`, `POST /queues`, `GET /me/queues`, `POST /queues/{entryId}/leave`, `POST /queues/{entryId}/confirm`                                          | student                             |
| Fines                   | `GET /me/fines`                                                                                                                                                                  | student                             |
| Saved books and folders | `GET /me/saved`, `PUT`/`DELETE /me/saved/{bookId}`, `GET`/`POST /me/folders`, `PATCH`/`DELETE /me/folders/{folderId}`, `PUT`/`DELETE /me/folders/{folderId}/books/{bookId}`      | student                             |
| Notices                 | `GET /me/notifications`, `POST /me/notifications/read-all`, `PATCH /me/notification-prefs`, `PUT`/`DELETE /me/devices/{deviceId}`                                                | student                             |
| Catalog management      | `GET`/`POST /librarian/books`, `GET /librarian/books/isbn/{isbn}`, `PATCH`/`DELETE /librarian/books/{bookId}`, `POST /librarian/books/{bookId}/sync`                             | librarian                           |
| Queue management        | `GET`/`POST /librarian/books/{bookId}/queue`, `PATCH /librarian/queues/{entryId}/position`, `POST /librarian/queues/{entryId}/resend`, `POST /librarian/queues/{entryId}/remove` | librarian                           |
| Desk                    | `POST /librarian/desk/lookup`, `POST /librarian/loans/{loanId}/pickup`, `POST /librarian/loans/{loanId}/return`, `GET /librarian/pickups`, `GET /librarian/desk/summary`         | librarian                           |
| Fines (desk)            | `GET /librarian/fines`, `POST /librarian/fines/{fineId}/pay`                                                                                                                     | librarian                           |
| Scheduled routines      | `POST /jobs/{job}`                                                                                                                                                               | Cloud Scheduler only (Google token) |

The generated OpenAPI file for the app is kept in the app repository as `docs/api-openapi.json`.

## Authentication and permissions

- **Session.** The app sends the Firebase **ID token** in `Authorization: Bearer <token>`. The API checks it with the Admin SDK (revocation included) and reads the `role` (`student` or `librarian`) from `users/{uid}`. There is no JWT of our own.
- **Profiles.** Every route requires a session and, for the librarian routes, the librarian profile (`403` otherwise). A student only reaches his or her own loans, queues, fines, saved books and notices.
- **Passkeys (main login of the student).** The API creates the challenge and verifies the phone's response with `@simplewebauthn/server`; the private key never leaves the device. A successful login returns a Firebase custom token that the app exchanges for the session. The RP ID is `uni-books.app`; it must not change, or the existing passkeys stop working. The Android app is linked to it by `/.well-known/assetlinks.json`, served by Firebase Hosting.
- **Password.** Stored only in Firebase Authentication. The API never keeps a password, not even a hash, and never logs one.
- **E-mail tokens.** Signup and password recovery use a 20-minute, single-use token sent by Resend, with a 60-second wait between sends.
- **Scheduler.** `POST /jobs/{job}` accepts only the Google **OIDC token** of the `unibooks-scheduler` service account for the audience `https://api.uni-books.app`. The API verifies the RS256 signature against Google's public keys with the Node `crypto` module. No token or an invalid one: `401`; a valid token from another account: `403`; an app session never works there.

## External API integration

For the course requirement of integrating with an external API, the catalog combines the local database with two public APIs that need no key. They are called **in parallel**, with a 5-second timeout each:

| Source                                                     | Used for                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [Open Library](https://openlibrary.org/developers/api)     | title, subtitle, authors, publisher, year, cover, subjects |
| [BrasilAPI (ISBN)](https://brasilapi.com.br/docs#tag/ISBN) | synopsis, and anything Open Library did not bring          |

- `GET /librarian/books/isbn/{isbn}` looks up an ISBN in both sources, without saving anything.
- `POST /librarian/books` registers a book: the external data is merged with the library data (CDU, Cutter, shelf, number of copies) that only the librarian knows.
- `POST /librarian/books/{bookId}/sync` updates an existing book. It **only fills empty fields** and never overwrites a value that exists.

Only registering and updating a book call the sources; searching the catalog and opening a book page never do, and if the sources fail the API serves the data already saved.

The API also uses **FeriadosAPI** (holidays of Fortaleza, cached in Firestore) for the business-day rule, **Resend** for e-mail and **Expo Push** for push notifications.

## Business rules

Defaults (`src/shared/library.ts`, stored in `settings/library`):

| Rule         | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| Loan         | 14 days, one renewal of 14 days (not allowed when overdue or when the book has a queue)      |
| Limits       | up to 10 books between orders and loans, up to 7 queues                                      |
| Pickup       | an order expires if not picked up in 2 business days                                         |
| Due time     | closing time of the library (a Saturday closes earlier); never a Sunday, holiday or recess   |
| Queue        | the first person has 24 hours to confirm the turn, otherwise leaves the queue                |
| Fine         | R$ 2.00 per business day late, no cap, in cents; frozen at the return; paid at the desk only |
| Overdue book | blocks new orders, queues and pickups; an open fine without a late book only warns           |

Business days skip weekends, holidays (FeriadosAPI) and recess days. "Today" can be simulated (`settings/library.simulatedNow`) outside production only.

## Notices: in-app, push and e-mail

Every notice (your turn, pickup ready, due reminder, overdue, return, fine...) is written in the **same transaction** as the event that causes it, under `users/{uid}/notifications`, so the in-app notice always exists.

Right after the transaction, before the response is sent, the API delivers the notice by **push** (Expo, Android only) and by **e-mail** (Resend), and records the result in `delivery`: `sent`, `failed`, `disabled` (the student turned it off), `unsupported` (no Android device with a valid token). A failure never undoes the notice or the request. The delivery runs before the response because Cloud Run only gives CPU to the container while a request is in progress.

The student turns notice types and channels on and off with `PATCH /me/notification-prefs`; "your turn" and "late and fines" are always on. The app keeps its own list fresh by calling `GET /me/notifications`; the push tells it when to do so.

## Scheduled jobs

Cloud Scheduler calls `POST /jobs/{job}`. Each execution is recorded in `jobRuns`, and running a job twice never repeats the work (each document is checked again inside its own transaction).

| Job                | When (America/Fortaleza) | What it does                                                                               |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| `advance_queues`   | every 5 minutes          | whoever missed the 24 hours to confirm leaves the queue and the next person gets the turn  |
| `expire_pickups`   | every 15 minutes         | an order not picked up in time expires and the copy goes to the queue or back to the shelf |
| `due_reminders`    | every day, 8:00          | reminders 2 days before and on the due date, overdue notice, "last day to pick up"         |
| `accrue_fines`     | every day, 6:00          | starts counting the fine of a loan with its first late business day                        |
| `refresh_holidays` | Mondays, 3:00            | fetches the holidays of this year and the next one if they are missing                     |

Create or update the jobs (needs the Cloud Scheduler API enabled and the API already deployed; asks you to type the project ID):

```sh
npm run deploy:scheduler
gcloud scheduler jobs run unibooks-advance-queues --location=southamerica-east1   # run one now
```

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

   The defaults already point to the local emulators. Secrets (Resend, FeriadosAPI, Gemini) can stay blank: without a Resend key the e-mail token is printed in the server console, only when the API talks to the emulators.

3. Start the Firebase emulators (Firestore on `8085`, Auth on `9099`, UI on `4000`):

   ```sh
   npm run emulators
   ```

4. Load the demo data (see below), then start the API in another terminal (restarts on save):

   ```sh
   npm run seed
   npm run dev
   ```

   - Health check: <http://localhost:8080/health>
   - Swagger UI: <http://localhost:8080/docs>

### Commands

| Command                    | What it does                                                              |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | Development server with `tsx` (restarts on save)                          |
| `npm test`                 | Unit tests (Vitest)                                                       |
| `npm run test:watch`       | Unit tests in watch mode                                                  |
| `npm run lint`             | ESLint                                                                    |
| `npm run format`           | Prettier                                                                  |
| `npm run typecheck`        | Type-check without emitting files                                         |
| `npm run build`            | Compile to `dist/`                                                        |
| `npm start`                | Run the compiled server                                                   |
| `npm run emulators`        | Firebase Emulator Suite (Firestore and Auth)                              |
| `npm run seed`             | Load the demo data (emulators by default)                                 |
| `npm run catalog:sync`     | Update the active books that have an ISBN from Open Library and BrasilAPI |
| `npm run deploy:firestore` | Publish the Firestore rules, indexes and TTL to production                |
| `npm run deploy`           | Build the image and publish the API on Cloud Run                          |
| `npm run deploy:scheduler` | Create or update the Cloud Scheduler jobs                                 |

## Environment variables

Only the **names** are here; values live in your local `.env` (ignored by Git) and, in production, in Secret Manager. See `.env.example` and `docs/infra.md`.

| Variable                                                 | Secret | Purpose                                                                         |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `NODE_ENV`, `PORT`                                       | no     | Environment and port (Cloud Run sets `PORT`)                                    |
| `GOOGLE_CLOUD_PROJECT`                                   | no     | Firebase / Google Cloud project                                                 |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | no     | Local emulators. **Never set in production**                                    |
| `PASSKEY_RP_ID`, `PASSKEY_ANDROID_ORIGINS`               | no     | Passkey relying party and the Android app origin (required in production)       |
| `AUTH_EMAIL_DOMAIN`                                      | no     | Domain of the internal e-mail of each Firebase account (`<matricula>@<domain>`) |
| `EMAIL_FROM`                                             | no     | Sender of the e-mails                                                           |
| `RESEND_API_KEY`                                         | yes    | Resend                                                                          |
| `FERIADOS_API_KEY`                                       | yes    | FeriadosAPI (holidays)                                                          |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                         | yes/no | AI assistant (not implemented yet)                                              |
| `SEED_TEST_PASSWORD`                                     | yes    | Password of the test accounts created by the seed (local only)                  |

## Tests and code quality

```sh
npm test            # unit tests (Vitest): business rules, validations, dates, services with an in-memory Firestore
npm run typecheck
npm run lint
npx prettier --check .
npm run build
```

Tests are unit tests only (no end-to-end). Services are tested against a small in-memory Firestore (`src/test-support/fake-firestore.ts`); routes are tested for `401`/`403` with a fake session. Business-day, fine and due-date rules are pure functions with their own tests. Live checks were run against the Emulator Suite.

Code conventions: names in English, comments and test descriptions in Portuguese, money in cents, dates stored in UTC and computed in `America/Fortaleza`, no semicolons.

## Loading the demo data

The seed fills the database with the demo data of `docs/modelo-de-dados-firestore.md` (sections 6 and 8): 12 accounts (11 students and 1 librarian), books, copies, loans, queues, fines, saved books and notices. It runs against the emulators by default, so start them first (`npm run emulators`).

1. Set `SEED_TEST_PASSWORD` in your `.env`: the password of the test accounts. The seed stops with a message if it is missing.
2. Run it:

   ```sh
   npm run seed
   ```

All dates are built from the day the seed runs ("today" in America/Fortaleza), keeping the same situations as the documents: a late loan with a fine accruing, an order with a pickup deadline, a book due soon, and so on. The test accounts are created with the e-mail notices turned off, because their addresses are fictitious. The seed can be run again at any time and always reaches the same state for the same day. Options (pass them after `--`):

| Option                     | What it does                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--with-external-metadata` | Fill cover, synopsis and publisher from Open Library and BrasilAPI. Off by default: without it the seed makes no request for the catalog (deterministic and offline). Not combinable with `--offline` |
| `--offline`                | No external call at all: holidays come from `scripts/data/holidays-2026.json`                                                                                                                         |
| `--prod`                   | Write to **production** (`estoque-pay`). Asks you to type the project ID first                                                                                                                        |
| `--reset`                  | With `--prod` only: wipe the collections before writing. Asks for a second typed confirmation                                                                                                         |

## Updating the catalog from Open Library and BrasilAPI

`npm run catalog:sync` goes through the active books that have an ISBN and updates each one from Open Library and BrasilAPI (title, subtitle, authors, publisher, year, synopsis, cover and subjects; never the CDU, Cutter, shelf, language or copies). It only fills empty fields: a value that already exists is never overwritten. It calls the same service as `POST /librarian/books/{bookId}/sync`, waits between calls (`SYNC_PAUSE_MS` in `scripts/catalog-sync/run.ts`) and records the audit log entries with the actor `system`. At the end it prints how many books were updated, not found, failed and skipped (no ISBN).

It runs against the emulators by default. To run it against production, pass `--prod` and type the project ID when asked:

```sh
npm run catalog:sync            # emulators
npm run catalog:sync -- --prod  # production, with typed confirmation
```

## Deployment

The API runs on **Google Cloud Run** (service `unibooks-api`, region `southamerica-east1`, project `estoque-pay`) and is published at **<https://api.uni-books.app>** by Firebase Hosting, which forwards every request to Cloud Run.

Production never uses the emulators and has no key in the repository: the Resend, FeriadosAPI and Gemini keys come from Secret Manager (`resend-api-key`, `feriados-api-key`, `gemini-api-key`, always the `latest` version), and the other variables come from your local `.env`. `PASSKEY_ANDROID_ORIGINS` is required: without it the passkey of the Android app does not work.

### Requirements

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login`) and the Firebase CLI, both signed in to the account that owns the `estoque-pay` project.
- A clean Git working tree: the image is tagged with the commit hash.

### Steps

Each command asks you to type the project ID before it touches production.

1. Publish the Firestore security rules, indexes and TTL policies (the TTLs are declared in `firestore.indexes.json`):

   ```sh
   npm run deploy:firestore
   ```

2. Build the image in Cloud Build, push it to Artifact Registry and publish the Cloud Run service (0 to 2 instances, public access: the routes are protected by the Firebase ID token inside the API):

   ```sh
   npm run deploy
   ```

3. Create or update the Cloud Scheduler jobs (once, and again if a schedule changes):

   ```sh
   npm run deploy:scheduler
   ```

4. Only when `firebase.json` or `assetlinks.json` change, publish Firebase Hosting:

   ```sh
   npx firebase deploy --only hosting --project estoque-pay
   ```

### One-time setup

The Artifact Registry repository keeps only the 2 most recent images (the free tier is 0.5 GiB):

```sh
gcloud artifacts repositories create unibooks --repository-format=docker --location=southamerica-east1 --project=estoque-pay
gcloud artifacts repositories set-cleanup-policies unibooks --location=southamerica-east1 --project=estoque-pay --policy=deploy/artifact-cleanup-policy.json --no-dry-run
```

### Checking a deploy

- `GET /health` answers `200` and `/docs` opens.
- `GET /me` without a token answers `401`, and `POST /jobs/accrue_fines` without a token answers `401`.
- <https://uni-books.app/.well-known/assetlinks.json> answers `200`.
- `gcloud run services describe unibooks-api --region=southamerica-east1` shows the service account and the three secrets, and no `*_EMULATOR_HOST` variable.
- Each request shows up in Cloud Logging as a one-line `morgan` entry (`/health` is not logged).

### Firebase Hosting

`hosting/public` is the Hosting site of `uni-books.app` and `api.uni-books.app` (one site, `estoque-pay`). It serves `/.well-known/assetlinks.json`, which links the Android app to the passkey RP ID. The `ignore` list in `firebase.json` must not hide dotfiles, or `.well-known` is left out of the deploy. The `rewrites` entry sends everything that is not a static file to Cloud Run. Hosting forwards the `Authorization` header, which the session depends on.

## Security

- No key, password or token is written in code, tests, logs or documents; only variable **names** are versioned. This repository is public.
- Firestore security rules deny every client access: only the Admin SDK, used by this API, reads and writes.
- Everything runs against the Emulator Suite by default. Scripts that write to production require `--prod` and a typed confirmation of the project ID.
- Passwords exist only in Firebase Authentication; passkey private keys never leave the device; e-mail tokens are single-use and expire in 20 minutes.
- Cloud Run has a spending cap and an alert on the billing account.

## Status and documentation

Implemented and in production: authentication (signup, passkeys, password), catalog and librarian CRUD with the external sources, loans, queues, fines, the librarian desk, saved books and folders, notices (in-app, push, e-mail), and the scheduled routines.

**Not implemented yet:** the AI assistant (Gemini). The `assistant` module and its collections are reserved.

The project documents are in `docs/` (in Portuguese) and are the source of truth: `escopo.md` (scope and decisions), `requisitos.md` (85 functional and 28 non-functional requirements), `modelo-de-dados-firestore.md` (the 24 collections, indexes, rules and the seed), `regras-e-decisoes.md`, `api-decisoes-tecnicas.md` and `infra.md` (accounts, region, domains and variable names).

## License

See [LICENSE](LICENSE).
