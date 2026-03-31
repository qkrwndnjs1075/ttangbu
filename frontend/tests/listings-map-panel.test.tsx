import React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToString } from 'react-dom/server'
import ListingsMapPanel from '../src/components/ListingsMapPanel'

test('ListingsMapPanel renders selected land details and injected actions', () => {
  const html = renderToString(
    <ListingsMapPanel
      listings={[
        {
          id: 45,
          title: '브라우저 지도 저장 테스트',
          description: '자동 선택된 필지를 저장해 지도 반영을 확인하는 테스트 매물',
          location: '경기도 성남시 분당구 삼평동 624',
          area_sqm: 120.5,
          price_per_month: 1500000,
          status: 'active',
          owner_id: 4,
          created_at: '2026-03-11T06:55:12.000Z',
          updated_at: '2026-03-11T06:55:12.000Z',
          parcel_pnu: '4113510900106240000',
          center_lat: 37.402104,
          center_lng: 127.100164,
          parcel_geojson: {
            type: 'Polygon',
            coordinates: [
              [
                [127.1, 37.402],
                [127.101, 37.402],
                [127.101, 37.403],
                [127.1, 37.403],
                [127.1, 37.402],
              ],
            ],
          },
        },
      ]}
      renderSelectedActions={() => <button type="button">신청하기</button>}
    />
  )

  assert.match(html, /브라우저 지도 저장 테스트/)
  assert.match(html, /경기도 성남시 분당구 삼평동 624/)
  assert.match(html, /4113510900106240000/)
  assert.match(html, /신청하기/)
})
