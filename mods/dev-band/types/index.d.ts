export type DevBandContext = { percent: number; tokens?: number; window: number }

export type DevBandAgent = { id: string; description: string }

export type DevBandCostEntry = { delta: number; at: number }

export type DevBandCost = {
  usd: number | null
  previousUsd: number | null
  history?: DevBandCostEntry[]
}

export type DevBandCacheTtl = '5m' | '1h'

export type DevBandCacheTtlSource = 'default' | 'seen' | 'resume' | 'engine'

export type DevBandCache = {
  sentAt: number | null
  inFlightSince: number | null
  isCold: boolean
  ttl: DevBandCacheTtl
  ttlSource: DevBandCacheTtlSource
  model: string | null
  promptTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'dev-band': {
      cache: Shaped<DevBandCache>
      cost: Shaped<DevBandCost>
      context: DevBandContext | null
      agents: DevBandAgent[]
    }
  }
}
