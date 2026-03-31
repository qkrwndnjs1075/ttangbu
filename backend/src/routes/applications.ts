import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { createErrorResponse } from '../middleware/error.js'

const applications = new Hono()

// ============================================================
// State Machine Configuration
// ============================================================
// Allowed state transitions (allowlist pattern)
// Format: { [currentStatus]: [allowedNextStatuses] }
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['active', 'cancelled'],
  rejected: [], // Terminal state for applicant - no transitions
  active: ['completed', 'cancelled'],
  cancelled: [], // Terminal state
  completed: [], // Terminal state
}

/**
 * Validate if a state transition is allowed by the state machine
 */
function isTransitionAllowed(fromStatus: string, toStatus: string): boolean {
  const allowedNext = ALLOWED_TRANSITIONS[fromStatus]
  return allowedNext ? allowedNext.includes(toStatus) : false
}

// ============================================================
// Validation Schemas
// ============================================================
const CreateApplicationSchema = z.object({
  listing_id: z.number().int().positive(),
  message: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
})

const TransitionApplicationSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'active', 'cancelled', 'completed']),
  reason: z.string().optional(),
})

// ============================================================
// POST /applications - Create new application (authenticated renter)
// ============================================================
applications.post('/', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(createErrorResponse('Unauthorized', '/applications', 'Unauthorized'), {
        status: 401,
      })
    }

    const body = await c.req.json()
    const validated = CreateApplicationSchema.parse(body)

    const db = getDb()

    // Verify listing exists and is active
    const listing = db
      .prepare('SELECT id, owner_id, status FROM listings WHERE id = ? LIMIT 1')
      .get(validated.listing_id) as
      | {
          id: number
          owner_id: number
          status: string
        }
      | undefined

    if (!listing) {
      return c.json(
        createErrorResponse('Listing not found', '/applications', 'NotFound'),
        { status: 404 }
      )
    }

    if (listing.status !== 'active') {
      return c.json(
        createErrorResponse('Listing is not active', '/applications', 'ValidationError'),
        { status: 400 }
      )
    }

    // Prevent owner from applying to their own listing
    if (listing.owner_id === user.id) {
      return c.json(
        createErrorResponse(
          'Cannot apply to your own listing',
          '/applications',
          'ValidationError'
        ),
        { status: 400 }
      )
    }

    // Check for existing application (UNIQUE constraint: listing_id, applicant_id)
    const existing = db
      .prepare(
        'SELECT id, status FROM applications WHERE listing_id = ? AND applicant_id = ? LIMIT 1'
      )
      .get(validated.listing_id, user.id) as
      | {
          id: number
          status: string
        }
      | undefined

    if (existing) {
      return c.json(
        createErrorResponse(
          `Application already exists with status: ${existing.status}`,
          '/applications',
          'ConflictError'
        ),
        { status: 409 }
      )
    }

    // Insert application
    const result = db
      .prepare(
        `
      INSERT INTO applications (listing_id, applicant_id, status, message, start_date, end_date)
      VALUES (?, ?, 'pending', ?, ?, ?)
      RETURNING id, listing_id, applicant_id, status, message, start_date, end_date, created_at, updated_at
    `
      )
      .get(
        validated.listing_id,
        user.id,
        validated.message ?? null,
        validated.start_date ?? null,
        validated.end_date ?? null
      ) as {
      id: number
      listing_id: number
      applicant_id: number
      status: string
      message: string | null
      start_date: string | null
      end_date: string | null
      created_at: string
      updated_at: string
    }

    // Log initial status (from_status is null for creation)
    db.prepare(
      `
      INSERT INTO status_logs (application_id, from_status, to_status, changed_by, reason)
      VALUES (?, NULL, 'pending', ?, 'Application created')
    `
    ).run(result.id, user.id)

    return c.json(
      {
        success: true,
        data: {
          application: result,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', '/applications', 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Create application error:', error)
    return c.json(createErrorResponse('Failed to create application', '/applications'), {
      status: 500,
    })
  }
})

// ============================================================
// PATCH /applications/:id/transition - Transition application status
// ============================================================
applications.patch('/:id/transition', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse('Unauthorized', `/applications/${c.req.param('id')}/transition`, 'Unauthorized'),
        { status: 401 }
      )
    }

    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = TransitionApplicationSchema.parse(body)

    const db = getDb()

    // Get application with listing owner info
    const application = db
      .prepare(
        `
      SELECT 
        a.id, a.listing_id, a.applicant_id, a.status,
        l.owner_id
      FROM applications a
      JOIN listings l ON a.listing_id = l.id
      WHERE a.id = ?
      LIMIT 1
    `
      )
      .get(id) as
      | {
          id: number
          listing_id: number
          applicant_id: number
          status: string
          owner_id: number
        }
      | undefined

    if (!application) {
      return c.json(
        createErrorResponse('Application not found', `/applications/${id}/transition`, 'NotFound'),
        { status: 404 }
      )
    }

    // Authorization check based on target status
    const isOwner = application.owner_id === user.id
    const isApplicant = application.applicant_id === user.id

    // Owner can: approve, reject
    // Applicant can: cancel
    // No one can: directly set to 'active' or 'completed' (use separate endpoints if needed)
    if (validated.status === 'approved' || validated.status === 'rejected') {
      if (!isOwner) {
        return c.json(
          createErrorResponse(
            'Only listing owner can approve/reject applications',
            `/applications/${id}/transition`,
            'Forbidden'
          ),
          { status: 403 }
        )
      }
    } else if (validated.status === 'cancelled') {
      if (!isApplicant && !isOwner) {
        return c.json(
          createErrorResponse(
            'Only applicant or owner can cancel application',
            `/applications/${id}/transition`,
            'Forbidden'
          ),
          { status: 403 }
        )
      }
    } else if (validated.status === 'active' || validated.status === 'completed') {
      // For now, only owner can transition to active/completed
      if (!isOwner) {
        return c.json(
          createErrorResponse(
            'Only listing owner can transition to active/completed',
            `/applications/${id}/transition`,
            'Forbidden'
          ),
          { status: 403 }
        )
      }
    }

    // Validate state transition using state machine
    if (!isTransitionAllowed(application.status, validated.status)) {
      return c.json(
        createErrorResponse(
          `Invalid state transition: ${application.status} -> ${validated.status}`,
          `/applications/${id}/transition`,
          'ConflictError'
        ),
        { status: 409 }
      )
    }

    // Perform transition
    const result = db
      .prepare(
        `
      UPDATE applications
      SET status = ?, updated_at = datetime('now', 'utc')
      WHERE id = ?
      RETURNING id, listing_id, applicant_id, status, message, start_date, end_date, created_at, updated_at
    `
      )
      .get(validated.status, id) as {
      id: number
      listing_id: number
      applicant_id: number
      status: string
      message: string | null
      start_date: string | null
      end_date: string | null
      created_at: string
      updated_at: string
    }

    // Log status transition
    db.prepare(
      `
      INSERT INTO status_logs (application_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(result.id, application.status, validated.status, user.id, validated.reason ?? null)

    return c.json(
      {
        success: true,
        data: {
          application: result,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', `/applications/${c.req.param('id')}/transition`, 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Transition application error:', error)
    return c.json(
      createErrorResponse('Failed to transition application', `/applications/${c.req.param('id')}/transition`),
      { status: 500 }
    )
  }
})

// ============================================================
// GET /applications - List applications (filtered by user role)
// ============================================================
applications.get('/', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(createErrorResponse('Unauthorized', '/applications', 'Unauthorized'), {
        status: 401,
      })
    }

    const db = getDb()

    // Get applications where user is either applicant or listing owner
    const rows = db
      .prepare(
        `
      SELECT 
        a.id, a.listing_id, a.applicant_id, a.status, a.message, 
        a.start_date, a.end_date, a.created_at, a.updated_at,
        l.title as listing_title,
        u.name as applicant_name,
        u.email as applicant_email
      FROM applications a
      JOIN listings l ON a.listing_id = l.id
      JOIN users u ON a.applicant_id = u.id
      WHERE a.applicant_id = ? OR l.owner_id = ?
      ORDER BY a.created_at DESC
    `
      )
      .all(user.id, user.id) as Array<{
      id: number
      listing_id: number
      applicant_id: number
      status: string
      message: string | null
      start_date: string | null
      end_date: string | null
      created_at: string
      updated_at: string
      listing_title: string
      applicant_name: string
      applicant_email: string
    }>

    return c.json(
      {
        success: true,
        data: {
          applications: rows,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('List applications error:', error)
    return c.json(createErrorResponse('Failed to list applications', '/applications'), {
      status: 500,
    })
  }
})

// ============================================================
// GET /applications/:id - Get application detail
// ============================================================
applications.get('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse('Unauthorized', `/applications/${c.req.param('id')}`, 'Unauthorized'),
        { status: 401 }
      )
    }

    const id = c.req.param('id')
    const db = getDb()

    // Get application with full details
    const application = db
      .prepare(
        `
      SELECT 
        a.id, a.listing_id, a.applicant_id, a.status, a.message,
        a.start_date, a.end_date, a.created_at, a.updated_at,
        l.title as listing_title,
        l.owner_id,
        u.name as applicant_name,
        u.email as applicant_email
      FROM applications a
      JOIN listings l ON a.listing_id = l.id
      JOIN users u ON a.applicant_id = u.id
      WHERE a.id = ?
      LIMIT 1
    `
      )
      .get(id) as
      | {
          id: number
          listing_id: number
          applicant_id: number
          status: string
          message: string | null
          start_date: string | null
          end_date: string | null
          created_at: string
          updated_at: string
          listing_title: string
          owner_id: number
          applicant_name: string
          applicant_email: string
        }
      | undefined

    if (!application) {
      return c.json(
        createErrorResponse('Application not found', `/applications/${id}`, 'NotFound'),
        { status: 404 }
      )
    }

    // Authorization: user must be applicant or listing owner
    const isOwner = application.owner_id === user.id
    const isApplicant = application.applicant_id === user.id

    if (!isOwner && !isApplicant) {
      return c.json(
        createErrorResponse(
          'Forbidden: You do not have access to this application',
          `/applications/${id}`,
          'Forbidden'
        ),
        { status: 403 }
      )
    }

    // Get status logs
    const statusLogs = db
      .prepare(
        `
      SELECT 
        sl.id, sl.from_status, sl.to_status, sl.reason, sl.created_at,
        u.name as changed_by_name
      FROM status_logs sl
      JOIN users u ON sl.changed_by = u.id
      WHERE sl.application_id = ?
      ORDER BY sl.created_at ASC
    `
      )
      .all(id) as Array<{
      id: number
      from_status: string | null
      to_status: string
      reason: string | null
      created_at: string
      changed_by_name: string
    }>

    return c.json(
      {
        success: true,
        data: {
          application,
          status_logs: statusLogs,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get application error:', error)
    return c.json(
      createErrorResponse('Failed to get application', `/applications/${c.req.param('id')}`),
      { status: 500 }
    )
  }
})

export default applications
