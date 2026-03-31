import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { z } from 'zod'
import { createErrorResponse } from '../middleware/error.js'
import { mergeParcelFeatures } from '../lib/vworld-parcels.js'

const vworld = new Hono()
const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PYTHON_FETCH_SCRIPT = resolve(__dirname, '../../tools/vworld_fetch.py')

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
})

const ParcelSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

const ParcelPnuSchema = z.object({
  pnu: z.string().length(19),
})

const ParcelBoundsSchema = z.object({
  south: z.coerce.number().min(-90).max(90),
  west: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(150).default(80),
})

const PARCEL_TYPENAMES = ['lp_pa_cbnd_bubun', 'lp_pa_cbnd_bonbun'] as const

type WfsPayload = {
  features?: Array<Record<string, unknown>>
  totalFeatures?: number
}

type ParcelFeature = Record<string, unknown>

type UpstreamResult = {
  status: number
  text: string
  headers: Record<string, string>
}

function getVworldKey(incomingKey: string | undefined): string | null {
  return incomingKey ?? process.env.VWORLD_API_KEY ?? process.env.VITE_VWORLD_API_KEY ?? null
}

function getRequestDomain(originHeader: string | undefined): string | null {
  return originHeader ?? null
}

function summarizeResponseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200)
}

async function fetchWithPythonFallback(url: string, headers: Record<string, string> = {}): Promise<UpstreamResult> {
  const { stdout } = await execFileAsync('python', [PYTHON_FETCH_SCRIPT, url, JSON.stringify(headers)], {
    maxBuffer: 1024 * 1024 * 4,
  })

  const parsed = JSON.parse(stdout) as
    | { ok: true; status: number; text: string; headers?: Record<string, string> }
    | { ok: false; error?: string }

  if (!parsed.ok) {
    throw new Error(parsed.error ?? '브이월드 연결 보조 요청에 실패했습니다.')
  }

  return {
    status: parsed.status,
    text: parsed.text,
    headers: parsed.headers ?? {},
  }
}

async function requestUpstream(url: string, headers: Record<string, string> = {}): Promise<UpstreamResult> {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers })
      const text = await response.text()
      return {
        status: response.status,
        text,
        headers: {},
      }
    } catch (error) {
      lastError = error
    }
  }

  try {
    return await fetchWithPythonFallback(url, headers)
  } catch (fallbackError) {
    const baseMessage = lastError instanceof Error ? lastError.message : 'unknown error'
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'unknown fallback error'
    throw new Error(`primary=${baseMessage}; fallback=${fallbackMessage}`)
  }
}

async function requestWfsFeatures(
  typename: string,
  bbox: string,
  key: string,
  domain: string | null,
  maxFeatures: number
): Promise<WfsPayload> {
  const url = new URL('https://api.vworld.kr/req/wfs')
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typename', typename)
  url.searchParams.set('output', 'application/json')
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('srsname', 'EPSG:4326')
  url.searchParams.set('bbox', bbox)
  url.searchParams.set('maxFeatures', String(maxFeatures))
  url.searchParams.set('key', key)

  if (domain) {
    url.searchParams.set('domain', domain)
  }

  const upstream = await requestUpstream(url.toString())

  if (upstream.status < 200 || upstream.status >= 300) {
    throw new Error(`브이월드 필지 조회 실패 (${upstream.status})`)
  }

  try {
    return JSON.parse(upstream.text) as WfsPayload
  } catch {
    throw new Error(
      upstream.text.trim().startsWith('<')
        ? '브이월드가 JSON 대신 XML을 반환했습니다. 도메인 또는 권한 설정을 확인하세요.'
        : `브이월드 응답 해석 실패: ${summarizeResponseText(upstream.text)}`
    )
  }
}

function createPointBbox(lat: number, lng: number, delta: number): string {
  return [
    lng - delta,
    lat - delta,
    lng + delta,
    lat + delta,
    'EPSG:4326',
  ].join(',')
}

async function requestParcelFeatureAtPoint(
  lat: number,
  lng: number,
  key: string,
  domain: string | null
): Promise<ParcelFeature | null> {
  const bbox = createPointBbox(lat, lng, 0.0006)

  for (const typename of PARCEL_TYPENAMES) {
    try {
      const payload = await requestWfsFeatures(typename, bbox, key, domain, 1)
      const feature = payload.features?.[0]
      if (feature) {
        return feature
      }
    } catch {
      continue
    }
  }

  return null
}

vworld.get('/search', async (c) => {
  const origin = c.req.header('origin')
  const key = getVworldKey(c.req.header('x-vworld-key') ?? undefined)
  const validated = SearchSchema.safeParse({ query: c.req.query('query') })

  if (!key) {
    return c.json(createErrorResponse('VWorld API key is not configured.', c.req.path, 'ConfigurationError'), { status: 400 })
  }

  if (!validated.success) {
    return c.json(createErrorResponse(validated.error.issues[0]?.message ?? '주소 검색어가 필요합니다.', c.req.path, 'ValidationError'), { status: 400 })
  }

  const url = new URL('https://api.vworld.kr/req/search')
  url.searchParams.set('service', 'search')
  url.searchParams.set('request', 'search')
  url.searchParams.set('version', '2.0')
  url.searchParams.set('size', '1')
  url.searchParams.set('page', '1')
  url.searchParams.set('type', 'address')
  url.searchParams.set('category', 'parcel')
  url.searchParams.set('format', 'json')
  url.searchParams.set('key', key)
  url.searchParams.set('query', validated.data.query)

  const domain = getRequestDomain(origin)
  if (domain) {
    url.searchParams.set('domain', domain)
  }

  try {
    const upstream = await requestUpstream(url.toString())

    if (upstream.status < 200 || upstream.status >= 300) {
      return c.json(createErrorResponse(`브이월드 주소 검색 실패 (${upstream.status})`, c.req.path, 'ExternalApiError'), { status: 502 })
    }

    try {
      return c.json(JSON.parse(upstream.text), { status: 200 })
    } catch {
      return c.json(createErrorResponse(`브이월드 주소 검색 응답 해석 실패: ${summarizeResponseText(upstream.text)}`, c.req.path, 'ExternalApiError'), { status: 502 })
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? `브이월드 주소 검색 연결 실패: ${error.message}`
        : '브이월드 주소 검색 연결에 실패했습니다.'
    return c.json(createErrorResponse(message, c.req.path, 'ExternalApiError'), { status: 502 })
  }
})

vworld.get('/parcel', async (c) => {
  const origin = c.req.header('origin')
  const key = getVworldKey(c.req.header('x-vworld-key') ?? undefined)
  const validated = ParcelSchema.safeParse({
    lat: c.req.query('lat'),
    lng: c.req.query('lng'),
  })

  if (!key) {
    return c.json(createErrorResponse('VWorld API key is not configured.', c.req.path, 'ConfigurationError'), { status: 400 })
  }

  if (!validated.success) {
    return c.json(createErrorResponse('lat, lng 값이 올바르지 않습니다.', c.req.path, 'ValidationError'), { status: 400 })
  }

  const domain = getRequestDomain(origin)
  let feature: ParcelFeature | null
  try {
    feature = await requestParcelFeatureAtPoint(
      validated.data.lat,
      validated.data.lng,
      key,
      domain
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '브이월드 필지 조회에 실패했습니다.'
    return c.json(createErrorResponse(message, c.req.path, 'ExternalApiError'), { status: 502 })
  }

  if (!feature) {
    return c.json(
      createErrorResponse('선택한 위치에서 필지를 찾지 못했습니다.', c.req.path, 'ExternalApiError'),
      { status: 404 }
    )
  }

  return c.json({ features: [feature], totalFeatures: 1 }, { status: 200 })
})

vworld.get('/parcels', async (c) => {
  const origin = c.req.header('origin')
  const key = getVworldKey(c.req.header('x-vworld-key') ?? undefined)
  const validated = ParcelBoundsSchema.safeParse({
    south: c.req.query('south'),
    west: c.req.query('west'),
    north: c.req.query('north'),
    east: c.req.query('east'),
    limit: c.req.query('limit') ?? 80,
  })

  if (!key) {
    return c.json(createErrorResponse('VWorld API key is not configured.', c.req.path, 'ConfigurationError'), { status: 400 })
  }

  if (!validated.success) {
    return c.json(createErrorResponse('지도 범위 값이 올바르지 않습니다.', c.req.path, 'ValidationError'), { status: 400 })
  }

  if (validated.data.north <= validated.data.south || validated.data.east <= validated.data.west) {
    return c.json(createErrorResponse('지도 범위 순서가 올바르지 않습니다.', c.req.path, 'ValidationError'), { status: 400 })
  }

  const domain = getRequestDomain(origin)
  const sampleSize = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(validated.data.limit))))
  const latStep = (validated.data.north - validated.data.south) / sampleSize
  const lngStep = (validated.data.east - validated.data.west) / sampleSize

  const sampleRequests: Array<Promise<ParcelFeature | null>> = []

  for (let row = 0; row < sampleSize; row += 1) {
    for (let col = 0; col < sampleSize; col += 1) {
      const lat = validated.data.south + latStep * (row + 0.5)
      const lng = validated.data.west + lngStep * (col + 0.5)
      sampleRequests.push(requestParcelFeatureAtPoint(lat, lng, key, domain))
    }
  }

  const responses = await Promise.allSettled(sampleRequests)
  const sampledFeatures = responses
    .filter((result): result is PromiseFulfilledResult<ParcelFeature | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((feature): feature is ParcelFeature => feature !== null)

  const features = mergeParcelFeatures([{ features: sampledFeatures }])
  return c.json(
    {
      count: features.length,
      features,
      viewport: validated.data,
      sampleCount: sampleRequests.length,
    },
    { status: 200 }
  )
})

vworld.get('/parcel-by-pnu', async (c) => {
  const origin = c.req.header('origin')
  const key = getVworldKey(c.req.header('x-vworld-key') ?? undefined)
  const validated = ParcelPnuSchema.safeParse({ pnu: c.req.query('pnu') })

  if (!key) {
    return c.json(createErrorResponse('VWorld API key is not configured.', c.req.path, 'ConfigurationError'), { status: 400 })
  }

  if (!validated.success) {
    return c.json(createErrorResponse('pnu 값이 올바르지 않습니다.', c.req.path, 'ValidationError'), { status: 400 })
  }

  const url = new URL('https://api.vworld.kr/req/data')
  url.searchParams.set('service', 'data')
  url.searchParams.set('version', '2.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('data', 'LP_PA_CBND_BUBUN')
  url.searchParams.set('format', 'json')
  url.searchParams.set('key', key)
  url.searchParams.set('attrFilter', `pnu:=:${validated.data.pnu}`)

  const domain = getRequestDomain(origin)
  if (domain) {
    url.searchParams.set('domain', domain)
  }

  try {
    const upstream = await requestUpstream(url.toString())

    if (upstream.status < 200 || upstream.status >= 300) {
      return c.json(createErrorResponse(`브이월드 PNU 조회 실패 (${upstream.status})`, c.req.path, 'ExternalApiError'), { status: 502 })
    }

    try {
      const payload = JSON.parse(upstream.text) as {
        response?: {
          error?: { text?: string }
          result?: {
            featureCollection?: {
              features?: Array<Record<string, unknown>>
            }
          }
        }
      }

      const feature = payload.response?.result?.featureCollection?.features?.[0]
      if (!feature) {
        return c.json(createErrorResponse(payload.response?.error?.text ?? '해당 PNU의 필지 도형을 찾지 못했습니다.', c.req.path, 'ExternalApiError'), { status: 404 })
      }

      return c.json(feature, { status: 200 })
    } catch {
      return c.json(createErrorResponse(`브이월드 PNU 응답 해석 실패: ${summarizeResponseText(upstream.text)}`, c.req.path, 'ExternalApiError'), { status: 502 })
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? `브이월드 PNU 조회 연결 실패: ${error.message}`
        : '브이월드 PNU 조회 연결에 실패했습니다.'
    return c.json(createErrorResponse(message, c.req.path, 'ExternalApiError'), { status: 502 })
  }
})

export default vworld
