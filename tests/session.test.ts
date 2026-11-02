import {describe,it,expect}from'vitest';
import{sessionFromCookie}from'../server/session.ts';
const secret='test-only-secret-not-a-credential'.repeat(2);
describe('signed anonymous session',()=>{
 it('issues an HttpOnly SameSite cookie and verifies it',()=>{const a=sessionFromCookie(null,secret,1000);expect(a.setCookie).toContain('HttpOnly');expect(a.setCookie).toContain('SameSite=Strict');const b=sessionFromCookie(a.setCookie!,secret,2000);expect(b.id).toBe(a.id);expect(b.setCookie).toBeUndefined();});
 it('rejects tampered, expired and future cookies',()=>{const a=sessionFromCookie(null,secret,1000);expect(sessionFromCookie(a.setCookie!.replace(a.id,'00000000-0000-0000-0000-000000000000'),secret,2000).id).not.toBe(a.id);expect(sessionFromCookie(a.setCookie!,secret,86402000).id).not.toBe(a.id);expect(sessionFromCookie(a.setCookie!,secret,999).id).not.toBe(a.id);});
 it('replaces a malformed multibyte signature rather than throwing',()=>{const a=sessionFromCookie(null,secret,1000);const malformed=`matchside_session=${a.id}.1000.${'é'.repeat(43)}`;expect(()=>sessionFromCookie(malformed,secret,2000)).not.toThrow();const replacement=sessionFromCookie(malformed,secret,2000);expect(replacement.id).not.toBe(a.id);expect(replacement.setCookie).toContain('HttpOnly');});
});
