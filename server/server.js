import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import {
  addOrderItem,
  addPayment,
  advanceKitchen,
  cancelOrder,
  closeCashRegister,
  createOrder,
  getBootstrap,
  getDashboard,
  getKitchen,
  getMenu,
  getOrderForTable,
  getReports,
  login,
  recoverPassword,
  register,
  removeOrderItem,
  sendKitchen,
  updateOrder,
} from './services.js'

const port = Number(process.env.PORT || 4000)
const publicDir = resolve('dist')

const routes = [
  ['POST', /^\/api\/auth\/login$/, async ({ body }) => login(body)],
  ['POST', /^\/api\/auth\/register$/, async ({ body }) => register(body)],
  ['POST', /^\/api\/auth\/recover$/, async ({ body }) => recoverPassword(body)],
  ['GET', /^\/api\/bootstrap$/, async ({ query }) => getBootstrap(query.userId)],
  ['GET', /^\/api\/dashboard$/, async ({ query }) => getDashboard(query.branchId, query.userId)],
  ['GET', /^\/api\/menu$/, async ({ query }) => getMenu(query.branchId, query.category, query.search)],
  ['GET', /^\/api\/orders\/table\/([^/]+)$/, async ({ params }) => getOrderForTable(params[0])],
  ['POST', /^\/api\/orders$/, async ({ body }) => createOrder(body)],
  ['POST', /^\/api\/orders\/([^/]+)\/items$/, async ({ params, body }) => addOrderItem(params[0], body)],
  ['DELETE', /^\/api\/orders\/([^/]+)\/items\/([^/]+)$/, async ({ params }) => removeOrderItem(params[0], params[1])],
  ['PATCH', /^\/api\/orders\/([^/]+)$/, async ({ params, body }) => updateOrder(params[0], body)],
  ['POST', /^\/api\/orders\/([^/]+)\/send-kitchen$/, async ({ params }) => sendKitchen(params[0])],
  ['POST', /^\/api\/orders\/([^/]+)\/cancel$/, async ({ params, body }) => cancelOrder(params[0], body.userId)],
  ['GET', /^\/api\/kitchen$/, async ({ query }) => getKitchen(query.branchId, query.userId)],
  ['PATCH', /^\/api\/kitchen\/orders\/([^/]+)$/, async ({ params, body }) => advanceKitchen(params[0], body.estado)],
  ['POST', /^\/api\/payments$/, async ({ body }) => addPayment(body)],
  ['GET', /^\/api\/reports$/, async ({ query }) => getReports(query.branchId, query.userId)],
  ['POST', /^\/api\/cash-close$/, async ({ body }) => closeCashRegister(body)],
]

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {})
      return
    }
    const url = new URL(request.url, `http://${request.headers.host}`)
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url)
      return
    }
    await handleStatic(response, url.pathname)
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || 'Error interno del servidor' })
  }
})

server.listen(port, () => {
  console.log(`RestaurantManager API escuchando en http://localhost:${port}`)
})

async function handleApi(request, response, url) {
  const route = routes.find(([method, pattern]) => method === request.method && pattern.test(url.pathname))
  if (!route) {
    sendJson(response, 404, { error: 'Ruta no encontrada' })
    return
  }
  const [, pattern, handler] = route
  const params = url.pathname.match(pattern).slice(1).map(decodeURIComponent)
  const query = Object.fromEntries(url.searchParams.entries())
  const body = await readBody(request)
  const result = await handler({ params, query, body })
  sendJson(response, 200, result)
}

async function readBody(request) {
  if (!['POST', 'PATCH', 'PUT'].includes(request.method)) return {}
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  response.end(JSON.stringify(payload))
}

async function handleStatic(response, pathname) {
  const target = pathname === '/' ? 'index.html' : pathname.slice(1)
  const filePath = join(publicDir, target)
  try {
    const content = await readFile(filePath)
    response.writeHead(200, { 'Content-Type': contentType(filePath) })
    response.end(content)
  } catch {
    const content = await readFile(join(publicDir, 'index.html'))
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(content)
  }
}

function contentType(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  }
  return types[extname(filePath)] || 'application/octet-stream'
}
