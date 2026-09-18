# Party Popper

A browser-based multiplayer party game hub. The current milestone provides real-time room creation, joining, and a server-authoritative lobby that future minigames can reuse.

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

No database, Redis instance, or custom environment variables are required for this milestone. Railway injects `PORT` automatically. Keep the service at one replica: rooms currently live in that process's memory and reset whenever the service restarts or redeploys. Add shared persistence and the Socket.IO Redis adapter before enabling horizontal scaling.

## Current scope

- Responsive Home, Create, Join, direct-invite, and Lobby routes
- Unique readable room codes and validated player identities
- Live Socket.IO player, ready-state, host, and settings synchronization
- Host-validated kick, transfer-host, close-room, and start-placeholder actions
- Private browser session tokens with a 30-second refresh/reconnect grace period
- Production SPA routing and Railway health check

Actual minigames, scoring, accounts, persistent rooms, and horizontal scaling remain outside this milestone.

## Multiplayer smoke test

With the production server running locally, execute:

```bash
npm run verify:multiplayer
```

This opens independent Socket.IO clients and verifies create, join, live ready state, disconnect, reconnect, host transfer, and room closing.
