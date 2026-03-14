/**
 * In-memory circuit breaker for AI provider calls.
 *
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery)
 *
 * When OPEN, calls fail immediately without hitting the provider.
 * After cooldown, transitions to HALF_OPEN and allows one test call.
 * If test succeeds -> CLOSED. If test fails -> OPEN again.
 */

interface CircuitState {
  status: "closed" | "open" | "half_open";
  failures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number; // failures before opening (default: 5)
  cooldownMs: number; // ms before trying again (default: 30000)
  windowMs: number; // failure counting window (default: 60000)
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  windowMs: 60_000,
};

// Per-provider circuit state (in-memory, resets on redeploy)
const circuits = new Map<string, CircuitState>();

function getState(provider: string): CircuitState {
  if (!circuits.has(provider)) {
    circuits.set(provider, {
      status: "closed",
      failures: 0,
      lastFailureAt: 0,
      lastSuccessAt: 0,
    });
  }
  return circuits.get(provider)!;
}

export class CircuitOpenError extends Error {
  constructor(public readonly provider: string) {
    super(`Circuit breaker OPEN for provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Check if a provider call should be allowed.
 * Throws CircuitOpenError if the circuit is open.
 */
export function checkCircuit(
  provider: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getState(provider);
  const now = Date.now();

  if (state.status === "closed") return;

  if (state.status === "open") {
    // Check if cooldown has elapsed
    if (now - state.lastFailureAt >= cfg.cooldownMs) {
      state.status = "half_open";
      return; // Allow one test call
    }
    throw new CircuitOpenError(provider);
  }

  // half_open -- allow the test call
}

/**
 * Record a successful call. Resets the circuit to closed.
 */
export function recordSuccess(provider: string): void {
  const state = getState(provider);
  state.status = "closed";
  state.failures = 0;
  state.lastSuccessAt = Date.now();
}

/**
 * Record a failed call. May trip the circuit to open.
 */
export function recordFailure(
  provider: string,
  config: Partial<CircuitBreakerConfig> = {}
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getState(provider);
  const now = Date.now();

  // Reset failure count if outside the window
  if (now - state.lastFailureAt > cfg.windowMs) {
    state.failures = 0;
  }

  state.failures++;
  state.lastFailureAt = now;

  if (state.status === "half_open") {
    // Test call failed -- back to open
    state.status = "open";
  } else if (state.failures >= cfg.failureThreshold) {
    state.status = "open";
    console.error(
      JSON.stringify({
        level: "error",
        action: "circuit_breaker_opened",
        provider,
        failures: state.failures,
        ts: new Date().toISOString(),
      })
    );
  }
}

/** Get circuit status for monitoring. */
export function getCircuitStatus(
  provider: string
): { status: string; failures: number } {
  const state = getState(provider);
  return { status: state.status, failures: state.failures };
}

/** Reset all circuits (for testing). */
export function resetAllCircuits(): void {
  circuits.clear();
}
