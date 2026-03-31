import { Context } from 'hono'

export interface ApiError {
  error: string
  message: string
  path: string
  timestamp: string
}

export function createErrorResponse(
  message: string,
  path: string,
  errorType: string = 'InternalError'
): ApiError {
  return {
    error: errorType,
    message,
    path,
    timestamp: new Date().toISOString(),
  }
}

export async function errorHandler(
  c: Context,
  next: () => Promise<void>
): Promise<Response | void> {
  try {
    await next()
  } catch (error) {
    const path = new URL(c.req.url).pathname

    if (error instanceof Error) {
      // Log full error internally with stack trace
      console.error('Error:', {
        message: error.message,
        stack: error.stack,
        path,
      })

      // Return safe error response without stack trace
      return c.json(
        createErrorResponse('Internal server error', path, 'InternalError'),
        { status: 500 }
      )
    }

    console.error('Unknown error:', error)
    return c.json(
      createErrorResponse('Internal server error', path),
      { status: 500 }
    )
  }
}

export function notFoundHandler(c: Context) {
  const path = new URL(c.req.url).pathname

  return c.json(
    createErrorResponse('Not found', path, 'NotFound'),
    { status: 404 }
  )
}
