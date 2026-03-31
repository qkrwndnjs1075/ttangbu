/**
 * 대한민국 전국 행정경계 GeoJSON 데이터
 * 출처: southkorea/southkorea-maps (공개 GitHub)
 */

// 시/도 경계 (광역시·도 17개)
export const KOREA_PROVINCES_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2012/json/skorea-provinces-2012-geo.json'

// 시/군/구 경계 (전국 시·군·구)
export const KOREA_MUNICIPALITIES_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2012/json/skorea-municipalities-2012-geo.json'

export type RegionLevel = 'province' | 'municipality' | 'listing'

/** 줌 레벨에 따른 표시 단계 결정 */
export function getRegionLevel(zoom: number, hasSelectedRegion: boolean): RegionLevel {
  if (zoom >= 11 || hasSelectedRegion) return 'listing'
  if (zoom >= 8) return 'municipality'
  return 'province'
}

/** GeoJSON feature 에서 지역명 추출 (다양한 속성명 대응) */
export function extractRegionName(properties: Record<string, unknown>): string {
  return (
    (properties['name'] as string) ??
    (properties['NAME'] as string) ??
    (properties['CTP_KOR_NM'] as string) ??
    (properties['SIG_KOR_NM'] as string) ??
    (properties['EMD_KOR_NM'] as string) ??
    '알 수 없음'
  )
}

/** GeoJSON feature 에서 지역 코드 추출 */
export function extractRegionCode(properties: Record<string, unknown>): string {
  return (
    (properties['code'] as string) ??
    (properties['CTPRVN_CD'] as string) ??
    (properties['SIG_CD'] as string) ??
    ''
  )
}
