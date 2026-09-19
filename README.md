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

If the retired quiz was previously configured, remove `OPENAI_API_KEY` and `OPENAI_QUIZ_MODEL` from Railway. They are no longer read by the application. The OpenAI API key created for that quiz was set to be valid for 150 days; check its expiry if it is ever reused for another feature.

## Game-pack architecture

The Party Popper core owns rooms, players, host controls, connections, and game selection. Own It! is the first game pack and owns its own menu, 40-space board data, match settings, card decks, turns, economy, and winner state. There is no shared lobby ready-up system.

## Own It!

Create a room with 2–8 connected players and choose **Own It!**. Each player chooses one of 16 characters and 16 colours, then presses **Ready up** in the Own It! setup screen. The host chooses the **Classic** or **South Africa** board, adjusts the rules, and starts once everyone is ready. Characters and ready states belong to Own It!, not the Party Popper room.

The highest opening dice roll leads. On your turn, click or keyboard-activate the two dice to roll; the physical dice animation settles on the server's result. Buy or auction property, collect rent, complete colour sets, build, trade, mortgage, and settle debt. Chance and Community Chest cards appear in the board centre when drawn. The last solvent player wins; limited matches use net worth: cash + full purchase value of unmortgaged property + mortgage value of mortgaged property + full cost of existing buildings.

The server decides rolls, payments, ownership, timers, trades, auctions, bankruptcy, and turn order. Players can refresh or reconnect to restore the current match. Disconnected players remain in the match; after 30 seconds their turns are automated, and an unattended debt is liquidated before bankruptcy. The host can pause or end the match from the game menu. The current game is held in the server process, so a Railway restart or redeploy will end an in-progress match; save/resume across deployments is not part of this version. Keep one Railway replica.

## Current scope

- Responsive Home, Create, Join, direct-invite, and Lobby routes
- Unique readable room codes and validated player identities
- Live Socket.IO player, host, and settings synchronization
- Host-validated kick, transfer-host, close-room, and game-selection actions
- Synchronized party-lobby and game-selection phases
- Own It! game card, dedicated avatar/colour ready-up, two map choices, and configurable presets/advanced rules
- Server-authoritative Own It! board, auctions, buildings, cards, mortgages, trades, debt, jail, time/round limits, winner and post-game navigation
- No shared ready-up state; game packs control their own start requirements
- Private browser session tokens with a 30-second refresh/reconnect grace period
- Session recovery on refresh and automatic host migration after the reconnect grace period
- Production SPA routing and Railway health check

Accounts, permanent player statistics, persistence, and horizontal scaling remain future work.

## Multiplayer smoke test

With the production server running locally, execute:

```bash
npm run verify:multiplayer
```

This verifies room creation, joining, Own It! setup synchronization, a shared roll, reconnecting into the running match, host transfer, and room closure through real sockets.
