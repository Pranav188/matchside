import { beforeEach, describe, expect, it, vi } from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@neondatabase/serverless',()=>({neon:()=>query}));
import { PostgresStore } from '../server/database.ts';
const store=new PostgresStore('synthetic-test-url');
beforeEach(()=>vi.clearAllMocks());
describe('daily allowance diagnostics',()=>{
  it('distinguishes the shared application cap from the visitor cap',async()=>{
    query.mockResolvedValue([{global_used:15,visitor_used:2,reset_at:1793692800000}]);
    expect(await store.dailyAiLimit('visitor',15,Date.now())).toEqual({scope:'application',resetAt:'2026-11-03T08:00:00.000Z'});
    query.mockResolvedValue([{global_used:10,visitor_used:10,reset_at:1793692800000}]);
    expect((await store.dailyAiLimit('visitor',15,Date.now()))?.scope).toBe('visitor');
  });
  it('does not label a temporary denial as a daily limit',async()=>{
    query.mockResolvedValue([{global_used:3,visitor_used:2,reset_at:1793692800000}]);
    expect(await store.dailyAiLimit('visitor',15,Date.now())).toBeNull();
  });
});
