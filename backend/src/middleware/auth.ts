import { Context, Next } from 'hono'
import { getDb } from '../lib/db.js'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: string
}

// Extend Hono's context to include user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser | null
  }
}

/**
 * Auth middleware that resolves current user from session token
 * Sets c.get('user') if valid session exists, null otherwise
 * Does NOT enforce authentication - use requireAuth for that
 */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')

  if (!token) {
    c.set('user', null)
    await next()
    return
  }

  try {
    const db = getDb()

    // Join sessions with users to get user data
    const row = db
      .prepare(
        `
      SELECT 
        u.id, u.email, u.name, u.role,
        s.expires_at, s.id as session_id
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
      LIMIT 1
    `
      )
      .get(token) as
      | {
          id: number
          email: string
          name: string
          role: string
          expires_at: string
          session_id: number
        }
      | undefined

    if (!row) {
      c.set('user', null)
      await next()
      return
    }

    // Check if session expired
    const expiresAt = new Date(row.expires_at)
    if (expiresAt < new Date()) {
      // Delete expired session
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id)
      c.set('user', null)
      await next()
      return
    }

    // Update last_used_at
    db.prepare("UPDATE sessions SET last_used_at = datetime('now', 'utc') WHERE id = ?").run(
      row.session_id
    )

    // Set user context
    c.set('user', {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    })

    await next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    c.set('user', null)
    await next()
  }
}

/**
 * Require authenticated user - returns 401 if not authenticated
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user')

  if (!user) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required',
        path: new URL(c.req.url).pathname,
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  await next()
}
