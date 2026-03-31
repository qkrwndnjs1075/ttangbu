import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { loadLeaflet, type LeafletBounds, type LeafletLayer, type LeafletMap } from '../lib/leaflet'
import { getParcelFeatureCenter } from '../lib/parcel-overlay'
import {
  KOREA_PROVINCES_URL,
  KOREA_MUNICIPALITIES_URL,
  extractRegionName,
  extractRegionCode,
} from '../lib/korea-regions'
import type { GeoJsonGeometry, ListingParcelFields } from '../types/parcel'
import StatusBadge from './StatusBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type ListingCenter = { lat: number; lng: number }
type CenteredListing = { listing: ListingMapItem; center: ListingCenter }

/** 현재 지도 단계 */
type MapLevel = 'province' | 'municipality' | 'listing'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGeometryBounds(geometry: GeoJsonGeometry): [number, number][] {
  const points =
    geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
  return points.map(([lng, lat]) => [lat, lng])
}

function resolveListingCenter(listing: ListingMapItem): ListingCenter | null {
  if (listing.center_lat !== null && listing.center_lng !== null) {
    return { lat: listing.center_lat, lng: listing.center_lng }
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

function zoomToLevel(zoom: number): MapLevel {
  if (zoom >= 10) return 'listing'
  if (zoom >= 8) return 'municipality'
  return 'province'
}

// ─── GeoJSON 로더 ──────────────────────────────────────────────────────────────

let provincesCache: unknown = null
let municipalitiesCache: unknown = null

async function loadProvincesGeoJson(): Promise<unknown> {
  if (provincesCache) return provincesCache
  const res = await fetch(KOREA_PROVINCES_URL)
  provincesCache = await res.json()
  return provincesCache
}

async function loadMunicipalitiesGeoJson(): Promise<unknown> {
  if (municipalitiesCache) return municipalitiesCache
  const res = await fetch(KOREA_MUNICIPALITIES_URL)
  municipalitiesCache = await res.json()
  return municipalitiesCache
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ListingsMapPanel({
  listings,
  selectedListingId: controlledSelectedListingId,
  onSelectListing,
  renderSelectedActions,
  heading = '지역 경계로 바로 찾는 토지 매물',
  description = '시/도 경계를 클릭하면 시/군/구로 내려가고, 지역을 확대하면 매물이 지도 위에 펼쳐집니다.',
  emptyMessage = '지도에 표시할 수 있는 매물이 없습니다.',
  railTitle = '현재 지도에 보이는 매물',
}: ListingMapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  // 레이어 그룹 ref
  const provinceLayers = useRef<LeafletLayer[]>([])
  const municipalityLayers = useRef<LeafletLayer[]>([])
  const listingLayers = useRef<LeafletLayer[]>([])

  const syncVisibleListingsRef = useRef<() => void>(() => undefined)

  const [isMapReady, setIsMapReady] = useState(false)
  const [mapLevel, setMapLevel] = useState<MapLevel>('province')
  const [selectedRegionName, setSelectedRegionName] = useState<string | null>(null)
  const [internalSelectedListingId, setInternalSelectedListingId] = useState<number | null>(null)
  const [visibleListingIds, setVisibleListingIds] = useState<number[] | null>(null)
  const [geoDataReady, setGeoDataReady] = useState(false)

  // 미리 GeoJSON fetch
  const provincesRef = useRef<unknown>(null)
  const municipalitiesRef = useRef<unknown>(null)

  const activeSelectedListingId = controlledSelectedListingId ?? internalSelectedListingId

  const centeredListings = useMemo<CenteredListing[]>(() => {
    return listings
      .map((listing: ListingMapItem) => {
        const center = resolveListingCenter(listing)
        if (!center) return null
        return { listing, center }
      })
      .filter((item): item is CenteredListing => item !== null)
  }, [listings])

  const visibleListings = useMemo(() => {
    if (visibleListingIds === null) return centeredListings.map((item) => item.listing)
    const visibleIdSet = new Set(visibleListingIds)
    return centeredListings
      .filter((item: CenteredListing) => visibleIdSet.has(item.listing.id))
      .map((item) => item.listing)
  }, [centeredListings, visibleListingIds])

  const selectedListing =
    visibleListings.find((l) => l.id === activeSelectedListingId) ??
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

  // ─── GeoJSON 사전 로드 ────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([loadProvincesGeoJson(), loadMunicipalitiesGeoJson()])
      .then(([provinces, municipalities]) => {
        provincesRef.current = provinces
        municipalitiesRef.current = municipalities
        setGeoDataReady(true)
      })
      .catch(() => undefined)
  }, [])

  // ─── 지도 초기화 ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let cancelled = false

    const initialize = async () => {
      const leaflet = await loadLeaflet()
      if (cancelled || !mapContainerRef.current) return

      // 대한민국 중심 (충청북도 청주시 부근) 줌 7
      const map = leaflet.map(mapContainerRef.current).setView([36.5, 127.5], 7)
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        })
        .addTo(map)

      map.on('zoomend', () => {
        const zoom = map.getZoom()
        const level = zoomToLevel(zoom)
        setMapLevel(level)
        syncVisibleListingsRef.current()
      })

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
      provinceLayers.current = []
      municipalityLayers.current = []
      listingLayers.current = []
    }
  }, [])

  // ─── 레이어 클리어 헬퍼 ───────────────────────────────────────────────────

  const clearLayers = useCallback((layers: LeafletLayer[]) => {
    layers.forEach((l) => l.remove())
    layers.length = 0
  }, [])

  // ─── 시/도 경계 레이어 그리기 ─────────────────────────────────────────────

  const renderProvinceLayer = useCallback(() => {
    const map = mapRef.current
    const leaflet = window.L
    const data = provincesRef.current
    if (!map || !leaflet || !data) return

    clearLayers(provinceLayers.current)

    const layer = leaflet.geoJSON(data, {
      style: () => ({
        color: '#4a7fa5',
        weight: 2,
        fillColor: '#d4e8f5',
        fillOpacity: 0.25,
      }),
      onEachFeature: (feature: unknown, featureLayer) => {
        const f = feature as { properties: Record<string, unknown>; geometry: GeoJsonGeometry }
        const name = extractRegionName(f.properties)

        featureLayer.on('click', () => {
          const bounds = (featureLayer as unknown as { getBounds: () => unknown }).getBounds?.()
          if (bounds) {
            map.flyToBounds(bounds, { padding: [20, 20], maxZoom: 9, duration: 0.6 })
          }
          setSelectedRegionName(name)
        })
      },
    })

    layer.addTo(map)
    provinceLayers.current.push(layer)
  }, [clearLayers])

  // ─── 시/군/구 경계 레이어 그리기 ─────────────────────────────────────────

  const renderMunicipalityLayer = useCallback(() => {
    const map = mapRef.current
    const leaflet = window.L
    const data = municipalitiesRef.current
    if (!map || !leaflet || !data) return

    clearLayers(municipalityLayers.current)

    const layer = leaflet.geoJSON(data, {
      style: () => ({
        color: '#2e7d52',
        weight: 1.5,
        fillColor: '#c8e6d4',
        fillOpacity: 0.2,
      }),
      onEachFeature: (feature: unknown, featureLayer) => {
        const f = feature as { properties: Record<string, unknown>; geometry: GeoJsonGeometry }
        const name = extractRegionName(f.properties)

        featureLayer.on('click', () => {
          const bounds = (featureLayer as unknown as { getBounds: () => unknown }).getBounds?.()
          if (bounds) {
            map.flyToBounds(bounds, { padding: [20, 20], maxZoom: 13, duration: 0.5 })
          }
          setSelectedRegionName(name)
        })
      },
    })

    layer.addTo(map)
    municipalityLayers.current.push(layer)
  }, [clearLayers])

  // ─── 매물 마커 레이어 그리기 ──────────────────────────────────────────────

  const renderListingMarkers = useCallback(() => {
    const map = mapRef.current
    const leaflet = window.L
    if (!map || !leaflet) return

    clearLayers(listingLayers.current)

    centeredListings.forEach(({ listing, center }) => {
      const isSelected = listing.id === selectedListing?.id

      if (listing.parcel_geojson) {
        const polygonLayer = leaflet
          .geoJSON(
            {
              type: 'Feature',
              geometry: listing.parcel_geojson,
              properties: { id: listing.id },
            },
            {
              style: {
                color: isSelected ? '#0f6d58' : '#8aa09a',
                weight: isSelected ? 2.4 : 1.2,
                fillColor: isSelected ? '#11a97c' : '#c7ddd5',
                fillOpacity: isSelected ? 0.18 : 0.06,
              },
            }
          )
          .addTo(map)

        polygonLayer.eachLayer?.((innerLayer) => {
          innerLayer.on('click', () => {
            handleSelectListing(listing.id)
            map.panTo([center.lat, center.lng], { animate: true, duration: 0.35 })
          })
        })

        listingLayers.current.push(polygonLayer)
      }

      const markerLayer = leaflet
        .circleMarker([center.lat, center.lng], {
          radius: isSelected ? 11 : 8,
          color: isSelected ? '#0b3b31' : '#ffffff',
          weight: isSelected ? 3 : 2,
          fillColor: isSelected ? '#0ea371' : '#1db97f',
          fillOpacity: 0.95,
        })
        .addTo(map)

      markerLayer.on('click', () => {
        handleSelectListing(listing.id)
        map.panTo([center.lat, center.lng], { animate: true, duration: 0.35 })
      })

      listingLayers.current.push(markerLayer)
    })
  }, [centeredListings, clearLayers, handleSelectListing, selectedListing?.id])

  // ─── 줌 레벨에 따른 레이어 전환 ──────────────────────────────────────────

  useEffect(() => {
    if (!isMapReady || !geoDataReady) return

    if (mapLevel === 'province') {
      clearLayers(municipalityLayers.current)
      clearLayers(listingLayers.current)
      renderProvinceLayer()
    } else if (mapLevel === 'municipality') {
      clearLayers(provinceLayers.current)
      clearLayers(listingLayers.current)
      renderMunicipalityLayer()
    } else {
      // listing 레벨
      clearLayers(provinceLayers.current)
      // 시/군/구 경계는 배경으로 은은하게 유지
      if (municipalityLayers.current.length === 0) {
        renderMunicipalityLayer()
      }
      renderListingMarkers()
    }
  }, [
    isMapReady,
    geoDataReady,
    mapLevel,
    clearLayers,
    renderProvinceLayer,
    renderMunicipalityLayer,
    renderListingMarkers,
  ])

  // ─── 매물 목록 동기화 ─────────────────────────────────────────────────────

  const syncVisibleListings = useCallback(() => {
    if (!mapRef.current) {
      setVisibleListingIds(null)
      return
    }

    const bounds = mapRef.current.getBounds()
    const nextIds = centeredListings
      .filter((item) => isCenterWithinBounds(bounds, item.center))
      .map((item) => item.listing.id)

    setVisibleListingIds((prev) => {
      if (
        prev !== null &&
        prev.length === nextIds.length &&
        prev.every((id, i) => id === nextIds[i])
      ) {
        return prev
      }
      return nextIds
    })
  }, [centeredListings])

  useEffect(() => {
    syncVisibleListingsRef.current = syncVisibleListings
  }, [syncVisibleListings])

  // 매물 마커 선택 변경 시 재렌더
  useEffect(() => {
    if (!isMapReady || mapLevel !== 'listing') return
    renderListingMarkers()
  }, [isMapReady, mapLevel, renderListingMarkers])

  // 매물 목록 변경 시 재렌더
  useEffect(() => {
    if (!isMapReady || mapLevel !== 'listing') return
    renderListingMarkers()
    syncVisibleListings()
  }, [isMapReady, mapLevel, centeredListings, renderListingMarkers, syncVisibleListings])

  // ─── 뒤로 가기 핸들러 ────────────────────────────────────────────────────

  const handleGoBack = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const zoom = map.getZoom()
    if (zoom >= 10) {
      map.setZoom(8)
      setMapLevel('municipality')
    } else if (zoom >= 8) {
      map.setZoom(6)
      setMapLevel('province')
    }
    setSelectedRegionName(null)
  }, [])

  // ─── 상태 계산 ────────────────────────────────────────────────────────────

  const mapDisplayCount = visibleListings.length
  const hiddenByViewportCount = Math.max(centeredListings.length - mapDisplayCount, 0)

  const levelLabel = mapLevel === 'province'
    ? '시/도 선택'
    : mapLevel === 'municipality'
    ? '시/군/구 선택'
    : '매물 확인'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="section-card listing-map-shell">
      <div className="listing-map-shell-header">
        <div>
          <p className="panel-kicker">지역 경계 지도</p>
          <h3>{heading}</h3>
          <p className="listing-map-shell-description">{description}</p>
        </div>
        <div className="listing-map-shell-stats">
          <span className="region-level-badge">{levelLabel}</span>
          {selectedRegionName && (
            <span className="region-selected-badge">📍 {selectedRegionName}</span>
          )}
          {mapLevel === 'listing' && (
            <>
              <span>현재 화면 {mapDisplayCount}개</span>
              <span>전체 {centeredListings.length}개</span>
              {hiddenByViewportCount > 0 && <span>화면 밖 {hiddenByViewportCount}개</span>}
            </>
          )}
        </div>
      </div>

      <div className="map-layout listing-map-layout">
        <div className="listing-map-stage">
          <div ref={mapContainerRef} className="parcel-map-canvas listing-map-canvas" />

          {/* 안내 띠 */}
          <div className="listing-map-stage-note">
            {mapLevel === 'province' && '시/도 경계를 클릭하거나 확대하면 시/군/구 경계로 이동합니다.'}
            {mapLevel === 'municipality' && '시/군/구를 클릭하거나 더 확대하면 매물이 지도에 표시됩니다.'}
            {mapLevel === 'listing' && (
              centeredListings.length === 0
                ? '이 지역에 표시할 매물이 없습니다. 다른 지역으로 이동해 보세요.'
                : '포인트를 눌러 매물 정보를 확인하세요. 확대/이동하면 범위 안의 매물이 오른쪽에 표시됩니다.'
            )}
          </div>

          {/* 뒤로 가기 버튼 */}
          {mapLevel !== 'province' && (
            <button
              type="button"
              className="map-back-button"
              onClick={handleGoBack}
            >
              ← 더 넓은 지역 보기
            </button>
          )}

          {/* 드릴다운 힌트 */}
          {!geoDataReady && (
            <div className="map-loading-overlay">
              <span>지역 경계 데이터 로딩 중...</span>
            </div>
          )}
        </div>

        <aside className="parcel-side-panel listing-map-sidebar">
          {mapLevel !== 'listing' ? (
            <div className="listing-map-region-guide">
              <div className="region-guide-icon">🗺️</div>
              <p className="region-guide-title">
                {mapLevel === 'province' ? '시/도를 선택하세요' : '시/군/구를 선택하세요'}
              </p>
              <p className="region-guide-desc">
                {mapLevel === 'province'
                  ? '지도에서 원하는 시/도 경계를 클릭하거나 스크롤로 확대하면 해당 지역의 시/군/구 경계가 나타납니다.'
                  : '시/군/구 경계를 클릭하거나 더 확대하면 해당 지역의 매물 목록이 나타납니다.'}
              </p>
              {centeredListings.length > 0 && (
                <p className="region-guide-count">
                  지도에 올릴 수 있는 매물 총 {centeredListings.length}개
                </p>
              )}
            </div>
          ) : selectedListing ? (
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
              <span>지도에서 지역을 탐색해 보세요.</span>
            </div>
          ) : (
            <div className="listing-map-empty-state">
              <p>현재 지도 범위 안에 보이는 매물이 없습니다.</p>
              <span>지도를 이동하거나 다른 지역을 선택해 보세요.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
