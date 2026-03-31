import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../src/app'

type JsonObject = Record<string, unknown>

async function requestJson(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: JsonObject,
  token?: string
) {
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await response.json()
  return { response, json }
}

async function registerAndLogin(prefix: string) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${prefix}-${suffix}@example.com`
  const password = 'Passw0rd!123'

  const registerResult = await requestJson('POST', '/auth/register', {
    email,
    password,
    name: `${prefix}-${suffix}`,
    phone: '010-0000-0000',
  })
  assert.equal(registerResult.response.status, 201)

  const loginResult = await requestJson('POST', '/auth/login', {
    email,
    password,
  })
  assert.equal(loginResult.response.status, 200)

  const token = (loginResult.json as { data: { token: string } }).data.token
  return { email, token }
}

test('integration: register -> listing -> application -> approval -> status check', async () => {
  const owner = await registerAndLogin('owner-int')
  const applicant = await registerAndLogin('applicant-int')

  const listingResult = await requestJson(
    'POST',
    '/listings',
    {
      title: 'Integration Listing',
      description: 'Integration test listing',
      location: 'Seoul',
      area_sqm: 55.5,
      price_per_month: 2200000,
      parcel_pnu: '1168010100100010000',
      center_lat: 37.4979,
      center_lng: 127.0276,
      parcel_geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [127.0274, 37.4978],
            [127.0278, 37.4978],
            [127.0278, 37.4981],
            [127.0274, 37.4981],
            [127.0274, 37.4978],
          ],
        ],
      },
    },
    owner.token
  )
  assert.equal(listingResult.response.status, 201)
  const createdListing = (listingResult.json as {
    data: {
      listing: {
        id: number
        parcel_pnu: string | null
        parcel_geojson: { type: string; coordinates: unknown[] } | null
      }
    }
  }).data.listing
  const listingId = createdListing.id
  assert.equal(createdListing.parcel_pnu, '1168010100100010000')
  assert.equal(createdListing.parcel_geojson?.type, 'Polygon')

  const applicationResult = await requestJson(
    'POST',
    '/applications',
    {
      listing_id: listingId,
      message: 'integration application message',
    },
    applicant.token
  )
  assert.equal(applicationResult.response.status, 201)
  const applicationId = (applicationResult.json as { data: { application: { id: number } } }).data.application.id

  const approveResult = await requestJson(
    'PATCH',
    `/applications/${applicationId}/transition`,
    {
      status: 'approved',
      reason: 'integration approve',
    },
    owner.token
  )
  assert.equal(approveResult.response.status, 200)

  const detailResult = await requestJson('GET', `/applications/${applicationId}`, undefined, applicant.token)
  assert.equal(detailResult.response.status, 200)

  const detail = detailResult.json as {
    data: {
      application: { status: string }
      status_logs: Array<{ to_status: string }>
    }
  }

  assert.equal(detail.data.application.status, 'approved')
  assert.equal(
    detail.data.status_logs.some((log) => log.to_status === 'approved'),
    true
  )
})

test('regression guard: rejected application cannot transition back to approved', async () => {
  const owner = await registerAndLogin('owner-reg')
  const applicant = await registerAndLogin('applicant-reg')

  const listingResult = await requestJson(
    'POST',
    '/listings',
    {
      title: 'Regression Listing',
      description: 'Regression test listing',
      location: 'Busan',
      area_sqm: 40,
      price_per_month: 1300000,
    },
    owner.token
  )
  assert.equal(listingResult.response.status, 201)
  const listingId = (listingResult.json as { data: { listing: { id: number } } }).data.listing.id

  const applicationResult = await requestJson(
    'POST',
    '/applications',
    {
      listing_id: listingId,
      message: 'regression scenario',
    },
    applicant.token
  )
  assert.equal(applicationResult.response.status, 201)
  const applicationId = (applicationResult.json as { data: { application: { id: number } } }).data.application.id

  const rejectResult = await requestJson(
    'PATCH',
    `/applications/${applicationId}/transition`,
    {
      status: 'rejected',
      reason: 'regression reject',
    },
    owner.token
  )
  assert.equal(rejectResult.response.status, 200)

  const invalidRollback = await requestJson(
    'PATCH',
    `/applications/${applicationId}/transition`,
    {
      status: 'approved',
      reason: 'should fail',
    },
    owner.token
  )
  assert.equal(invalidRollback.response.status, 409)

  const failure = invalidRollback.json as { error: string }
  assert.equal(failure.error, 'ConflictError')
})
