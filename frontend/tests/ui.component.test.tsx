import React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../src/pages/NotFoundPage'
import StatusBadge, { getStatusLabel } from '../src/components/StatusBadge'

test('StatusBadge renders localized status label and CSS class', () => {
  const html = renderToString(<StatusBadge status="approved" />)
  assert.match(html, /status-approved/)
  assert.match(html, /승인됨/)
})

test('getStatusLabel returns default label for null status', () => {
  assert.equal(getStatusLabel(null), '신규')
})

test('NotFoundPage renders 404 copy and home link', () => {
  const html = renderToString(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>
  )

  assert.match(html, /404 - 페이지를 찾을 수 없습니다/)
  assert.match(html, /홈으로 돌아가기/)
})
