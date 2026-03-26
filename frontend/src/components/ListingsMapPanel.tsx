import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadLeaflet, type LeafletBounds, type LeafletLayer, type LeafletMap } from '../lib/leaflet'
import { getParcelFeatureCenter } from '../lib/parcel-overlay'
import type { GeoJsonGeometry, ListingParcelFields } from '../types/parcel'
import StatusBadge from './StatusBadge'

interface ListingMapItem extends ListingParcelFields {
  id: number
  title: string
  description: string
  location: string
  area_sqm: number
  price_per_month: number
  status: 'active' | 'inactive' | 'rented'
  owner_id?: number
  created_at?: string
}

interface ListingMapPanelProps {
  listings: ListingMapItem[]
  selectedListingId?: number | null
  onSelectListing?: (listingId: number) => void
  renderSelectedActions?: (listing: ListingMapItem) => ReactNode
  heading?: string
  description?: string
  emptyMessage?: string
  railTitle?: string
}

type ListingCenter = {
  lat: number
  lng: number
}

type CenteredListing = {
  listing: ListingMapItem
  center: ListingCenter
}

function getGeometryBounds(geometry: GeoJsonGeometry): [number, number][] {
  const points =
    geometry.type === 'Polygon'
      ? geometry.coordinates.flat()
      : geometry.coordinates.flat(2)

  return points.map(([lng, lat]) => [lat, lng])
}

function toLeafletFeature(geometry: GeoJsonGeometry, properties: Record<string, string | number>) {
  return {
    type: 'Feature' as const,
    geometry,
    properties,
  }
}

function resolveListingCenter(listing: ListingMapItem): ListingCenter | null {
  if (listing.center_lat !== null && listing.center_lng !== null) {
    return {
      lat: listing.center_lat,
      lng: listing.center_lng,
    }
  }

  if (listing.parcel_geojson) {
    return getParcelFeatureCenter(listing.parcel_geojson)
  }

  return null
}

function isCenterWithinBounds(bounds: LeafletBounds, center: ListingCenter): boolean {
  return (
    center.lat >= bounds.getSouth() &&
    center.lat <= bounds.getNorth() &&
    center.lng >= bounds.getWest() &&
    center.lng <= bounds.getEast()
  )
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`
}

function formatArea(value: number): string {
  return `${value.toLocaleString('ko-KR')}㎡`
}

export default function ListingsMapPanel({
  listings,
  selectedListingId: controlledSelectedListingId,
  onSelectListing,
  renderSelectedActions,
  heading = '지도에서 매물을 탐색해 보세요',
  description = '포인트를 누르면 토지 정보가 열리고, 현재 지도 범위 안에 있는 매물만 오른쪽 목록에 표시됩니다.',
  emptyMessage = '지도에 표시할 수 있는 매물이 없습니다.',
  railTitle = '현재 지도에 보이는 매물',
}: ListingMapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layersRef = useRef<LeafletLayer[]>([])
  const hasFitInitialBoundsRef = useRef(false)
  const syncVisibleListingsRef = useRef<() => void>(() => undefined)

  const [internalSelectedListingId, setInternalSelectedListingId] = useState<number | null>(null)
  const [visibleListingIds, setVisibleListingIds] = useState<number[] | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)

  const centeredListings = useMemo<CenteredListing[]>(() => {
    return listings
      .map((listing: ListingMapItem) => {
        const center = resolveListingCenter(listing)

        if (!center) {
          return null
        }

        return { listing, center }
      })
      .filter((item): item is CenteredListing => item !== null)
  }, [listings])

  const visibleListings = useMemo(() => {
    if (visibleListingIds === null) {
      return centeredListings.map((item) => item.listing)
    }

    const visibleIdSet = new Set(visibleListingIds)
    return centeredListings
      .filter((item: CenteredListing) => visibleIdSet.has(item.listing.id))
      .map((item) => item.listing)
  }, [centeredListings, visibleListingIds])

  const activeSelectedListingId =
    controlledSelectedListingId ?? internalSelectedListingId
  const selectedListing =
    visibleListings.find((listing) => listing.id === activeSelectedListingId) ??
    centeredListings.find((item) => item.listing.id === activeSelectedListingId)?.listing ??
    visibleListings[0] ??
    centeredListings[0]?.listing ??
    null

  const handleSelectListing = useCallback(
    (listingId: number) => {
      setInternalSelectedListingId(listingId)
      onSelectListing?.(listingId)
    },
    [onSelectListing]
  )

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    let cancelled = false

    const initialize = async () => {
      const leaflet = await loadLeaflet()
      if (cancelled || !mapContainerRef.current) {
        return
      }

      const map = leaflet.map(mapContainerRef.current).setView([37.5665, 126.978], 13)
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        })
        .addTo(map)

      map.on('moveend', () => {
        syncVisibleListingsRef.current()
      })

      mapRef.current = map
      setIsMapReady(true)
    }

    initialize().catch(() => undefined)

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setIsMapReady(false)
      layersRef.current = []
      hasFitInitialBoundsRef.current = false
    }
  }, [])

  const syncVisibleListings = useCallback(() => {
    if (!mapRef.current) {
      setVisibleListingIds(null)
      return
    }

    const bounds = mapRef.current.getBounds()
    const nextIds = centeredListings
      .filter((item) => isCenterWithinBounds(bounds, item.center))
      .map((item) => item.listing.id)

    setVisibleListingIds((previousIds) => {
      if (
        previousIds !== null &&
        previousIds.length === nextIds.length &&
        previousIds.every((id, index) => id === nextIds[index])
      ) {
        return previousIds
      }

      return nextIds
    })
  }, [centeredListings])

  useEffect(() => {
    syncVisibleListingsRef.current = syncVisibleListings
  }, [syncVisibleListings])

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.L) {
      return
    }

    const map = mapRef.current
    const leaflet = window.L
    if (!leaflet) {
      return
    }

    layersRef.current.forEach((layer) => layer.remove())
    layersRef.current = []

    if (centeredListings.length === 0) {
      setVisibleListingIds([])
      return
    }

    centeredListings.forEach(({ listing, center }) => {
      const isSelected = listing.id === selectedListing?.id

      if (listing.parcel_geojson) {
        const polygonLayer = leaflet
          .geoJSON(toLeafletFeature(listing.parcel_geojson, { id: listing.id }), {
            style: {
              color: isSelected ? '#0f6d58' : '#8aa09a',
              weight: isSelected ? 2.4 : 1.2,
              fillColor: isSelected ? '#11a97c' : '#c7ddd5',
              fillOpacity: isSelected ? 0.14 : 0.05,
            },
          })
          .addTo(map)

        polygonLayer.eachLayer?.((innerLayer) => {
          innerLayer.on('click', () => {
            handleSelectListing(listing.id)
            map.panTo([center.lat, center.lng], { animate: true, duration: 0.35 })
          })
        })

        layersRef.current.push(polygonLayer)
      }

      const markerLayer = leaflet
        .circleMarker([center.lat, center.lng], {
          radius: isSelected ? 10 : 8,
          color: isSelected ? '#0b3b31' : '#ffffff',
          weight: isSelected ? 3 : 2,
          fillColor: isSelected ? '#0ea371' : '#16c58a',
          fillOpacity: 0.95,
        })
        .addTo(map)

      markerLayer.on('click', () => {
        handleSelectListing(listing.id)
        map.panTo([center.lat, center.lng], { animate: true, duration: 0.35 })
      })

      layersRef.current.push(markerLayer)
    })

    if (!hasFitInitialBoundsRef.current) {
      map.fitBounds(
        leaflet.latLngBounds(
          centeredListings.map(({ center }) => [center.lat, center.lng] as [number, number])
        ),
        { padding: [28, 28] }
      )
      hasFitInitialBoundsRef.current = true
    }

    syncVisibleListings()
  }, [centeredListings, handleSelectListing, isMapReady, selectedListing?.id, syncVisibleListings])

  const mapDisplayCount = visibleListings.length
  const hiddenByViewportCount = Math.max(centeredListings.length - mapDisplayCount, 0)

  return (
    <section className="section-card listing-map-shell">
      <div className="listing-map-shell-header">
        <div>
          <p className="panel-kicker">Map First Search</p>
          <h3>{heading}</h3>
          <p className="listing-map-shell-description">{description}</p>
        </div>
        <div className="listing-map-shell-stats">
          <span>현재 화면 {mapDisplayCount}개</span>
          <span>지도 가능 {centeredListings.length}개</span>
          {hiddenByViewportCount > 0 && <span>화면 밖 {hiddenByViewportCount}개</span>}
        </div>
      </div>

      <div className="map-layout listing-map-layout">
        <div className="listing-map-stage">
          <div ref={mapContainerRef} className="parcel-map-canvas listing-map-canvas" />
          <div className="listing-map-stage-note">
            {centeredListings.length === 0
              ? '검색하지 않아도 지도를 자유롭게 둘러볼 수 있습니다. 지도에 올릴 수 있는 매물이 생기면 포인트로 표시됩니다.'
              : '포인트를 눌러 매물 정보를 확인하고, 지도를 이동하면 현재 범위 안의 매물만 오른쪽에 정렬됩니다.'}
          </div>
        </div>

        <aside className="parcel-side-panel listing-map-sidebar">
          {selectedListing ? (
            <>
              <div className="selected-listing-panel">
                <div className="selected-listing-head">
                  <div>
                    <p className="panel-kicker">Selected Listing</p>
                    <h4>{selectedListing.title}</h4>
                  </div>
                  <StatusBadge status={selectedListing.status} />
                </div>

                <p className="selected-listing-description">{selectedListing.description}</p>

                <div className="selected-listing-grid">
                  <div>
                    <strong>지역</strong>
                    <span>{selectedListing.location}</span>
                  </div>
                  <div>
                    <strong>토지 크기</strong>
                    <span>{formatArea(selectedListing.area_sqm)}</span>
                  </div>
                  <div>
                    <strong>월세</strong>
                    <span>{formatCurrency(selectedListing.price_per_month)}</span>
                  </div>
                  <div>
                    <strong>PNU</strong>
                    <span>{selectedListing.parcel_pnu ?? '미설정'}</span>
                  </div>
                  {selectedListing.created_at && (
                    <div>
                      <strong>등록일</strong>
                      <span>
                        {new Date(selectedListing.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  )}
                </div>

                {renderSelectedActions && (
                  <div className="selected-listing-actions">
                    {renderSelectedActions(selectedListing)}
                  </div>
                )}
              </div>

              <div className="listing-rail">
                <div className="listing-rail-header">
                  <h5>{railTitle}</h5>
                  <span>{mapDisplayCount}개</span>
                </div>

                {visibleListings.length === 0 ? (
                  <div className="listing-map-empty-state">
                    <p>현재 지도 화면 안에 보이는 매물이 없습니다.</p>
                    <span>지도를 이동하거나 검색 조건을 조정해 보세요.</span>
                  </div>
                ) : (
                  <div className="listing-rail-list">
                    {visibleListings.map((listing) => {
                      const isSelected = listing.id === selectedListing.id

                      return (
                        <button
                          key={listing.id}
                          type="button"
                          className={`listing-rail-card${isSelected ? ' listing-rail-card-active' : ''}`}
                          onClick={() => handleSelectListing(listing.id)}
                        >
                          <div className="listing-rail-card-top">
                            <strong>{listing.title}</strong>
                            <StatusBadge status={listing.status} />
                          </div>
                          <span>{listing.location}</span>
                          <div className="listing-rail-card-meta">
                            <span>{formatArea(listing.area_sqm)}</span>
                            <span>{formatCurrency(listing.price_per_month)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : centeredListings.length === 0 ? (
            <div className="listing-map-empty-state">
              <p>{emptyMessage}</p>
              <span>그래도 지도는 바로 움직여 보면서 주변을 탐색할 수 있습니다.</span>
            </div>
          ) : (
            <div className="listing-map-empty-state">
              <p>현재 지도 범위 안에 보이는 매물이 없습니다.</p>
              <span>지도를 이동하거나 지역 검색 조건을 다시 지정해 보세요.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
