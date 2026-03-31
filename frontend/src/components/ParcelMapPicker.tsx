import { useEffect, useRef, useState } from 'react'
import { loadLeaflet, type LeafletLayer, type LeafletMap } from '../lib/leaflet'
import type { ParcelSelection } from '../types/parcel'
import {
  createParcelSelection,
  isParcelOverlayViewport,
  parseParcelNumber,
  toLeafletFeature,
  type ParcelBounds,
  type ParcelFeature,
} from '../lib/parcel-overlay'

interface ParcelMapPickerProps {
  value: ParcelSelection | null
  onChange: (value: ParcelSelection | null) => void
}

type SearchResponseItem = {
  id?: string
  address?: {
    parcel?: string
    road?: string
  }
  point?: {
    x?: string
    y?: string
  }
  x?: string
  y?: string
}

type SearchApiResponse = {
  response?: {
    result?: {
      items?: SearchResponseItem[]
    }
  }
  message?: string
}

type WfsResponse = {
  features?: ParcelFeature[]
  message?: string
}

type VisibleParcelsResponse = {
  features?: ParcelFeature[]
  message?: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY

function parseJsonSafely<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function requestParcelFeature(lat: number, lng: number): Promise<ParcelFeature> {
  const response = await fetch(
    `${API_BASE}/vworld/parcel?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
    {
      headers: {
        'X-VWorld-Key': VWORLD_KEY,
      },
    }
  )

  const responseText = await response.text()
  const payload = parseJsonSafely<WfsResponse>(responseText)

  if (!response.ok) {
    throw new Error(payload?.message ?? `브이월드 필지 조회 실패 (${response.status})`)
  }

  const feature = payload?.features?.[0]
  if (!feature?.geometry) {
    throw new Error(payload?.message ?? '선택한 위치에서 필지 도형을 찾지 못했습니다.')
  }

  return feature
}

async function requestParcelFeatureByPnu(pnu: string): Promise<ParcelFeature> {
  const response = await fetch(
    `${API_BASE}/vworld/parcel-by-pnu?pnu=${encodeURIComponent(pnu)}`,
    {
      headers: {
        'X-VWorld-Key': VWORLD_KEY,
      },
    }
  )

  const responseText = await response.text()
  const payload = parseJsonSafely<ParcelFeature & { message?: string }>(responseText)

  if (!response.ok) {
    throw new Error(payload?.message ?? `브이월드 PNU 조회 실패 (${response.status})`)
  }

  if (!payload?.geometry) {
    throw new Error(payload?.message ?? 'PNU 기준 필지 도형을 찾지 못했습니다.')
  }

  return payload
}

async function requestVisibleParcels(bounds: ParcelBounds): Promise<ParcelFeature[]> {
  const query = new URLSearchParams({
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
    limit: '80',
  })

  const response = await fetch(`${API_BASE}/vworld/parcels?${query.toString()}`, {
    headers: {
      'X-VWorld-Key': VWORLD_KEY,
    },
  })

  const responseText = await response.text()
  const payload = parseJsonSafely<VisibleParcelsResponse>(responseText)

  if (!response.ok) {
    throw new Error(payload?.message ?? `브이월드 필지 목록 조회 실패 (${response.status})`)
  }

  return payload?.features ?? []
}

function getFeatureLabel(feature: ParcelFeature, fallbackJibun: string): string {
  return (
    feature.properties?.addr ??
    feature.properties?.ADDR ??
    feature.properties?.jibun ??
    feature.properties?.JIBUN ??
    fallbackJibun
  )
}

export default function ParcelMapPicker({ value, onChange }: ParcelMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const highlightLayerRef = useRef<LeafletLayer | null>(null)
  const parcelOverlayLayerRef = useRef<LeafletLayer | null>(null)
  const onChangeRef = useRef(onChange)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusMessage, setStatusMessage] = useState(
    '지도를 클릭하거나 주소를 검색해 필지를 선택하세요.'
  )
  const [overlayMessage, setOverlayMessage] = useState(
    '지도를 조금 더 확대하면 필지 경계가 표시됩니다.'
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!VWORLD_KEY || !mapContainerRef.current || mapRef.current) {
      return
    }

    let cancelled = false

    const initialize = async () => {
      const L = await loadLeaflet()
      if (cancelled || !mapContainerRef.current) {
        return
      }

      const drawSelectedFeature = (feature: ParcelFeature, fallbackJibun: string) => {
        if (!feature.geometry || !mapRef.current) {
          return
        }

        if (highlightLayerRef.current) {
          highlightLayerRef.current.remove()
        }

        highlightLayerRef.current = L.geoJSON(toLeafletFeature(feature.geometry, feature.properties), {
          style: {
            color: '#d9480f',
            weight: 3,
            fillColor: '#fdba74',
            fillOpacity: 0.35,
          },
        }).addTo(mapRef.current)

        const bounds = highlightLayerRef.current.getBounds?.()
        if (bounds) {
          mapRef.current.fitBounds(bounds, { padding: [24, 24] })
        }

        onChangeRef.current(createParcelSelection(feature, fallbackJibun))
        setStatusMessage('필지를 선택했습니다. 저장하면 매물 지도에 그대로 반영됩니다.')
      }

      const refreshParcelOverlay = async () => {
        if (!mapRef.current || !window.L) {
          return
        }

        const bounds = mapRef.current.getBounds()
        const viewport = {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        }

        if (!isParcelOverlayViewport(viewport)) {
          if (parcelOverlayLayerRef.current) {
            parcelOverlayLayerRef.current.remove()
            parcelOverlayLayerRef.current = null
          }
          setOverlayMessage('지도를 조금 더 확대하면 필지 경계가 표시됩니다.')
          return
        }

        try {
          const features = await requestVisibleParcels(viewport)

          if (parcelOverlayLayerRef.current) {
            parcelOverlayLayerRef.current.remove()
          }

          parcelOverlayLayerRef.current = window.L.geoJSON(
            {
              type: 'FeatureCollection',
              features: features
                .filter((feature) => feature.geometry)
                .map((feature) => toLeafletFeature(feature.geometry!, feature.properties)),
            },
            {
              style: {
                color: '#0f766e',
                weight: 1,
                fillColor: '#99f6e4',
                fillOpacity: 0.08,
              },
              onEachFeature: (rawFeature, layer) => {
                const feature = rawFeature as ParcelFeature
                layer.on('click', () => {
                  drawSelectedFeature(feature, getFeatureLabel(feature, '선택한 필지'))
                })
              },
            }
          ).addTo(mapRef.current)

          setOverlayMessage(
            features.length > 0
              ? '보이는 필지 경계를 불러왔습니다. 선을 직접 클릭해 선택할 수 있습니다.'
              : '현재 화면 범위에서 표시할 필지를 찾지 못했습니다.'
          )
        } catch (error) {
          if (parcelOverlayLayerRef.current) {
            parcelOverlayLayerRef.current.remove()
            parcelOverlayLayerRef.current = null
          }
          setOverlayMessage(
            error instanceof Error ? error.message : '필지 경계를 불러오지 못했습니다.'
          )
        }
      }

      const map = L.map(mapContainerRef.current).setView([37.5665, 126.978], 15)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      map.on('click', async (event) => {
        if (!event?.latlng) {
          return
        }

        setErrorMessage('')
        setStatusMessage('선택한 위치의 필지를 조회하는 중입니다...')

        try {
          const feature = await requestParcelFeature(event.latlng.lat, event.latlng.lng)
          drawSelectedFeature(feature, '주소 미확인')
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '필지 정보를 불러오지 못했습니다.'
          setErrorMessage(message)
          setStatusMessage('다른 위치를 클릭하거나 주소 검색으로 이동해 보세요.')
        }
      })

      map.on('moveend', () => {
        void refreshParcelOverlay()
      })

      mapRef.current = map
      setIsMapReady(true)
      void refreshParcelOverlay()
    }

    initialize().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : '지도를 초기화하지 못했습니다.')
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setIsMapReady(false)
      highlightLayerRef.current = null
      parcelOverlayLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.L) {
      return
    }

    if (!value) {
      if (highlightLayerRef.current) {
        highlightLayerRef.current.remove()
        highlightLayerRef.current = null
      }
      return
    }

    if (highlightLayerRef.current) {
      highlightLayerRef.current.remove()
    }

    highlightLayerRef.current = window.L.geoJSON(toLeafletFeature(value.parcelGeoJson), {
      style: {
        color: '#d9480f',
        weight: 3,
        fillColor: '#fdba74',
        fillOpacity: 0.35,
      },
    }).addTo(mapRef.current)

    const bounds = highlightLayerRef.current.getBounds?.()
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: [24, 24] })
    }
  }, [isMapReady, value])

  const handleSearch = async () => {
    if (!VWORLD_KEY || !mapRef.current || !searchQuery.trim()) {
      return
    }

    setErrorMessage('')
    setStatusMessage('주소를 검색하는 중입니다...')

    try {
      const response = await fetch(
        `${API_BASE}/vworld/search?query=${encodeURIComponent(searchQuery.trim())}`,
        {
          headers: {
            'X-VWorld-Key': VWORLD_KEY,
          },
        }
      )

      const responseText = await response.text()
      const payload = parseJsonSafely<SearchApiResponse>(responseText)

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? `주소 검색에 실패했습니다. (${response.status})`)
      }

      const item = payload.response?.result?.items?.[0]
      const lng = parseParcelNumber(item?.point?.x ?? item?.x)
      const lat = parseParcelNumber(item?.point?.y ?? item?.y)
      const pnu = item?.id

      if (lng === undefined || lat === undefined) {
        throw new Error('주소 검색 결과가 없습니다.')
      }

      mapRef.current.setView([lat, lng], 18)

      if (!pnu) {
        setStatusMessage('지도를 해당 위치로 이동했습니다. 보이는 필지를 직접 클릭해 주세요.')
        return
      }

      setStatusMessage('검색한 주소의 필지 경계를 불러오는 중입니다...')
      const feature = await requestParcelFeatureByPnu(pnu)
      if (!feature.geometry) {
        throw new Error('검색한 주소에서 필지 도형을 찾지 못했습니다.')
      }

      const selection = createParcelSelection(
        feature,
        item.address?.parcel ?? searchQuery.trim()
      )

      selection.parcelPnu = feature.properties?.pnu ?? feature.properties?.PNU ?? pnu
      selection.jibun = getFeatureLabel(feature, item.address?.parcel ?? searchQuery.trim())
      selection.areaSqm = parseParcelNumber(
        feature.properties?.parea ?? feature.properties?.PAREA
      )

      onChange(selection)
      setStatusMessage('검색 결과의 필지를 자동으로 선택했습니다.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '주소 검색에 실패했습니다.')
    }
  }

  if (!VWORLD_KEY) {
    return (
      <div className="state-message map-warning">
        <p>`VITE_VWORLD_API_KEY`가 설정되어야 실제 필지 조회를 사용할 수 있습니다.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          키가 없으면 지도는 보이지만 필지 검색과 저장은 동작하지 않습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="parcel-picker">
      <div className="map-toolbar">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="지번 주소를 검색하거나 지도를 이동해 보세요"
        />
        <button type="button" className="button button-secondary" onClick={handleSearch}>
          주소 검색
        </button>
        {value && (
          <button type="button" className="button button-secondary" onClick={() => onChange(null)}>
            선택 해제
          </button>
        )}
      </div>

      <div className="map-layout">
        <div ref={mapContainerRef} className="parcel-map-canvas" />
        <aside className="parcel-side-panel">
          <h4>선택한 필지</h4>
          {value ? (
            <div className="parcel-side-panel-content">
              <div>
                <strong>PNU</strong>
                <span>{value.parcelPnu}</span>
              </div>
              <div>
                <strong>주소</strong>
                <span>{value.jibun}</span>
              </div>
              <div>
                <strong>중심 좌표</strong>
                <span>
                  {value.centerLat.toFixed(6)}, {value.centerLng.toFixed(6)}
                </span>
              </div>
              {value.areaSqm !== undefined && (
                <div>
                  <strong>공공 면적</strong>
                  <span>{value.areaSqm.toLocaleString('ko-KR')}㎡</span>
                </div>
              )}
            </div>
          ) : (
            <p>지도 위 필지 선을 클릭하면 여기에서 선택 정보를 볼 수 있습니다.</p>
          )}

          <p className="map-status-message">{statusMessage}</p>
          <p className="map-status-message">{overlayMessage}</p>
          {errorMessage && <p className="auth-error">{errorMessage}</p>}
        </aside>
      </div>
    </div>
  )
}
