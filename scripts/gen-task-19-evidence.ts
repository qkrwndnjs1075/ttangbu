import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import app from '../backend/src/app'
import { resetRateLimitBucketsForTests } from '../backend/src/middleware/guardrails'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const evidenceDir = path.join(projectRoot, '.sisyphus', 'evidence')

async function generateOversizeEvidence(): Promise<void> {
  const payload = JSON.stringify({
    email: `oversize-evidence-${Date.now()}@example.com`,
    password: 'Passw0rd!123',
    name: 'a'.repeat(130000),
    phone: '010-9999-9999',
  })

  const response = await app.request('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload, 'utf-8')),
    },
    body: payload,
  })

  const responseBody = (await response.json()) as Record<string, unknown>

  const artifact = {
    test: 'task-19-oversize',
    description: 'oversized request body is rejected before handler processing',
    request: {
      method: 'POST',
      path: '/auth/register',
      content_type: 'application/json',
      payload_bytes: Buffer.byteLength(payload, 'utf-8'),
    },
    response: {
      status: response.status,
      body: responseBody,
    },
    expected: {
      status: 413,
      error: 'PayloadTooLarge',
    },
    result:
      response.status === 413 && responseBody.error === 'PayloadTooLarge' ? 'PASS' : 'FAIL',
    generated_at: new Date().toISOString(),
  }

  await writeFile(
    path.join(evidenceDir, 'task-19-oversize.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf-8'
  )
}

async function generateRateLimitEvidence(): Promise<void> {
  resetRateLimitBucketsForTests()

  const ip = '198.51.100.77'
  const body = JSON.stringify({
    email: 'bruteforce-evidence@example.com',
    password: 'wrong-password',
  })

  const attempts: Array<{ attempt: number; status: number; error: string; message: string }> = []

  for (let i = 1; i <= 6; i += 1) {
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
      body,
    })

    const responseBody = (await response.json()) as {
      error?: string
      message?: string
    }

    attempts.push({
      attempt: i,
      status: response.status,
      error: responseBody.error ?? 'UNKNOWN',
      message: responseBody.message ?? '',
    })
  }

  const blockedAttempt = attempts[5]
  const pass = blockedAttempt?.status === 429 && blockedAttempt.error === 'RateLimitExceeded'

  const lines = [
    'Task: task-19-ratelimit',
    `Generated at: ${new Date().toISOString()}`,
    'Scenario: repeated failed login attempts from same IP are throttled',
    'Policy: 5 requests / 60 seconds for /auth/login (default)',
    '',
    'Attempts:',
    ...attempts.map(
      (attempt) =>
        `  - #${attempt.attempt}: status=${attempt.status}, error=${attempt.error}, message=${attempt.message}`
    ),
    '',
    `Result: ${pass ? 'PASS' : 'FAIL'}`,
  ]

  await writeFile(path.join(evidenceDir, 'task-19-ratelimit.txt'), `${lines.join('\n')}\n`, 'utf-8')
}

async function main(): Promise<void> {
  await mkdir(evidenceDir, { recursive: true })
  await generateOversizeEvidence()
  await generateRateLimitEvidence()
  console.log('Generated: task-19-oversize.json, task-19-ratelimit.txt')
}

main().catch((error) => {
  console.error('Failed to generate T19 evidence:', error)
  process.exit(1)
})
