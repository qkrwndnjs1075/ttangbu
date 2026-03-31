import { Hono } from 'hono'

const health = new Hono()

health.get('/', (c) => {
  return c.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  )
})

export default health
