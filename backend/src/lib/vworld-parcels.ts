export interface VworldParcelFeatureProperties {
  pnu?: string
  PNU?: string
  [key: string]: unknown
}

export interface VworldParcelFeature {
  properties?: VworldParcelFeatureProperties
  geometry?: unknown
}

export interface VworldParcelPayload {
  features?: VworldParcelFeature[]
}

function getParcelIdentifier(feature: VworldParcelFeature, fallbackIndex: number): string {
  const pnu = feature.properties?.pnu ?? feature.properties?.PNU
  if (typeof pnu === 'string' && pnu.length > 0) {
    return pnu
  }

  return `feature-${fallbackIndex}`
}

export function mergeParcelFeatures(payloads: VworldParcelPayload[]): VworldParcelFeature[] {
  const merged = new Map<string, VworldParcelFeature>()
  let fallbackIndex = 0

  for (const payload of payloads) {
    for (const feature of payload.features ?? []) {
      if (!feature.geometry) {
        fallbackIndex += 1
        continue
      }

      const identifier = getParcelIdentifier(feature, fallbackIndex)
      fallbackIndex += 1

      if (!merged.has(identifier)) {
        const pnu = feature.properties?.pnu ?? feature.properties?.PNU
        merged.set(identifier, {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            ...(typeof pnu === 'string' && pnu.length > 0 ? { pnu } : {}),
          },
        })
      }
    }
  }

  return [...merged.values()]
}
