import type { Context, Next } from 'hono'
import { createErrorResponse } from './error.js'

const DEFAULT_MAX_BODY_BYTES = 100 * 1024

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyPrefix: string
  errorMessage: string
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function parseContentLength(contentLengthHeader: string | undefined): number | undefined {
  if (!contentLengthHeader) {
    return undefined
  }

  const parsed = Number.parseInt(contentLengthHeader, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

function getPath(c: Context): string {
  return new URL(c.req.url).pathname
}

function shouldCheckBody(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH'
}

function getClientIdentifier(c: Context): string {
  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) {
      return firstIp
    }
  }

  const realIp = c.req.header('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  return 'local'
}

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key)
    }
  }
}

export function requestSizeGuard(maxBodyBytes = readPositiveIntEnv('MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES)) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (!shouldCheckBody(c.req.method)) {
      await next()
      return
    }

    const contentLength = parseContentLength(c.req.header('content-length'))
    if (contentLength !== undefined && contentLength > maxBodyBytes) {
      const path = getPath(c)
      return c.json(
        createErrorResponse(
          `Payload too large. Maximum allowed size is ${maxBodyBytes} bytes`,
          path,
          'PayloadTooLarge'
        ),
        { status: 413 }
      )
    }

    await next()
  }
}

export function createRateLimiter(options: RateLimitOptions) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const now = Date.now()
    pruneExpiredBuckets(now)

    const path = getPath(c)
    const key = `${options.keyPrefix}:${getClientIdentifier(c)}:${path}`

    const existing = rateLimitBuckets.get(key)
    const bucket: RateLimitBucket =
      existing && existing.resetAt > now
        ? existing
        : {
            count: 0,
            resetAt: now + options.windowMs,
          }

    bucket.count += 1
    rateLimitBuckets.set(key, bucket)

    const remaining = Math.max(options.maxRequests - bucket.count, 0)
    const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)

    c.header('X-RateLimit-Limit', String(options.maxRequests))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > options.maxRequests) {
      c.header('Retry-After', String(retryAfterSeconds))
      return c.json(createErrorResponse(options.errorMessage, path, 'RateLimitExceeded'), {
        status: 429,
      })
    }

    await next()
  }
}

export function resetRateLimitBucketsForTests(): void {
  rateLimitBuckets.clear()
}

export function readSecurityEnvInt(name: string, fallback: number): number {
  return readPositiveIntEnv(name, fallback)
}
