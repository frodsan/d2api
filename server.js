const express = require("express")
const http = require("http")
const gfunc = require("./index.js")

const app = express()
const server = http.createServer(app)
const port = process.env.PORT || 1437

server.on("connection", socket => socket.unref())
server.listen(port)

Object.keys(gfunc).forEach((fn) => {
  app.get(`/${fn}`, (req, res) => {
    gfunc[fn](req, res)
  })
})

const shutdown = () => {
  const timeout = 5 * 1000 // 5 seconds

  server.close(() => process.exit())

  setTimeout(() => process.exit(), timeout)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
