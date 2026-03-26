export interface LeafletClickableLayer {
  on: (event: 'click', handler: () => void) => void
}

export interface LeafletInteractiveLayer extends LeafletLayer {
  addTo: (map: LeafletMap) => LeafletInteractiveLayer
  on: (event: 'click', handler: () => void) => void
  bindPopup: (
    content: string,
    options?: { closeButton?: boolean }
  ) => LeafletInteractiveLayer
  openPopup: () => void
}

export interface LeafletLayer {
  addTo: (map: LeafletMap) => LeafletLayer
  remove: () => void
  getBounds?: () => unknown
  eachLayer?: (callback: (layer: LeafletClickableLayer) => void) => void
}

export interface LeafletBounds {
  getSouth: () => number
  getWest: () => number
  getNorth: () => number
  getEast: () => number
}

export interface LeafletMap {
  setView: (coords: [number, number], zoom: number) => LeafletMap
  panTo: (
    coords: [number, number],
    options?: { animate?: boolean; duration?: number }
  ) => LeafletMap
  on: (
    event: 'click' | 'moveend',
    handler: (event?: { latlng: { lat: number; lng: number } }) => void
  ) => void
  fitBounds: (bounds: unknown, options?: { padding: [number, number] }) => void
  getBounds: () => LeafletBounds
  remove: () => void
}

interface LeafletGeoJsonOptions {
  style: Record<string, string | number>
  onEachFeature?: (feature: unknown, layer: LeafletClickableLayer) => void
}

export interface LeafletGlobal {
  map: (element: HTMLElement) => LeafletMap
  tileLayer: (
    url: string,
    options: { maxZoom: number; attribution: string }
  ) => { addTo: (map: LeafletMap) => void }
  geoJSON: (data: unknown, options: LeafletGeoJsonOptions) => LeafletLayer
  circleMarker: (
    coords: [number, number],
    options: Record<string, string | number | boolean>
  ) => LeafletInteractiveLayer
  latLngBounds: (coords: [number, number][]) => unknown
}

declare global {
  interface Window {
    L?: LeafletGlobal
  }
}

let leafletPromise: Promise<LeafletGlobal> | null = null

function appendStylesheetOnce(id: string, href: string): void {
  if (document.getElementById(id)) {
    return
  }

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

export async function loadLeaflet(): Promise<LeafletGlobal> {
  if (window.L) {
    return window.L
  }

  if (leafletPromise) {
    return leafletPromise
  }

  leafletPromise = new Promise<LeafletGlobal>((resolve, reject) => {
    appendStylesheetOnce(
      'leaflet-stylesheet',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    )

    const existing = document.getElementById('leaflet-script') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.L) {
          resolve(window.L)
        } else {
          reject(new Error('Leaflet loaded without window.L'))
        }
      })
      existing.addEventListener('error', () => reject(new Error('Failed to load Leaflet script')))
      return
    }

    const script = document.createElement('script')
    script.id = 'leaflet-script'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => {
      if (window.L) {
        resolve(window.L)
      } else {
        reject(new Error('Leaflet loaded without window.L'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load Leaflet script'))
    document.body.appendChild(script)
  })

  return leafletPromise
}
