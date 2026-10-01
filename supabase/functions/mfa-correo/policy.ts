export const TRUST_DAYS = 5
export const LOGIN_HOURS = 24

export function loginExpiresAt(claims: Record<string, unknown>, fallback: string | undefined): number {
  const methods = Array.isArray(claims.amr) ? claims.amr : []
  const times = methods.filter((entry) => entry && entry.method !== 'token_refresh')
    .map((entry) => Number(entry.timestamp)).filter((time) => Number.isFinite(time) && time > 0)
  const started = times.length ? Math.max(...times) * 1000 : Date.parse(fallback || '')
  return Number.isFinite(started) ? started + LOGIN_HOURS * 3600000 : 0
}

export function loginExpired(claims: Record<string, unknown>, fallback: string | undefined, now: number): boolean {
  return now >= loginExpiresAt(claims, fallback)
}

export function deviceTrusted(device: { ultimo_acceso: string; ultimo_ip_hash: string | null } | null,
  ipHash: string, now: number): boolean {
  return !!device && !!ipHash && device.ultimo_ip_hash === ipHash &&
    Number.isFinite(Date.parse(device.ultimo_acceso)) &&
    now - Date.parse(device.ultimo_acceso) < TRUST_DAYS * 86400000
}
