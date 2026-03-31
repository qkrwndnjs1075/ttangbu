import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ListingsMapPanel from '../components/ListingsMapPanel'
import StatusBadge from '../components/StatusBadge'
import type { ListingParcelFields } from '../types/parcel'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

interface Listing extends ListingParcelFields {
  id: number
  title: string
  description: string
  location: string
  area_sqm: number
  price_per_month: number
  status: 'active' | 'inactive' | 'rented'
  owner_id: number
  created_at: string
  updated_at: string
}

interface ListingsResponse {
  success: boolean
  data: {
    listings: Listing[]
    pagination: {
      page: number
      limit: number
      total: number
      pages: number
    }
  }
}

interface User {
  id: number
  email: string
  name: string
}

interface MeResponse {
  success: boolean
  data: {
    user: User
  }
}

interface ApplicationSuccessResponse {
  success: boolean
  data: {
    application: {
      id: number
    }
  }
}

interface ApiErrorResponse {
  error?: string
  message?: string
}

const LOCATION_EXAMPLES = ['서울시 강남', '서산시 동문동', '성남시 분당구'] as const

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) {
    return {}
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const typed = payload as ApiErrorResponse
  return typed.message ?? typed.error ?? fallback
}

function toIsoDate(value: string): string | undefined {
  if (!value) {
    return undefined
  }

  return new Date(`${value}T00:00:00`).toISOString()
}

function formatPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`
}

function formatArea(area: number): string {
  return `${area.toLocaleString('ko-KR')}㎡`
}

function supportsMapContext(listing: ListingParcelFields): boolean {
  return (
    (listing.center_lat !== null && listing.center_lng !== null) ||
    listing.parcel_geojson !== null
  )
}

export default function ListingsPage() {
  const queryClient = useQueryClient()
  const authToken = localStorage.getItem(AUTH_TOKEN_KEY)

  const [location, setLocation] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'rented'>('all')
  const [activeFilters, setActiveFilters] = useState({
    location: '',
    minPrice: '',
    maxPrice: '',
    status: 'all' as 'all' | 'active' | 'inactive' | 'rented',
  })

  const [selectedListingId, setSelectedListingId] = useState<number | null>(null)
  const [applyingListingId, setApplyingListingId] = useState<number | null>(null)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | ''>('')

  const { data: meData } = useQuery<MeResponse>({
    queryKey: ['auth-me-public-aware'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    enabled: !!authToken,
    retry: false,
  })

  const { data, isLoading, error } = useQuery<ListingsResponse>({
    queryKey: ['listings', activeFilters],
    queryFn: async () => {
      const params = new URLSearchParams()

      if (activeFilters.location) {
        params.append('location', activeFilters.location)
      }
      if (activeFilters.minPrice) {
        params.append('min_price', activeFilters.minPrice)
      }
      if (activeFilters.maxPrice) {
        params.append('max_price', activeFilters.maxPrice)
      }
      if (activeFilters.status !== 'all') {
        params.append('status', activeFilters.status)
      }

      const queryString = params.toString()
      const url = `${API_BASE}/listings${queryString ? `?${queryString}` : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response.json()
    },
  })

  const applyMutation = useMutation({
    mutationFn: async (listingId: number) => {
      const response = await fetch(`${API_BASE}/applications`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listing_id: listingId,
          message: applicationMessage.trim() || undefined,
          start_date: toIsoDate(startDate),
          end_date: toIsoDate(endDate),
        }),
      })

      const payload = (await response.json()) as unknown
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, '임대 신청에 실패했습니다.'))
      }

      return payload as ApplicationSuccessResponse
    },
    onSuccess: () => {
      setFeedbackType('success')
      setFeedbackMessage('임대 신청이 접수되었습니다.')
      setApplyingListingId(null)
      setApplicationMessage('')
      setStartDate('')
      setEndDate('')
      queryClient.invalidateQueries({ queryKey: ['applications-all'] })
    },
    onError: (mutationError) => {
      setFeedbackType('error')
      setFeedbackMessage(
        mutationError instanceof Error
          ? mutationError.message
          : '임대 신청 처리 중 오류가 발생했습니다.'
      )
    },
  })

  const listings = data?.data.listings ?? []
  const mappedListings = useMemo(
    () => listings.filter((listing) => supportsMapContext(listing)),
    [listings]
  )
  const unmappedListings = useMemo(
    () => listings.filter((listing) => !supportsMapContext(listing)),
    [listings]
  )
  const hiddenFromMapCount = unmappedListings.length
  const regionBreadcrumbs = useMemo(
    () => location.split(/[\s,/]+/).map((segment) => segment.trim()).filter(Boolean),
    [location]
  )
  const currentUser = meData?.data.user

  const handleSearch = () => {
    const normalizedLocation = location.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()

    setActiveFilters({
      location: normalizedLocation,
      minPrice,
      maxPrice,
      status,
    })
  }

  const handleReset = () => {
    setLocation('')
    setMinPrice('')
    setMaxPrice('')
    setStatus('all')
    setActiveFilters({
      location: '',
      minPrice: '',
      maxPrice: '',
      status: 'all',
    })
    setSelectedListingId(null)
  }

  return (
    <div className="page listings-page">
      <section className="section-card listings-search-shell">
        <div className="listings-search-header">
          <div>
            <p className="panel-kicker">Listing Search</p>
            <h2>지도 중심으로 바로 찾는 토지 매물</h2>
            <p className="page-lead listings-search-lead">
              지역명을 자연스럽게 입력하고, 현재 지도 화면 안에 보이는 매물만 빠르게 비교하도록
              검색 흐름을 다듬었습니다.
            </p>
          </div>

          <div className="listings-search-stats" aria-label="검색 결과 요약">
            <div className="listings-search-stat-card">
              <strong>{listings.length.toLocaleString('ko-KR')}</strong>
              <span>검색 결과</span>
            </div>
            <div className="listings-search-stat-card">
              <strong>{mappedListings.length.toLocaleString('ko-KR')}</strong>
              <span>지도 표시 가능</span>
            </div>
          </div>
        </div>

        <form
          className="listings-search-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleSearch()
          }}
        >
          <div className="listings-search-primary-row">
            <div className="listings-search-primary-group">
              <label htmlFor="location" className="listings-search-label">
                지역 검색
              </label>
              <div className="listings-search-input-wrap">
                <input
                  id="location"
                  type="text"
                  placeholder="예: 서울시 강남 / 서산시 동문동"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="filter-input listings-search-input"
                  aria-describedby="location-search-hint"
                />
                <button type="submit" className="button listings-search-submit">
                  검색
                </button>
              </div>
              <p id="location-search-hint" className="listings-search-hint">
                시/군/구/동 일부만 입력해도 현재 백엔드의 부분 일치 검색으로 결과를 찾습니다.
              </p>
              <div className="listings-search-example-row" aria-label="검색 예시">
                {LOCATION_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="search-example-chip"
                    onClick={() => setLocation(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
              {regionBreadcrumbs.length > 0 && (
                <div className="listings-search-breadcrumbs" aria-label="입력한 지역 토큰">
                  {regionBreadcrumbs.map((segment) => (
                    <span key={`${segment}-${regionBreadcrumbs.indexOf(segment)}`} className="listings-search-token">
                      {segment}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="filter-panel filter-panel-flat listings-filter-panel">
            <div className="filter-row listings-filter-row">
              <div className="filter-group">
                <label htmlFor="minPrice">최소 월세</label>
                <input
                  id="minPrice"
                  type="number"
                  placeholder="예: 1000000"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="maxPrice">최대 월세</label>
                <input
                  id="maxPrice"
                  type="number"
                  placeholder="예: 2500000"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="status">상태</label>
                <select
                  id="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as 'all' | 'active' | 'inactive' | 'rented')
                  }
                  className="filter-input"
                >
                  <option value="all">전체</option>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                  <option value="rented">임대됨</option>
                </select>
              </div>
            </div>

            <div className="filter-actions listings-filter-actions">
              <button type="submit" className="button button-secondary listings-filter-ghost">
                조건 적용
              </button>
              <button type="button" onClick={handleReset} className="button button-secondary">
                초기화
              </button>
            </div>
          </div>
        </form>

        <div className="listings-map-note">
          현재 지도 화면 안에 들어온 매물만 오른쪽 비교 목록에 표시됩니다.
        </div>
      </section>

      {feedbackMessage && (
        <div className={feedbackType === 'error' ? 'auth-error' : 'auth-success'}>
          {feedbackMessage}
        </div>
      )}

      {isLoading && (
        <div className="state-message">
          <p>매물과 지도를 불러오는 중입니다...</p>
        </div>
      )}

      {error && (
        <div className="state-message error-message">
          <p>매물 조회 중 오류가 발생했습니다: {error.message}</p>
        </div>
      )}

      {!isLoading && !error && listings.length === 0 && (
        <div className="state-message">
          <p>조건에 맞는 매물이 없습니다.</p>
        </div>
      )}

      {!isLoading && !error && (
        <ListingsMapPanel
          listings={mappedListings}
          selectedListingId={selectedListingId}
          onSelectListing={setSelectedListingId}
          heading="현재 화면 안의 매물을 바로 비교하세요"
          description="점 마커를 기준으로 선택하고, 필요한 경우 선택한 매물의 필지 경계를 옅게 겹쳐 보며 판단할 수 있습니다."
          railTitle="현재 화면 매물"
          renderSelectedActions={(listing) => {
            const isOwner = currentUser?.id === listing.owner_id
            const canApply = !!authToken && !isOwner && listing.status === 'active'
            const isApplying = applyingListingId === listing.id

            return (
              <div className="selected-action-stack">
                <div className="listing-card-actions">
                  {isOwner ? (
                    <Link to="/my-listings" className="button button-secondary">
                      내 매물 관리
                    </Link>
                  ) : !authToken ? (
                    <>
                      <Link to="/login?redirect=/listings" className="button">
                        로그인 후 신청
                      </Link>
                      <Link to="/register?redirect=/listings" className="button button-secondary">
                        회원가입
                      </Link>
                    </>
                  ) : canApply ? (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        setFeedbackMessage('')
                        setFeedbackType('')
                        setApplyingListingId(isApplying ? null : listing.id)
                      }}
                    >
                      {isApplying ? '신청 폼 닫기' : '이 토지 임대 신청'}
                    </button>
                  ) : (
                    <span className="owner-badge owner-badge-muted">
                      {listing.status === 'active'
                        ? '소유자 본인 매물'
                        : '현재 신청할 수 없는 매물'}
                    </span>
                  )}
                </div>

                {isApplying && (
                  <form
                    className="inline-form selected-application-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      applyMutation.mutate(listing.id)
                    }}
                  >
                    <label htmlFor={`message-${listing.id}`}>메시지</label>
                    <textarea
                      id={`message-${listing.id}`}
                      className="message-input"
                      value={applicationMessage}
                      onChange={(event) => setApplicationMessage(event.target.value)}
                      placeholder="임대 목적이나 간단한 자기소개를 남겨주세요."
                      rows={3}
                    />

                    <div className="inline-form-grid">
                      <div>
                        <label htmlFor={`start-${listing.id}`}>희망 시작일</label>
                        <input
                          id={`start-${listing.id}`}
                          type="date"
                          value={startDate}
                          onChange={(event) => setStartDate(event.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor={`end-${listing.id}`}>희망 종료일</label>
                        <input
                          id={`end-${listing.id}`}
                          type="date"
                          value={endDate}
                          onChange={(event) => setEndDate(event.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="button"
                      disabled={applyMutation.isPending}
                    >
                      {applyMutation.isPending ? '신청 중...' : '신청 보내기'}
                    </button>
                  </form>
                )}
              </div>
            )
          }}
        />
      )}

      {!isLoading && !error && hiddenFromMapCount > 0 && (
        <div className="state-message listings-map-note-card">
          <p>
            좌표 또는 필지 정보가 없는 매물 {hiddenFromMapCount}개는 지도 중심 결과에서 제외되었습니다.
          </p>
        </div>
      )}

      {!authToken && (
        <div className="state-message listings-login-note-card">
          <p>지금은 매물 조회만 가능합니다. 임대 신청은 로그인 후 진행할 수 있습니다.</p>
          <div className="auth-inline-actions">
            <Link to="/login?redirect=/listings" className="button">
              로그인
            </Link>
            <Link to="/register?redirect=/listings" className="button button-secondary">
              회원가입
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
