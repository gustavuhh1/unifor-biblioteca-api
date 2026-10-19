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

   The defaults already point to the local emulators. Secrets (Resend, FeriadosAPI, Gemini, Google Books) can stay blank until the module that uses them exists.

3. Start the Firebase emulators (Firestore on `8081`, Auth on `9099`, UI on `4000`):

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

| Command              | What it does                         |
| -------------------- | ------------------------------------ |
| `npm test`           | Unit tests (Vitest)                  |
| `npm run test:watch` | Unit tests in watch mode             |
| `npm run lint`       | ESLint                               |
| `npm run format`     | Prettier                             |
| `npm run typecheck`  | Type-check without emitting files    |
| `npm run build`      | Compile to `dist/`                   |
| `npm start`          | Run the compiled server              |
| `npm run seed`       | Load demo data (not implemented yet) |
