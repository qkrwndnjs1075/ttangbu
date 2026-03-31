import type { GeoJsonGeometry, ParcelSelection } from '../types/parcel'

export type ParcelFeatureProperties = {
  pnu?: string
  PNU?: string
  jibun?: string
  JIBUN?: string
  addr?: string
  ADDR?: string
  parea?: string | number
  PAREA?: string | number
}

export type ParcelFeature = {
  properties?: ParcelFeatureProperties
  geometry?: GeoJsonGeometry
}

export type ParcelBounds = {
  south: number
  west: number
  north: number
  east: number
}

export function parseParcelNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function getParcelFeatureCenter(geometry: GeoJsonGeometry): { lat: number; lng: number } {
  const points = geometry.type === 'Polygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2)
  const count = points.length || 1
  const sums = points.reduce(
    (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 }
  )

  return {
    lat: sums.lat / count,
    lng: sums.lng / count,
  }
}

export function toLeafletFeature(geometry: GeoJsonGeometry, properties?: ParcelFeatureProperties) {
  return {
    type: 'Feature' as const,
    geometry,
    properties: properties ?? {},
  }
}

export function createParcelSelection(
  feature: ParcelFeature,
  fallbackJibun: string
): ParcelSelection {
  if (!feature.geometry) {
    throw new Error('Parcel geometry is missing.')
  }

  const center = getParcelFeatureCenter(feature.geometry)

  return {
    parcelPnu: feature.properties?.pnu ?? feature.properties?.PNU ?? 'UNKNOWN',
    jibun:
      feature.properties?.addr ??
      feature.properties?.ADDR ??
      feature.properties?.jibun ??
      feature.properties?.JIBUN ??
      fallbackJibun,
    parcelGeoJson: feature.geometry,
    centerLat: center.lat,
    centerLng: center.lng,
    areaSqm: parseParcelNumber(feature.properties?.parea ?? feature.properties?.PAREA),
  }
}

export function isParcelOverlayViewport(bounds: ParcelBounds): boolean {
  return bounds.north - bounds.south <= 0.02 && bounds.east - bounds.west <= 0.02
}
