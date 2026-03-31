import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ListingsMapPanel from '../components/ListingsMapPanel'
import ParcelMapPicker from '../components/ParcelMapPicker'
import StatusBadge from '../components/StatusBadge'
import type { ListingParcelFields, ParcelSelection } from '../types/parcel'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const AUTH_TOKEN_KEY = 'ttangbu_auth_token'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) {
    return {}
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

interface User {
  id: number
  email: string
  name: string
}

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
}

interface Application {
  id: number
  listing_id: number
  applicant_id: number
  status: string
  message: string | null
  created_at: string
  listing_title: string
  applicant_name: string
  applicant_email: string
}

interface MeResponse {
  success: boolean
  data: {
    user: User
  }
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

interface ApplicationsResponse {
  success: boolean
  data: {
    applications: Application[]
  }
}

interface ApiErrorResponse {
  error?: string
  message?: string
}

interface ListingFormState {
  title: string
  description: string
  location: string
  area_sqm: string
  price_per_month: string
  parcelSelection: ParcelSelection | null
}

type EditableListing = ListingParcelFields & {
  id: number
  title: string
  description: string
  location: string
  area_sqm: number
  price_per_month: number
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const typed = payload as ApiErrorResponse
  return typed.message ?? typed.error ?? fallback
}

function emptyListingForm(): ListingFormState {
  return {
    title: '',
    description: '',
    location: '',
    area_sqm: '',
    price_per_month: '',
    parcelSelection: null,
  }
}

function formatPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`
}

function formatArea(area: number): string {
  return `${area.toLocaleString('ko-KR')}㎡`
}

function toParcelSelection(listing: EditableListing): ParcelSelection | null {
  if (
    !listing.parcel_pnu ||
    !listing.parcel_geojson ||
    listing.center_lat === null ||
    listing.center_lng === null
  ) {
    return null
  }

  return {
    parcelPnu: listing.parcel_pnu,
    parcelGeoJson: listing.parcel_geojson,
    centerLat: listing.center_lat,
    centerLng: listing.center_lng,
    jibun: listing.location,
    areaSqm: listing.area_sqm,
  }
}

function toFormState(listing: EditableListing): ListingFormState {
  return {
    title: listing.title,
    description: listing.description,
    location: listing.location,
    area_sqm: String(listing.area_sqm),
    price_per_month: String(listing.price_per_month),
    parcelSelection: toParcelSelection(listing),
  }
}

function invalidateListingQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['listings-all'] })
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) && query.queryKey[0] === 'listings',
  })
}

export default function MyListingsPage() {
  const queryClient = useQueryClient()
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | ''>('')
  const [createForm, setCreateForm] = useState<ListingFormState>(emptyListingForm())
  const [editingListingId, setEditingListingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<ListingFormState>(emptyListingForm())
  const [selectedOwnedListingId, setSelectedOwnedListingId] = useState<number | null>(null)

  const { data: meData, isLoading: meLoading, error: meError } = useQuery<MeResponse>({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response.json()
    },
    retry: false,
  })

  const { data: listingsData, isLoading: listingsLoading } = useQuery<ListingsResponse>({
    queryKey: ['listings-all'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/listings`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.json()
    },
    enabled: !!meData,
  })

  const { data: applicationsData, isLoading: applicationsLoading } =
    useQuery<ApplicationsResponse>({
      queryKey: ['applications-all'],
      queryFn: async () => {
        const response = await fetch(`${API_BASE}/applications`, {
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        return response.json()
      },
      enabled: !!meData,
    })

  const createListingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/listings`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: createForm.title,
          description: createForm.description,
          location: createForm.location,
          area_sqm: Number(createForm.area_sqm),
          price_per_month: Number(createForm.price_per_month),
          parcel_pnu: createForm.parcelSelection?.parcelPnu ?? null,
          center_lat: createForm.parcelSelection?.centerLat ?? null,
          center_lng: createForm.parcelSelection?.centerLng ?? null,
          parcel_geojson: createForm.parcelSelection?.parcelGeoJson ?? null,
        }),
      })

      const payload = (await response.json()) as unknown
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, '내 토지 매물 등록에 실패했습니다.'))
      }
    },
    onSuccess: () => {
      setCreateForm(emptyListingForm())
      setFeedbackType('success')
      setFeedbackMessage('내 토지를 매물로 등록했습니다.')
      invalidateListingQueries(queryClient)
    },
    onError: (mutationError) => {
      setFeedbackType('error')
      setFeedbackMessage(
        mutationError instanceof Error
          ? mutationError.message
          : '매물 등록 중 오류가 발생했습니다.'
      )
    },
  })

  const updateListingMutation = useMutation({
    mutationFn: async (listingId: number) => {
      const response = await fetch(`${API_BASE}/listings/${listingId}`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          location: editForm.location,
          area_sqm: Number(editForm.area_sqm),
          price_per_month: Number(editForm.price_per_month),
          parcel_pnu: editForm.parcelSelection?.parcelPnu ?? null,
          center_lat: editForm.parcelSelection?.centerLat ?? null,
          center_lng: editForm.parcelSelection?.centerLng ?? null,
          parcel_geojson: editForm.parcelSelection?.parcelGeoJson ?? null,
        }),
      })

      const payload = (await response.json()) as unknown
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, '매물 수정에 실패했습니다.'))
      }
    },
    onSuccess: () => {
      setEditingListingId(null)
      setEditForm(emptyListingForm())
      setFeedbackType('success')
      setFeedbackMessage('매물 정보를 수정했습니다.')
      invalidateListingQueries(queryClient)
    },
    onError: (mutationError) => {
      setFeedbackType('error')
      setFeedbackMessage(
        mutationError instanceof Error
          ? mutationError.message
          : '매물 수정 중 오류가 발생했습니다.'
      )
    },
  })

  const deactivateListingMutation = useMutation({
    mutationFn: async (listingId: number) => {
      const response = await fetch(`${API_BASE}/listings/${listingId}/deactivate`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      })

      const payload = (await response.json()) as unknown
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, '매물 비활성화에 실패했습니다.'))
      }
    },
    onSuccess: () => {
      setFeedbackType('success')
      setFeedbackMessage('매물을 비활성화했습니다.')
      invalidateListingQueries(queryClient)
    },
    onError: (mutationError) => {
      setFeedbackType('error')
      setFeedbackMessage(
        mutationError instanceof Error
          ? mutationError.message
          : '매물 비활성화 중 오류가 발생했습니다.'
      )
    },
  })

  if (meError) {
    return (
      <div className="page">
        <h2>내 매물</h2>
        <div className="state-message error-message">
          <p>로그인이 필요합니다. 내 토지를 매물에 올리려면 먼저 로그인해 주세요.</p>
          <Link
            to="/login?redirect=/my-listings"
            className="button"
            style={{ marginTop: '0.75rem' }}
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    )
  }

  if (meLoading) {
    return (
      <div className="page">
        <h2>내 매물</h2>
        <div className="state-message">
          <p>내 토지와 매물 정보를 불러오는 중입니다...</p>
        </div>
      </div>
    )
  }

  const currentUser = meData?.data.user
  const myListings =
    listingsData?.data.listings.filter((listing) => listing.owner_id === currentUser?.id) ?? []
  const myListingsWithGeometry = myListings.filter((listing) => listing.parcel_geojson)
  const myListingIds = new Set(myListings.map((listing) => listing.id))
  const applicationsForMyListings =
    applicationsData?.data.applications.filter((application) =>
      myListingIds.has(application.listing_id)
    ) ?? []
  const isLoading = listingsLoading || applicationsLoading

  const beginEditing = (listing: EditableListing) => {
    setEditingListingId(listing.id)
    setEditForm(toFormState(listing))
  }

  const cancelEditing = () => {
    setEditingListingId(null)
    setEditForm(emptyListingForm())
  }

  return (
    <div className="page">
      <h2>내 매물</h2>
      <p className="page-lead">
        내 토지의 경계를 선택하고, 토지 크기와 가격 정보를 확인한 뒤 바로 매물로
        등록할 수 있는 흐름으로 구성했습니다.
      </p>

      {feedbackMessage && (
        <div className={feedbackType === 'error' ? 'auth-error' : 'auth-success'}>
          {feedbackMessage}
        </div>
      )}

      <section className="section-card owner-flow-card">
        <div className="owner-flow-header">
          <div>
            <p className="panel-kicker">Owner Workflow</p>
            <h3>내 토지를 매물에 올리기</h3>
            <p className="section-description">
              토지 경계를 먼저 선택한 뒤, 제목·설명·가격을 입력해 매물로 올리세요.
            </p>
          </div>
          <div className="owner-flow-steps">
            <span>1. 필지 선택</span>
            <span>2. 매물 정보 입력</span>
            <span>3. 등록 완료</span>
          </div>
        </div>

        <form
          className="inline-form owner-create-form"
          onSubmit={(event) => {
            event.preventDefault()
            createListingMutation.mutate()
          }}
        >
          <ParcelMapPicker
            value={createForm.parcelSelection}
            onChange={(selection) => {
              setCreateForm((current) => ({
                ...current,
                parcelSelection: selection,
                location: selection?.jibun ?? current.location,
                area_sqm:
                  selection?.areaSqm !== undefined
                    ? String(selection.areaSqm)
                    : current.area_sqm,
              }))
            }}
          />

          <div className="owner-form-fields">
            <div className="inline-form-grid">
              <div>
                <label htmlFor="create-title">매물 제목</label>
                <input
                  id="create-title"
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="예: 판교 IC 인근 평탄지"
                  required
                />
              </div>
              <div>
                <label htmlFor="create-location">지번 주소</label>
                <input
                  id="create-location"
                  value={createForm.location}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <label htmlFor="create-description">설명</label>
            <textarea
              id="create-description"
              className="message-input"
              rows={4}
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="도로 접근성, 용도, 장점 같은 토지 정보를 적어주세요."
              required
            />

            <div className="inline-form-grid">
              <div>
                <label htmlFor="create-area">토지 크기(㎡)</label>
                <input
                  id="create-area"
                  type="number"
                  min="1"
                  step="0.01"
                  value={createForm.area_sqm}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      area_sqm: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <label htmlFor="create-price">월세</label>
                <input
                  id="create-price"
                  type="number"
                  min="0"
                  step="1"
                  value={createForm.price_per_month}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      price_per_month: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="button"
              disabled={createListingMutation.isPending}
            >
              {createListingMutation.isPending ? '등록 중...' : '내 토지 매물 등록'}
            </button>
          </div>
        </form>
      </section>

      {isLoading && (
        <div className="state-message">
          <p>내 매물과 신청 내역을 불러오는 중입니다...</p>
        </div>
      )}

      {!isLoading && myListingsWithGeometry.length > 0 && (
        <ListingsMapPanel
          listings={myListingsWithGeometry}
          selectedListingId={selectedOwnedListingId}
          onSelectListing={setSelectedOwnedListingId}
          heading="등록한 토지 경계 보기"
          description="올려둔 토지 매물의 경계와 토지 정보를 한 화면에서 확인할 수 있습니다."
          railTitle="내가 등록한 토지"
          renderSelectedActions={(listing) => (
            <div className="listing-card-actions">
              <button
                type="button"
                className="button"
                onClick={() => beginEditing(listing)}
              >
                이 매물 수정
              </button>
              {listing.status !== 'inactive' && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => deactivateListingMutation.mutate(listing.id)}
                  disabled={deactivateListingMutation.isPending}
                >
                  비활성화
                </button>
              )}
            </div>
          )}
        />
      )}

      {!isLoading && (
        <>
          <section className="section-card">
            <h3>내가 등록한 매물</h3>
            <p className="section-description">
              매물 정보와 저장된 토지 경계를 필요할 때 바로 수정할 수 있습니다.
            </p>

            {myListings.length === 0 ? (
              <div className="state-message">
                <p>아직 등록한 매물이 없습니다.</p>
              </div>
            ) : (
              <div className="listings-grid">
                {myListings.map((listing) => {
                  const isEditing = editingListingId === listing.id

                  return (
                    <div key={listing.id} className="listing-card">
                      <div className="listing-header">
                        <h3>{listing.title}</h3>
                        <StatusBadge status={listing.status} />
                      </div>

                      <div className="listing-body">
                        <div className="listing-field">
                          <span className="field-label">지번 주소</span>
                          <span className="field-value">{listing.location}</span>
                        </div>
                        <div className="listing-field">
                          <span className="field-label">토지 크기</span>
                          <span className="field-value">{formatArea(listing.area_sqm)}</span>
                        </div>
                        <div className="listing-field">
                          <span className="field-label">월세</span>
                          <span className="field-value price">
                            {formatPrice(listing.price_per_month)}
                          </span>
                        </div>
                        <p className="listing-description">{listing.description}</p>
                      </div>

                      <div className="listing-footer listing-footer-column">
                        <span className="listing-id">ID: {listing.id}</span>
                        <div className="listing-card-actions">
                          <button
                            type="button"
                            className="button"
                            onClick={() =>
                              isEditing ? cancelEditing() : beginEditing(listing)
                            }
                          >
                            {isEditing ? '수정 취소' : '매물 수정'}
                          </button>

                          {listing.status !== 'inactive' && (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => deactivateListingMutation.mutate(listing.id)}
                              disabled={deactivateListingMutation.isPending}
                            >
                              비활성화
                            </button>
                          )}
                        </div>

                        {isEditing && (
                          <form
                            className="inline-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              updateListingMutation.mutate(listing.id)
                            }}
                          >
                            <label htmlFor={`edit-title-${listing.id}`}>매물 제목</label>
                            <input
                              id={`edit-title-${listing.id}`}
                              value={editForm.title}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              required
                            />

                            <label htmlFor={`edit-description-${listing.id}`}>설명</label>
                            <textarea
                              id={`edit-description-${listing.id}`}
                              className="message-input"
                              rows={4}
                              value={editForm.description}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              required
                            />

                            <div className="inline-form-grid">
                              <div>
                                <label htmlFor={`edit-location-${listing.id}`}>지번 주소</label>
                                <input
                                  id={`edit-location-${listing.id}`}
                                  value={editForm.location}
                                  onChange={(event) =>
                                    setEditForm((current) => ({
                                      ...current,
                                      location: event.target.value,
                                    }))
                                  }
                                  required
                                />
                              </div>
                              <div>
                                <label htmlFor={`edit-area-${listing.id}`}>토지 크기(㎡)</label>
                                <input
                                  id={`edit-area-${listing.id}`}
                                  type="number"
                                  min="1"
                                  step="0.01"
                                  value={editForm.area_sqm}
                                  onChange={(event) =>
                                    setEditForm((current) => ({
                                      ...current,
                                      area_sqm: event.target.value,
                                    }))
                                  }
                                  required
                                />
                              </div>
                              <div>
                                <label htmlFor={`edit-price-${listing.id}`}>월세</label>
                                <input
                                  id={`edit-price-${listing.id}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editForm.price_per_month}
                                  onChange={(event) =>
                                    setEditForm((current) => ({
                                      ...current,
                                      price_per_month: event.target.value,
                                    }))
                                  }
                                  required
                                />
                              </div>
                            </div>

                            <ParcelMapPicker
                              value={editForm.parcelSelection}
                              onChange={(selection) => {
                                setEditForm((current) => ({
                                  ...current,
                                  parcelSelection: selection,
                                  location: selection?.jibun ?? current.location,
                                  area_sqm:
                                    selection?.areaSqm !== undefined
                                      ? String(selection.areaSqm)
                                      : current.area_sqm,
                                }))
                              }}
                            />

                            <button
                              type="submit"
                              className="button"
                              disabled={updateListingMutation.isPending}
                            >
                              {updateListingMutation.isPending ? '저장 중...' : '변경 저장'}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="section-card">
            <h3>내 매물에 대한 신청</h3>
            <p className="section-description">
              내 토지 매물에 들어온 신청은 여기서 확인하고 상세 상태 관리로 이동할 수
              있습니다.
            </p>

            {applicationsForMyListings.length === 0 ? (
              <div className="state-message">
                <p>접수된 신청이 없습니다.</p>
              </div>
            ) : (
              <div className="application-list">
                {applicationsForMyListings.map((application) => (
                  <div key={application.id} className="application-card">
                    <div className="application-header">
                      <div>
                        <h4>{application.listing_title}</h4>
                        <p className="application-meta">
                          신청자: {application.applicant_name} ({application.applicant_email})
                        </p>
                      </div>
                      <StatusBadge status={application.status} />
                    </div>

                    {application.message && (
                      <div className="application-body">
                        <p className="application-message">
                          메시지: {application.message}
                        </p>
                      </div>
                    )}

                    <div className="application-footer application-footer-wrap">
                      <span className="application-id">신청 ID: {application.id}</span>
                      <span className="application-date">
                        신청일: {new Date(application.created_at).toLocaleDateString('ko-KR')}
                      </span>
                      <Link to={`/my-applications/${application.id}`} className="timeline-link">
                        상세 보기 / 상태 관리 →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
