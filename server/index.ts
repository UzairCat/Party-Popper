import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT) || 3000
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const clientDirectory = path.resolve(currentDirectory, '../dist')

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

app.listen(port, '0.0.0.0', () => {
  console.log(`Party Popper is listening on port ${port}`)
})
