import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { hashPassword, verifyPassword, generateToken } from '../lib/crypto.js'
import { requireAuth } from '../middleware/auth.js'
import { createErrorResponse } from '../middleware/error.js'
import { createRateLimiter, readSecurityEnvInt } from '../middleware/guardrails.js'

const auth = new Hono()

// ============================================================
// Validation Schemas
// ============================================================
const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  phone: z.string().optional(),
})

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

const registerRateLimit = createRateLimiter({
  windowMs: readSecurityEnvInt('REGISTER_RATE_LIMIT_WINDOW_MS', 60_000),
  maxRequests: readSecurityEnvInt('REGISTER_RATE_LIMIT_MAX', 10),
  keyPrefix: 'auth-register',
  errorMessage: 'Too many registration attempts. Please try again later.',
})

const loginRateLimit = createRateLimiter({
  windowMs: readSecurityEnvInt('LOGIN_RATE_LIMIT_WINDOW_MS', 60_000),
  maxRequests: readSecurityEnvInt('LOGIN_RATE_LIMIT_MAX', 5),
  keyPrefix: 'auth-login',
  errorMessage: 'Too many login attempts. Please try again in a minute.',
})

// ============================================================
// POST /auth/register - Create new user account
// ============================================================
auth.post('/register', registerRateLimit, async (c) => {
  try {
    const body = await c.req.json()
    const validated = RegisterSchema.parse(body)

    const db = getDb()

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(validated.email)

    if (existing) {
      return c.json(
        createErrorResponse('Email already registered', '/auth/register', 'ConflictError'),
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = hashPassword(validated.password)

    // Insert user
    const result = db
      .prepare(
        `
      INSERT INTO users (email, password_hash, name, phone, role)
      VALUES (?, ?, ?, ?, 'user')
      RETURNING id, email, name, phone, role, created_at
    `
      )
      .get(validated.email, passwordHash, validated.name, validated.phone ?? null) as {
      id: number
      email: string
      name: string
      phone: string | null
      role: string
      created_at: string
    }

    return c.json(
      {
        success: true,
        data: {
          user: {
            id: result.id,
            email: result.email,
            name: result.name,
            phone: result.phone,
            role: result.role,
            created_at: result.created_at,
          },
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Concatenate validation errors into a single message
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', '/auth/register', 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Register error:', error)
    return c.json(
      createErrorResponse('Registration failed', '/auth/register'),
      { status: 500 }
    )
  }
})

// ============================================================
// POST /auth/login - Authenticate and create session
// ============================================================
auth.post('/login', loginRateLimit, async (c) => {
  try {
    const body = await c.req.json()
    const validated = LoginSchema.parse(body)

    const db = getDb()

    // Get user with password hash
    const user = db
      .prepare(
        `
      SELECT id, email, password_hash, name, phone, role
      FROM users
      WHERE email = ?
      LIMIT 1
    `
      )
      .get(validated.email) as
      | {
          id: number
          email: string
          password_hash: string
          name: string
          phone: string | null
          role: string
        }
      | undefined

    if (!user) {
      return c.json(
        createErrorResponse('Invalid email or password', '/auth/login', 'AuthenticationError'),
        { status: 401 }
      )
    }

    // Verify password
    const isValid = verifyPassword(validated.password, user.password_hash)

    if (!isValid) {
      return c.json(
        createErrorResponse('Invalid email or password', '/auth/login', 'AuthenticationError'),
        { status: 401 }
      )
    }

    // Create session token
    const token = generateToken(32)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days from now

    // Insert session
    db.prepare(
      `
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `
    ).run(user.id, token, expiresAt.toISOString())

    return c.json(
      {
        success: true,
        data: {
          token,
          expires_at: expiresAt.toISOString(),
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
          },
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', '/auth/login', 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Login error:', error)
    return c.json(createErrorResponse('Login failed', '/auth/login'), { status: 500 })
  }
})

// ============================================================
// GET /auth/me - Get current authenticated user
// ============================================================
auth.get('/me', requireAuth, async (c) => {
  const user = c.get('user')

  // requireAuth middleware ensures user is not null
  if (!user) {
    return c.json(
      createErrorResponse('Unauthorized', '/auth/me', 'Unauthorized'),
      { status: 401 }
    )
  }

  return c.json(
    {
      success: true,
      data: {
        user,
      },
    },
    { status: 200 }
  )
})

export default auth
