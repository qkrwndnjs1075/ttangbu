import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../src/app'
import { resetRateLimitBucketsForTests } from '../src/middleware/guardrails'

test('security guardrail: oversized request body is rejected with 413', async () => {
  resetRateLimitBucketsForTests()

  const oversizedPayload = JSON.stringify({
    email: `oversize-${Date.now()}@example.com`,
    password: 'Passw0rd!123',
    name: 'a'.repeat(130000),
    phone: '010-1234-5678',
  })

  const response = await app.request('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(oversizedPayload, 'utf-8')),
    },
    body: oversizedPayload,
  })

  assert.equal(response.status, 413)

  const body = (await response.json()) as {
    error: string
    message: string
  }

  assert.equal(body.error, 'PayloadTooLarge')
  assert.match(body.message, /Payload too large/)
})

test('security guardrail: repeated login failures are rate-limited', async () => {
  resetRateLimitBucketsForTests()

  const headers = {
    'Content-Type': 'application/json',
    'x-forwarded-for': '198.51.100.44',
  }

  const loginBody = JSON.stringify({
    email: 'bruteforce-target@example.com',
    password: 'wrong-password',
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers,
      body: loginBody,
    })

    assert.equal(response.status, 401)
  }

  const blocked = await app.request('/auth/login', {
    method: 'POST',
    headers,
    body: loginBody,
  })

  assert.equal(blocked.status, 429)

  const blockedBody = (await blocked.json()) as {
    error: string
    message: string
  }

  assert.equal(blockedBody.error, 'RateLimitExceeded')
  assert.match(blockedBody.message, /Too many login attempts/i)
})
