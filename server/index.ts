import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/protocol.js'
import { RoomManager } from './room-manager.js'
import { registerSocketHandlers } from './socket-handlers.js'

const app = express()
const httpServer = createServer(app)
const port = Number(process.env.PORT) || 3000
const clientDirectory = path.resolve(process.cwd(), 'dist')
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer)
const roomManager = new RoomManager()

app.disable('x-powered-by')
app.use(express.json())

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.use(express.static(clientDirectory))

// React Router owns every non-API route in the browser.
app.use((_request, response) => {
  response.sendFile(path.join(clientDirectory, 'index.html'))
})

registerSocketHandlers(io, roomManager)

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Party Popper is listening on port ${port}`)
})

const shutdown = () => {
  io.close(() => process.exit(0))

  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
