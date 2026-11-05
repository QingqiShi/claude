export type DevBandContext = { percent: number; tokens?: number; window: number }

export type DevBandAgent = { id: string; description: string }

export type DevBandCostEntry = { delta: number; at: number }

export type DevBandCost = {
  usd: number | null
  previousUsd: number | null
  history?: DevBandCostEntry[]
}

declare module 'claude-code' {
  interface PluginState {
    'dev-band': {
      cost: Shaped<DevBandCost>
      context: DevBandContext | null
      agents: DevBandAgent[]
    }
  }
}
