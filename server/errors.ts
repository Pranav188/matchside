export class AppError extends Error {
  constructor(public code: string, message: string, public status = 503, public retryAfterSeconds?: number) { super(message); }
}
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const seconds = /^\d+$/.test(raw) ? Number(raw) : /^[A-Za-z]/.test(raw) ? Math.ceil((Date.parse(raw) - now) / 1000) : NaN;
  return Number.isFinite(seconds) ? Math.max(0, Math.min(3600, Math.ceil(seconds))) : undefined;
}
export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && 'code' in error && 'status' in error) {
    const e = error as Error & { code: string; status: number; retryAfterSeconds?: number };
    if (typeof e.code === 'string' && typeof e.status === 'number') return new AppError(e.code, e.message, e.status, e.retryAfterSeconds);
  }
  return new AppError('SERVICE_UNAVAILABLE', 'This service is temporarily unavailable. Please try again.');
}
