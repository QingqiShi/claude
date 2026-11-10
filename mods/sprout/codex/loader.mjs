// The hooks of the mod are written for Claude Code's engine: they import each other without a suffix and import
// `claude-code` for their state. This lets Node load them as they are, with engine.ts in the place of the engine.
import { registerHooks } from 'node:module'

const engine = new URL('./engine.ts', import.meta.url).href

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'claude-code') return next(engine, context)
    try {
      return next(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.')) throw error
      return next(`${specifier}.ts`, context)
    }
  },
})
