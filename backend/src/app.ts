import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { authMiddleware } from './middleware/auth.js'
import { requestSizeGuard } from './middleware/guardrails.js'
import health from './routes/health.js'
import auth from './routes/auth.js'
import listings from './routes/listings.js'
import applications from './routes/applications.js'
import messages from './routes/messages.js'
import vworld from './routes/vworld.js'

const app = new Hono()

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-VWorld-Key')
  
  if (c.req.method === 'OPTIONS') {
    return c.text('OK')
  }
  
  return await next()
})

// Middleware
app.use(logger())
app.use('*', requestSizeGuard())
app.use(authMiddleware)
app.use(errorHandler)

// Routes
app.route('/health', health)
app.route('/auth', auth)
app.route('/listings', listings)
app.route('/applications', applications)
app.route('/vworld', vworld)
app.route('/', messages)

// 404 handler
app.all('*', notFoundHandler)

export default app
