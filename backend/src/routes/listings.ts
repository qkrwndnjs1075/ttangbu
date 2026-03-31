import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { requireAuth } from '../middleware/auth.js'
import { createErrorResponse } from '../middleware/error.js'

const listings = new Hono()

type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: [number, number][][]
}

type GeoJsonMultiPolygon = {
  type: 'MultiPolygon'
  coordinates: [number, number][][][]
}

type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon

type ListingRow = {
  id: number
  owner_id: number
  title: string
  description: string
  location: string
  area_sqm: number
  price_per_month: number
  status: string
  created_at: string
  updated_at: string
  parcel_pnu: string | null
  center_lat: number | null
  center_lng: number | null
  parcel_geojson: string | null
}

const GeoJsonPolygonSchema: z.ZodType<GeoJsonPolygon> = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
})

const GeoJsonMultiPolygonSchema: z.ZodType<GeoJsonMultiPolygon> = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))).min(1),
})

const GeoJsonGeometrySchema: z.ZodType<GeoJsonGeometry> = z.union([
  GeoJsonPolygonSchema,
  GeoJsonMultiPolygonSchema,
])

function serializeParcelGeoJson(value: GeoJsonGeometry | null | undefined): string | null {
  if (!value) {
    return null
  }

  return JSON.stringify(value)
}

function hydrateListing(row: ListingRow) {
  return {
    ...row,
    parcel_geojson: row.parcel_geojson
      ? (JSON.parse(row.parcel_geojson) as GeoJsonGeometry)
      : null,
  }
}

// ============================================================
// Validation Schemas
// ============================================================
const CreateListingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long'),
  location: z.string().min(1, 'Location is required').max(200, 'Location too long'),
  area_sqm: z.number().positive('Area must be positive'),
  price_per_month: z.number().int().min(0, 'Price cannot be negative'),
  parcel_pnu: z.string().max(40).nullable().optional(),
  center_lat: z.number().min(-90).max(90).nullable().optional(),
  center_lng: z.number().min(-180).max(180).nullable().optional(),
  parcel_geojson: GeoJsonGeometrySchema.nullable().optional(),
})

const UpdateListingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  location: z.string().min(1).max(200).optional(),
  area_sqm: z.number().positive().optional(),
  price_per_month: z.number().int().min(0).optional(),
  parcel_pnu: z.string().max(40).nullable().optional(),
  center_lat: z.number().min(-90).max(90).nullable().optional(),
  center_lng: z.number().min(-180).max(180).nullable().optional(),
  parcel_geojson: GeoJsonGeometrySchema.nullable().optional(),
})

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Search/filter parameters
  location: z.string().optional(),
  min_price: z.coerce.number().int().min(0).optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive', 'rented']).optional(),
}).refine(
  (data) => {
    // Validate price range: min_price <= max_price
    if (data.min_price !== undefined && data.max_price !== undefined) {
      return data.min_price <= data.max_price
    }
    return true
  },
  {
    message: 'min_price must be less than or equal to max_price',
    path: ['min_price'],
  }
)

// ============================================================
// POST /listings - Create new listing (authenticated)
// ============================================================
listings.post('/', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse('Unauthorized', '/listings', 'Unauthorized'),
        { status: 401 }
      )
    }

    const body = await c.req.json()
    const validated = CreateListingSchema.parse(body)

    const db = getDb()

    // Insert listing with authenticated user as owner
    const result = db
      .prepare(
        `
      INSERT INTO listings (owner_id, title, description, location, area_sqm, price_per_month, parcel_pnu, center_lat, center_lng, parcel_geojson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, owner_id, title, description, location, area_sqm, price_per_month, status, created_at, updated_at, parcel_pnu, center_lat, center_lng, parcel_geojson
    `
      )
      .get(
        user.id,
        validated.title,
        validated.description,
        validated.location,
        validated.area_sqm,
        validated.price_per_month,
        validated.parcel_pnu ?? null,
        validated.center_lat ?? null,
        validated.center_lng ?? null,
        serializeParcelGeoJson(validated.parcel_geojson)
      ) as ListingRow

    return c.json(
      {
        success: true,
        data: {
          listing: hydrateListing(result),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', '/listings', 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Create listing error:', error)
    return c.json(createErrorResponse('Failed to create listing', '/listings'), { status: 500 })
  }
})

// ============================================================
// GET /listings - List all listings (public, paginated, filterable)
// ============================================================
listings.get('/', async (c) => {
  try {
    const query = c.req.query()
    const validated = ListQuerySchema.parse(query)

    const db = getDb()

    // Calculate offset
    const offset = (validated.page - 1) * validated.limit

    // Build WHERE clause dynamically based on filters
    const whereClauses: string[] = []
    const whereValues: unknown[] = []

    if (validated.location !== undefined) {
      whereClauses.push('location LIKE ?')
      whereValues.push(`%${validated.location}%`)
    }

    if (validated.min_price !== undefined) {
      whereClauses.push('price_per_month >= ?')
      whereValues.push(validated.min_price)
    }

    if (validated.max_price !== undefined) {
      whereClauses.push('price_per_month <= ?')
      whereValues.push(validated.max_price)
    }

    if (validated.status !== undefined) {
      whereClauses.push('status = ?')
      whereValues.push(validated.status)
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    // Get total count with filters
    const countQuery = `SELECT COUNT(*) as total FROM listings ${whereClause}`
    const countRow = db.prepare(countQuery).get(...whereValues) as {
      total: number
    }
    const total = countRow.total

    // Get listings with filters and deterministic ordering
    const listQuery = `
      SELECT 
        id, owner_id, title, description, location, area_sqm, 
        price_per_month, status, created_at, updated_at, parcel_pnu, center_lat, center_lng, parcel_geojson
      FROM listings
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
    const rows = db.prepare(listQuery).all(...whereValues, validated.limit, offset) as ListingRow[]

    return c.json(
      {
        success: true,
        data: {
          listings: rows.map(hydrateListing),
          pagination: {
            page: validated.page,
            limit: validated.limit,
            total,
            pages: Math.ceil(total / validated.limit),
          },
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid query parameters', '/listings', 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('List listings error:', error)
    return c.json(createErrorResponse('Failed to list listings', '/listings'), { status: 500 })
  }
})

// ============================================================
// GET /listings/:id - Get listing detail (public)
// ============================================================
listings.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = getDb()

    const listing = db
      .prepare(
        `
      SELECT 
        id, owner_id, title, description, location, area_sqm, 
        price_per_month, status, created_at, updated_at, parcel_pnu, center_lat, center_lng, parcel_geojson
      FROM listings
      WHERE id = ?
      LIMIT 1
    `
      )
      .get(id) as ListingRow | undefined

    if (!listing) {
      return c.json(
        createErrorResponse('Listing not found', `/listings/${id}`, 'NotFound'),
        { status: 404 }
      )
    }

    return c.json(
      {
          success: true,
          data: {
          listing: hydrateListing(listing),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get listing error:', error)
    const id = c.req.param('id')
    return c.json(createErrorResponse('Failed to get listing', `/listings/${id}`), { status: 500 })
  }
})

// ============================================================
// PATCH /listings/:id - Update listing (owner only)
// ============================================================
listings.patch('/:id', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse('Unauthorized', `/listings/${c.req.param('id')}`, 'Unauthorized'),
        { status: 401 }
      )
    }

    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateListingSchema.parse(body)

    const db = getDb()

    // Check if listing exists and verify ownership
    const existing = db
      .prepare('SELECT id, owner_id FROM listings WHERE id = ? LIMIT 1')
      .get(id) as
      | {
          id: number
          owner_id: number
        }
      | undefined

    if (!existing) {
      return c.json(
        createErrorResponse('Listing not found', `/listings/${id}`, 'NotFound'),
        { status: 404 }
      )
    }

    // Authorization check: only owner can update
    if (existing.owner_id !== user.id) {
      return c.json(
        createErrorResponse(
          'Forbidden: Only the owner can update this listing',
          `/listings/${id}`,
          'Forbidden'
        ),
        { status: 403 }
      )
    }

    // Build dynamic UPDATE query
    const updates: string[] = []
    const values: unknown[] = []

    if (validated.title !== undefined) {
      updates.push('title = ?')
      values.push(validated.title)
    }
    if (validated.description !== undefined) {
      updates.push('description = ?')
      values.push(validated.description)
    }
    if (validated.location !== undefined) {
      updates.push('location = ?')
      values.push(validated.location)
    }
    if (validated.area_sqm !== undefined) {
      updates.push('area_sqm = ?')
      values.push(validated.area_sqm)
    }
    if (validated.price_per_month !== undefined) {
      updates.push('price_per_month = ?')
      values.push(validated.price_per_month)
    }
    if (validated.parcel_pnu !== undefined) {
      updates.push('parcel_pnu = ?')
      values.push(validated.parcel_pnu)
    }
    if (validated.center_lat !== undefined) {
      updates.push('center_lat = ?')
      values.push(validated.center_lat)
    }
    if (validated.center_lng !== undefined) {
      updates.push('center_lng = ?')
      values.push(validated.center_lng)
    }
    if (validated.parcel_geojson !== undefined) {
      updates.push('parcel_geojson = ?')
      values.push(serializeParcelGeoJson(validated.parcel_geojson))
    }

    if (updates.length === 0) {
      return c.json(
        createErrorResponse('No fields to update', `/listings/${id}`, 'ValidationError'),
        { status: 400 }
      )
    }

    // Always update updated_at
    updates.push("updated_at = datetime('now', 'utc')")
    values.push(id)

    const query = `
      UPDATE listings 
      SET ${updates.join(', ')}
      WHERE id = ?
      RETURNING id, owner_id, title, description, location, area_sqm, price_per_month, status, created_at, updated_at, parcel_pnu, center_lat, center_lng, parcel_geojson
    `

    const result = db.prepare(query).get(...values) as ListingRow

    return c.json(
      {
        success: true,
        data: {
          listing: hydrateListing(result),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return c.json(
        createErrorResponse(message || 'Invalid input', `/listings/${c.req.param('id')}`, 'ValidationError'),
        { status: 400 }
      )
    }

    console.error('Update listing error:', error)
    return c.json(
      createErrorResponse('Failed to update listing', `/listings/${c.req.param('id')}`),
      { status: 500 }
    )
  }
})

// ============================================================
// PATCH /listings/:id/deactivate - Deactivate listing (owner only)
// ============================================================
listings.patch('/:id/deactivate', requireAuth, async (c) => {
  try {
    const user = c.get('user')
    if (!user) {
      return c.json(
        createErrorResponse(
          'Unauthorized',
          `/listings/${c.req.param('id')}/deactivate`,
          'Unauthorized'
        ),
        { status: 401 }
      )
    }

    const id = c.req.param('id')
    const db = getDb()

    // Check if listing exists and verify ownership
    const existing = db
      .prepare('SELECT id, owner_id, status FROM listings WHERE id = ? LIMIT 1')
      .get(id) as
      | {
          id: number
          owner_id: number
          status: string
        }
      | undefined

    if (!existing) {
      return c.json(
        createErrorResponse('Listing not found', `/listings/${id}/deactivate`, 'NotFound'),
        { status: 404 }
      )
    }

    // Authorization check: only owner can deactivate
    if (existing.owner_id !== user.id) {
      return c.json(
        createErrorResponse(
          'Forbidden: Only the owner can deactivate this listing',
          `/listings/${id}/deactivate`,
          'Forbidden'
        ),
        { status: 403 }
      )
    }

    // Update status to inactive
    const result = db
      .prepare(
        `
      UPDATE listings 
      SET status = 'inactive', updated_at = datetime('now', 'utc')
      WHERE id = ?
      RETURNING id, owner_id, title, description, location, area_sqm, price_per_month, status, created_at, updated_at, parcel_pnu, center_lat, center_lng, parcel_geojson
    `
      )
      .get(id) as ListingRow

    return c.json(
      {
        success: true,
        data: {
          listing: hydrateListing(result),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Deactivate listing error:', error)
    return c.json(
      createErrorResponse(
        'Failed to deactivate listing',
        `/listings/${c.req.param('id')}/deactivate`
      ),
      { status: 500 }
    )
  }
})

export default listings
