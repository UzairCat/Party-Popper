# Party Popper

A browser-based multiplayer party game hub. The current milestone is the responsive Stage 1 interface described in the project plan: home, room creation, room joining, and a lobby shell with sample data.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

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

No database, Redis instance, or custom environment variables are required for the static UI milestone. Railway injects `PORT` automatically. Keep the future in-memory multiplayer server at one replica; add Redis before enabling horizontal scaling so every instance can share room and Socket.IO state.

## Current scope

- Responsive Home, Create, Join, and Lobby routes
- Reusable identity, player-card, room-code, modal, toast, and settings UI
- Local prototype interactions and fake lobby players
- Production-ready SPA routing and Railway health check

Room creation, WebSocket events, session recovery, and authoritative host actions are intentionally deferred to the multiplayer milestone.
