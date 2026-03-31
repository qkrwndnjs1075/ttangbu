import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { createErrorResponse } from '../middleware/error.js'

const messages = new Hono()

// ============================================================
// Validation Schemas
// ============================================================
const CreateMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(5000),
})

// ============================================================
// Helper: Check if user is participant (owner or applicant)
// ============================================================
async function checkParticipantAccess(
  applicationId: string,
  userId: number
): Promise<
  | { success: true; application: { id: number; owner_id: number; applicant_id: number } }
  | { success: false; error: { message: string; status: number } }
> {
  const db = getDb()

  const application = db
    .prepare(
      `
      SELECT 
        a.id, a.applicant_id, l.owner_id
      FROM applications a
      JOIN listings l ON a.listing_id = l.id
      WHERE a.id = ?
      LIMIT 1
    `
    )
    .get(applicationId) as
    | {
        id: number
        applicant_id: number
        owner_id: number
      }
    | undefined

  if (!application) {
    return {
      success: false,
      error: {
        message: 'Application not found',
        status: 404,
      },
    }
  }

  const isOwner = application.owner_id === userId
  const isApplicant = application.applicant_id === userId

  if (!isOwner && !isApplicant) {
    return {
      success: false,
      error: {
        message: 'Forbidden: Only application participants (owner and applicant) can access this thread',
        status: 403,
      },
    }
  }

  return {
    success: true,
    application,
  }
}

// ============================================================
// GET /applications/:id/messages - Get all messages in thread
// ============================================================
messages.get('/applications/:id/messages', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse(
          'Unauthorized',
          `/applications/${c.req.param('id')}/messages`,
          'Unauthorized'
        ),
        { status: 401 }
      )
    }

    const applicationId = c.req.param('id')
    const accessCheck = await checkParticipantAccess(applicationId, user.id)

    if (!accessCheck.success) {
      const statusCode = accessCheck.error.status as 404 | 403
      return c.json(
        createErrorResponse(
          accessCheck.error.message,
          `/applications/${applicationId}/messages`,
          accessCheck.error.status === 404 ? 'NotFound' : 'Forbidden'
        ),
        { status: statusCode }
      )
    }

    const db = getDb()

    // Retrieve all messages for this application thread
    const rows = db
      .prepare(
        `
        SELECT 
          m.id, m.application_id, m.sender_id, m.content, m.created_at,
          u.name as sender_name,
          u.email as sender_email
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.application_id = ?
        ORDER BY m.created_at ASC
      `
      )
      .all(applicationId) as Array<{
      id: number
      application_id: number
      sender_id: number
      content: string
      created_at: string
      sender_name: string
      sender_email: string
    }>

    return c.json(
      {
        success: true,
        data: {
          messages: rows,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get messages error:', error)
    return c.json(
      createErrorResponse(
        'Failed to retrieve messages',
        `/applications/${c.req.param('id')}/messages`
      ),
      { status: 500 }
    )
  }
})

// ============================================================
// POST /applications/:id/messages - Send a message to thread
// ============================================================
messages.post('/applications/:id/messages', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse(
          'Unauthorized',
          `/applications/${c.req.param('id')}/messages`,
          'Unauthorized'
        ),
        { status: 401 }
      )
    }

    const applicationId = c.req.param('id')
    const accessCheck = await checkParticipantAccess(applicationId, user.id)

    if (!accessCheck.success) {
      const statusCode = accessCheck.error.status as 404 | 403
      return c.json(
        createErrorResponse(
          accessCheck.error.message,
          `/applications/${applicationId}/messages`,
          accessCheck.error.status === 404 ? 'NotFound' : 'Forbidden'
        ),
        { status: statusCode }
      )
    }

    const body = await c.req.json()
    const validated = CreateMessageSchema.parse(body)

    const db = getDb()

    // Insert message
    const result = db
      .prepare(
        `
        INSERT INTO messages (application_id, sender_id, content)
        VALUES (?, ?, ?)
        RETURNING id, application_id, sender_id, content, created_at
      `
      )
      .get(applicationId, user.id, validated.content) as {
      id: number
      application_id: number
      sender_id: number
      content: string
      created_at: string
    }

    // Fetch sender details for response
    const sender = db
      .prepare('SELECT name, email FROM users WHERE id = ? LIMIT 1')
      .get(user.id) as { name: string; email: string }

    return c.json(
      {
        success: true,
        data: {
          message: {
            ...result,
            sender_name: sender.name,
            sender_email: sender.email,
          },
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(
          message || 'Invalid input',
          `/applications/${c.req.param('id')}/messages`,
          'ValidationError'
        ),
        { status: 400 }
      )
    }

    console.error('Send message error:', error)
    return c.json(
      createErrorResponse(
        'Failed to send message',
        `/applications/${c.req.param('id')}/messages`
      ),
      { status: 500 }
    )
  }
})

export default messages
