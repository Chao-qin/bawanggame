const PHASES = new Set(['starting', 'ready', 'failed'])

export function createRuntimeBackGate(initialSignal = 0) {
  let lastSignal = initialSignal
  let phase = 'starting'
  return {
    setPhase(nextPhase) {
      phase = PHASES.has(nextPhase) ? nextPhase : 'starting'
    },
    observe(signal) {
      const changed = signal !== lastSignal
      lastSignal = signal
      return changed && phase !== 'starting'
    },
    canRequest() {
      return phase !== 'starting'
    },
    reset(signal = 0) {
      lastSignal = signal
      phase = 'starting'
    },
  }
}
