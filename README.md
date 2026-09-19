# Party Popper

A browser-based multiplayer party game hub with real-time rooms and a modular home for future game packs.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The development command runs Vite on port `5173` and the Socket.IO/Express server on port `3000`. Vite proxies real-time traffic to the server.

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
6. Deploy, create a room, and join from a second device to verify synchronization.

No additional Railway service, database, or OpenAI API key is needed. Railway injects `PORT` automatically. Keep one replica: rooms live in process memory and reset on restart/redeploy. Add persistence and the Socket.IO Redis adapter before horizontal scaling.

If the retired quiz was previously configured, remove `OPENAI_API_KEY` and `OPENAI_QUIZ_MODEL` from Railway. They are no longer read by the application.

## Game-pack architecture

The Party Popper core owns rooms, players, host controls, connections, and game selection. Individual game packs will own their own player requirements, ready checks, settings, rules, state, and scoring. No game packs are currently registered, so the game-selection screen intentionally shows a coming-soon state.

## Current scope

- Responsive Home, Create, Join, direct-invite, and Lobby routes
- Unique readable room codes and validated player identities
- Live Socket.IO player, host, and settings synchronization
- Host-validated kick, transfer-host, close-room, and game-selection actions
- Synchronized party-lobby and game-selection phases
- Empty game library ready for independently registered game packs
- Ready checks deliberately belong to individual games rather than the shared lobby
- Private browser session tokens with a 30-second refresh/reconnect grace period
- Session recovery on refresh and automatic host migration after the reconnect grace period
- Production SPA routing and Railway health check

Game packs, accounts, permanent player statistics, persistence, and horizontal scaling remain future work.

## Multiplayer smoke test

With the production server running locally, execute:

```bash
npm run verify:multiplayer
```

This verifies room creation, joining, game-library navigation, reconnect behavior, host transfer, and room closure through real sockets.
