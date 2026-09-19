# Party Popper

A browser-based multiplayer party game hub with real-time rooms and Four Choice: an AI-generated, server-authoritative multiplayer quiz.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The development command runs Vite on port `5173` and the Socket.IO/Express server on port `3000`. Vite proxies real-time traffic to the server.

Set `OPENAI_API_KEY` in the server process environment for AI generation. `.env.example` lists the variables; `.env` files are not automatically loaded by the server. Without a key the lobby still works, and starting a quiz shows a configuration message.

## Quality checks

```bash
npm run check
```

## Production

```bash
npm run build
npm start
```

The Node server serves the built single-page app and exposes `GET /health`. It reads Railway's automatically supplied `PORT` variable.

## Railway

1. Create a Railway service from this GitHub repository and deploy the `main` branch.
2. Leave the root directory at `/`.
3. In the service settings, confirm the build command is `npm run build` and the start command is `npm start`.
4. Set the health-check path to `/health`.
5. Under **Settings → Networking → Public Networking**, generate a Railway domain.

6. In the existing service's **Variables** tab, add `OPENAI_API_KEY` with an OpenAI API key from a project with API billing enabled. Never use a `VITE_` prefix for a secret.

   **Key-expiry reminder:** The deployment key created on 19 September 2026 is valid for 150 days and is expected to expire around **16 February 2027**. If AI quiz generation suddenly stops working around then, create a replacement key and update `OPENAI_API_KEY` in Railway's **Variables** tab.

7. Optionally add `OPENAI_QUIZ_MODEL=gpt-4.1-mini` (the default). Use a Responses API model supporting Structured Outputs.
8. Deploy the variable changes, create a new room, join on two devices, select Four Choice, choose five questions for an initial check, and press Start game.

No additional Railway service or database is needed. Railway injects `PORT` automatically. Keep one replica: rooms, scores, and recent question history live in process memory and reset on restart/redeploy. Add persistence and the Socket.IO Redis adapter before horizontal scaling.

## How question generation works

The backend uses the [OpenAI Responses API with Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). It generates the entire match before play in bounded batches, asking for extra candidates. Local validation enforces four distinct answers, a valid answer index, selected category, difficulty, and unique normalized question/concept. An independent AI review solves questions without seeing the proposed key and rejects ambiguous, uncertain, duplicate, or mismatched questions. Only questions where both passes agree are accepted, with replacement batches when necessary.

Categories are balanced to within one question. Answers are shuffled once per room. The most recent 500 accepted questions in each room are excluded from subsequent requests; this history is not persistent or global across rooms. AI review reduces mistakes but is not independent source-backed verification and cannot guarantee every fact is correct.

Generation has a five-minute overall timeout, a 75-second per-request timeout, bounded replacement attempts, a 30-second per-room start cooldown, and at most two concurrent preparations per server. Each preparation involves paid generation and review calls. A failed preparation never starts a partial match or silently falls back to static questions. Provider error bodies and credentials are not sent to players.

## Current scope

- Responsive Home, Create, Join, direct-invite, and Lobby routes
- Unique readable room codes and validated player identities
- Live Socket.IO player, ready-state, host, and settings synchronization
- Host-validated kick, transfer-host, close-room, and game-selection actions
- Synchronized room phases: party lobby, game selection, and game-specific setup
- Registered Four Choice game card and dedicated Classic-mode menu
- Host-only time, question-count, difficulty, and category controls
- Fifteen selectable categories with Select All, Unselect All, and zero-category start protection
- Private browser session tokens with a 30-second refresh/reconnect grace period
- Complete quiz: batch generation, countdown, question intros, four answers, reveal, scoring, leaderboard and final results
- Server receipt timestamps determine 500–1000 points for correct answers; wrong or missing answers earn zero
- Eight-second leaderboard minimum and host-only next question
- One-second early finish once everyone has answered; normal timeout otherwise
- Personalized snapshots hide correct answers until reveal and hide other players' choices
- Replay with fresh questions, preserved settings, and return to game selection
- Match recovery on refresh, host migration, and no new players joining a running match
- Production SPA routing and Railway health check

Accounts, permanent player statistics, persistent question storage, source-backed fact verification, and horizontal scaling remain future work.

## Multiplayer smoke test

With the production server running locally, execute:

```bash
npm run verify:multiplayer
```

This verifies the lobby and setup without starting AI generation or spending API credits.

After a production build, run the standalone full-game integration check:

```bash
npm run verify:quiz
```

It starts an isolated local server with an injected fixture generator and controllable clock, then verifies two complete matches through real sockets: answer privacy, host permissions, immutable answers, reconnect, deadlines, the eight-second gate, host transfer, replay, and return to menus. Unit tests mock the OpenAI HTTP boundary to test schema requests, review, rejection, replacement, errors and duplicate filtering. These checks do not prove live API credentials or account access; verify a real five-question match after configuring Railway.
