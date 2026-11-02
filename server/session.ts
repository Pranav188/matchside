import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const NAME = 'matchside_session';
function signature(payload: string, secret: string) { return createHmac('sha256', secret).update(payload).digest('base64url'); }
export function sessionFromCookie(cookie: string | null, secret: string, now = Date.now()): { id: string; setCookie?: string } {
  if (secret.length < 32) throw new Error('Session secret is not configured');
  const value = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(NAME + '='))?.slice(NAME.length + 1);
  if (value) {
    const [id, issued, signed, ...extra] = value.split('.');
    const payload = `${id}.${issued}`;
    const expected = signature(payload, secret);
    if (!extra.length && /^[a-f0-9-]{36}$/.test(id ?? '') && /^\d+$/.test(issued ?? '') && Number(issued) <= now && now - Number(issued) < 86_400_000 && /^[A-Za-z0-9_-]{43}$/.test(signed ?? '') && timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) return { id };
  }
  const id = randomUUID(), payload = `${id}.${now}`;
  return { id, setCookie: `${NAME}=${payload}.${signature(payload, secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
}
