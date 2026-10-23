# Unifor Biblioteca — API

REST API for Unifor Biblioteca, a university library app. Node + TypeScript + Express, with Firestore and Firebase Authentication behind it.

> Work in progress: only the project skeleton exists so far (`GET /health` and the Swagger docs). The full README comes with the final delivery.

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

| Command                | What it does                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `npm test`             | Unit tests (Vitest)                                                                   |
| `npm run test:watch`   | Unit tests in watch mode                                                              |
| `npm run lint`         | ESLint                                                                                |
| `npm run format`       | Prettier                                                                              |
| `npm run typecheck`    | Type-check without emitting files                                                     |
| `npm run build`        | Compile to `dist/`                                                                    |
| `npm start`            | Run the compiled server                                                               |
| `npm run seed`         | Load the demo data (see below)                                                        |
| `npm run catalog:sync` | Update the active books that have an ISBN from Open Library and BrasilAPI (see below) |

## Updating the catalog from Open Library and BrasilAPI

`npm run catalog:sync` goes through the active books that have an ISBN and updates each one from Open Library and BrasilAPI (title, subtitle, authors, publisher, year, synopsis, cover and subjects; never the CDU, Cutter, shelf, language or copies). Open Library comes first for title, authors, cover and subjects; BrasilAPI brings the synopsis and fills what is empty. Neither needs an API key. It calls the same service as `POST /librarian/books/{bookId}/sync`, waits between calls (`SYNC_PAUSE_MS` in `scripts/catalog-sync/run.ts`) and records the audit log entries with the actor `system`. At the end it prints how many books were updated, not found, failed and skipped (no ISBN).

It runs against the emulators by default. To run it against production, pass `--prod` and type the project ID when asked:

```sh
npm run catalog:sync            # emulators
npm run catalog:sync -- --prod  # production, with typed confirmation
```

## Firebase Hosting

`hosting/public` is the Hosting site of `uni-books.app`. It serves `/.well-known/assetlinks.json`, which links the Android app to the passkey RP ID (`uni-books.app`). The `ignore` list in `firebase.json` must not hide dotfiles, or `.well-known` is left out of the deploy. Deploy only this part with `firebase deploy --only hosting`.

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
