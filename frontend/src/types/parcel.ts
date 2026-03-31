export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon'
  coordinates: [number, number][][][]
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon

export interface ParcelSelection {
  parcelPnu: string
  parcelGeoJson: GeoJsonGeometry
  centerLat: number
  centerLng: number
  jibun: string
  areaSqm?: number
}

export interface ListingParcelFields {
  parcel_pnu: string | null
  center_lat: number | null
  center_lng: number | null
  parcel_geojson: GeoJsonGeometry | null
}
