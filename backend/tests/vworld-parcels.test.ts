import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeParcelFeatures } from '../src/lib/vworld-parcels'

test('mergeParcelFeatures deduplicates by PNU and drops features without geometry', () => {
  const features = mergeParcelFeatures([
    {
      features: [
        {
          properties: { pnu: '111' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [127.1, 37.1],
                [127.2, 37.1],
                [127.2, 37.2],
                [127.1, 37.1],
              ],
            ],
          },
        },
        {
          properties: { pnu: 'missing-geometry' },
        },
      ],
    },
    {
      features: [
        {
          properties: { PNU: '111' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [127.3, 37.3],
                [127.4, 37.3],
                [127.4, 37.4],
                [127.3, 37.3],
              ],
            ],
          },
        },
        {
          properties: { pnu: '222' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [128.1, 38.1],
                [128.2, 38.1],
                [128.2, 38.2],
                [128.1, 38.1],
              ],
            ],
          },
        },
      ],
    },
  ])

  assert.equal(features.length, 2)
  assert.equal(features[0]?.properties?.pnu, '111')
  assert.equal(features[1]?.properties?.pnu, '222')
})
