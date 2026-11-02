// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { AiAnswer, HealthResponse, MatchResponse, MatchSnapshot, Mode } from '../shared/contracts';

// Synthetic fixtures exist only in tests. The production app never supplies fallback match data.
const health: HealthResponse = { status: 'ready', services: { football: true, fixture: true, ai: true, database: true, session: true, aiQuota: true, example: true } };
function snapshot(name = 'Live Club', version = 'v1'): MatchSnapshot {
  return {
    fixtureId: 'test-fixture', leagueId: 1, competition: 'Test Competition', kickoff: '2026-10-30T12:00:00Z',
    teams: [{ id: 'home', name, shortName: 'HOME', side: 'home' }, { id: 'away', name: 'Away Club', shortName: 'AWAY', side: 'away' }],
    score: { home: 1, away: 0 }, status: 'live', minute: 25, addedMinute: null,
    events: [{ id: 'event-1', type: 'substitution', minute: 20, addedMinute: null, period: 1, teamId: 'home', player: 'Incoming Player', relatedPlayer: 'Outgoing Player', detail: 'Incoming Player on for Outgoing Player', order: 1 }],
    lineups: [{ teamId: 'home', formation: '4-3-3', players: [{ id: 'p1', name: 'Starting Player', number: 1, position: 'Goalkeeper', starter: true, formationField: null }] }],
    stats: [{ key: 'shots', label: 'Shots', home: 3, away: 2, unit: '' }],
    availability: { events: true, lineups: true, statistics: true }, provider: 'Sportmonks', fetchedAt: '2026-10-30T12:25:00Z', contentVersion: version,
  };
}
function match(mode: Mode = 'live', name?: string, version?: string): MatchResponse {
  return { mode, snapshot: snapshot(name, version), freshness: mode === 'live' ? 'fresh' : 'recorded', message: null };
}
function answer(text = 'A response based on the recorded substitution.'): AiAnswer {
  return { claims: [{ text, evidenceIds: ['fact-1'] }], limitation: null, facts: [{ id: 'fact-1', text: 'Incoming Player replaced Outgoing Player at 20 minutes.', kind: 'event' }], mode: 'live', contentVersion: 'v1', asOf: '2026-10-30T12:25:00Z', matchMinute: 25, cached: false };
}
function matchAcrossHalves(): MatchResponse {
  const response = match();
  const current = response.snapshot!;
  current.minute = 46;
  current.events = [
    ...Array.from({ length: 18 }, (_, index) => ({ ...current.events[0], id: `first-half-${index + 1}`, type: 'other' as const, minute: index === 17 ? 45 : index * 2 + 1, addedMinute: index === 17 ? 3 : null, period: 1, order: index + 1, detail: `First-half event ${index + 1}` })),
    { ...current.events[0], id: 'second-half-latest', minute: 46, addedMinute: null, period: 2, order: 1, detail: 'Second-half substitution' },
  ];
  return response;
}
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body } as Response);
function stalledUntilAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    const abort = () => reject(new DOMException('The request was aborted.', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush(action?: () => void) { await act(async () => { action?.(); await Promise.resolve(); }); }
async function open() { await flush(() => { render(<App />); }); }
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}
function usual(url: string) { return url === '/api/health' ? json(health) : json(match(url.includes('example') ? 'example' : 'live', url.includes('example') ? 'Recorded Club' : 'Live Club')); }
function setHidden(value: boolean) { Object.defineProperty(document, 'hidden', { configurable: true, value }); }

beforeEach(() => {
  setHidden(false);
  // jsdom lacks the native dialog methods. Preserve their open/close contract here.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('live match companion behavior', () => {
  it('clearly labels reused AI answers as cached', async () => {
    mockFetch(url => url === '/api/ask' ? json({ ...answer(), cached: true }) : usual(url));
    await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Who came on?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    expect(screen.getByText('MatchSide answer · Cached')).toBeTruthy();
  });
  it('shows a neutral loading state instead of claiming the match is disconnected before the first response', async () => {
    const pending = deferred<Response>();
    mockFetch(url => url === '/api/health' ? json(health) : pending.promise);
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loading match…');
    expect(screen.queryByText('No match connected')).toBeNull();
    expect(screen.queryByText('Possession unavailable.')).toBeNull();
    await act(async () => pending.resolve(await json(match())));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
  });
  it('loads an unvisited source without showing disconnected text or the previous source facts', async () => {
    const pending = deferred<Response>();
    mockFetch(url => url === '/api/match?mode=example' ? pending.promise : usual(url));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loading match…');
    expect(screen.queryByText('No match connected')).toBeNull();
    expect(screen.queryByText(/Live Club/)).toBeNull();
    await act(async () => pending.resolve(await json(match('example', 'Recorded Club'))));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Recorded Club');
  });
  it('restores a visited source immediately and keeps its facts through a failed background revalidation', async () => {
    let liveCalls = 0;
    const pending = deferred<Response>();
    mockFetch(url => url === '/api/match?mode=live' && ++liveCalls > 1 ? pending.promise : usual(url));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('tab', { name: 'Lineups' })));
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My current match question' } }));
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Recorded Club');
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Current match' })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    expect(screen.queryByText('Loading match…')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('My current match question');
    expect(screen.getByRole('tab', { name: 'Lineups' }).getAttribute('aria-selected')).toBe('true');
    await act(async () => pending.resolve(await json({ error: { message: 'Temporary current-match outage.' } }, false)));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    expect(screen.getByText(/Temporary current-match outage/)).toBeTruthy();
    expect(screen.getByText(/Last available update/)).toBeTruthy();
  });
  it('does not carry a source failure into a different source while that source is still loading', async () => {
    const pending = deferred<Response>();
    mockFetch(url => url === '/api/health' ? json(health) : url.includes('example') ? pending.promise : json({ error: { message: 'Current feed is unavailable.' } }, false));
    await open();
    expect(screen.getByText('Current feed is unavailable.')).toBeTruthy();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    expect(screen.queryByText('Current feed is unavailable.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loading match…');
    await act(async () => pending.resolve(await json(match('example', 'Recorded Club'))));
  });
  it('still shows a real unavailable state after a completed request with no match', async () => {
    mockFetch(url => url === '/api/health' ? json(health) : json({ mode: 'live', snapshot: null, freshness: 'unavailable', message: 'No fixture is configured.' }));
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No match connected');
    expect(screen.getByText('No fixture is configured.')).toBeTruthy();
  });
  it('keeps independent current and recorded question drafts when switching back and forth', async () => {
    mockFetch(usual); await open();
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    await flush(() => fireEvent.change(input, { target: { value: 'any yellow cards?' } }));
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Current match' })));
    expect(input.value).toBe('');
    await flush(() => fireEvent.change(input, { target: { value: 'Who is playing now?' } }));
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    expect(input.value).toBe('any yellow cards?');
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Current match' })));
    expect(input.value).toBe('Who is playing now?');
  });
  it('submits Enter once while preserving the duplicate-request guard', async () => {
    const pending = deferred<Response>();
    const fetcher = mockFetch(url => url === '/api/ask' ? pending.promise : usual(url));
    await open();
    const input = screen.getByRole('textbox');
    await flush(() => fireEvent.change(input, { target: { value: 'What happened?' } }));
    await flush(() => { fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/ask')).toHaveLength(1);
    await act(async () => pending.resolve(await json(answer())));
  });
  it.each([{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }])('does not submit Shift+Enter or an IME confirmation: %j', async options => {
    const fetcher = mockFetch(usual); await open();
    const input = screen.getByRole('textbox');
    await flush(() => fireEvent.change(input, { target: { value: 'What happened?' } }));
    expect(fireEvent.keyDown(input, { key: 'Enter', ...options })).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/ask')).toHaveLength(0);
  });
  it('replaces wholly absent possession with a compact message and removes redundant rail chrome', async () => {
    mockFetch(usual); await open();
    expect(screen.getByText('Possession unavailable.')).toBeTruthy();
    expect(screen.queryByLabelText('Live Club Possession: N/A')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Match information' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Match' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Suggested questions' }).querySelector('svg')).toBeNull();
  });
  it('groups readable supporting facts without internal IDs and formats answer times without seconds', async () => {
    const response = answer();
    response.facts = [{ id: 'formation:home', kind: 'lineup', text: 'Live Club starting formation: 4-3-3.' }];
    response.claims = [{ text: 'Live Club starts in a 4-3-3.', evidenceIds: ['formation:home'] }];
    mockFetch(url => url === '/api/ask' ? json(response) : usual(url)); await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'How are they lining up?' } }));
    await flush(() => fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }));
    const article = screen.getByRole('article', { name: 'AI answer' });
    expect(article.querySelector('.answer-heading')!.textContent).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'View evidence for statement 1' })));
    const dialog = screen.getByRole('dialog', { name: 'Supporting match facts' });
    expect(within(dialog).getByRole('heading', { name: 'Formation' })).toBeTruthy();
    expect(within(dialog).getByText(response.facts[0].text)).toBeTruthy();
    expect(dialog.textContent).not.toContain('formation:home');
    expect(dialog.textContent).not.toContain('Source reference');
  });
  it('offers a useful lineup prompt before kickoff and disables unavailable fact prompts', async () => {
    const response = match();
    response.snapshot!.status = 'scheduled'; response.snapshot!.score = { home: null, away: null };
    response.snapshot!.events = []; response.snapshot!.stats = [];
    mockFetch(url => url === '/api/health' ? json(health) : json(response));
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('vs');
    expect(screen.getByText(/Kickoff/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Explain possession/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Who came on/ }) as HTMLButtonElement).disabled).toBe(true);
    await flush(() => fireEvent.click(screen.getByRole('button', { name: /Explain the lineups/ })));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('How are both teams lining up?');
  });
  it('opens lineups directly through section navigation and preserves the typed question', async () => {
    mockFetch(usual); await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain this player change.' } }));
    await flush(() => fireEvent.click(screen.getByRole('link', { name: 'Lineups', exact: true })));
    expect(screen.getByRole('tab', { name: 'Lineups' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Explain this player change.');
  });
  it('does not offer a recording as usable when none is configured', async () => {
    mockFetch(url => url === '/api/health' ? json({ ...health, services: { ...health.services, example: false } }) : json(match()));
    await open();
    expect(screen.queryByRole('radio', { name: 'Recorded match' })).toBeNull();
    expect(screen.queryByText('No recording available yet.')).toBeNull();
  });
  it('retries failed connection status alongside match data and removes the recovered error', async () => {
    let healthCalls = 0;
    const fetcher = mockFetch(url => url === '/api/health' && ++healthCalls === 1 ? Promise.reject(new Error('Connection status could not be checked.')) : usual(url));
    await open();
    expect(screen.getByText('Connection status could not be checked.')).toBeTruthy();
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/health')).toHaveLength(2);
    expect(screen.queryByText('Connection status could not be checked.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
  });
  it('lets a direct recorded-mode visitor return to the current match when recording is unavailable', async () => {
    window.history.replaceState({}, '', '/?mode=example');
    mockFetch(url => url === '/api/health' ? json({ ...health, services: { ...health.services, example: false } }) : url.includes('example') ? json({ error: { message: 'The recorded match is not available.' } }, false) : usual(url));
    try {
      await open();
      expect(screen.getByText('The recorded match is not available.')).toBeTruthy();
      expect((screen.getByRole('radio', { name: 'Recorded match' }) as HTMLInputElement).disabled).toBe(true);
      await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Current match' })));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
      expect(screen.queryByText('The recorded match is not available.')).toBeNull();
    } finally { window.history.replaceState({}, '', '/'); }
  });
  it('offers possession and incident questions without legacy shot rows or attacking prompts', async () => {
    const response = match();
    response.snapshot!.stats.push({ key: 'possession', label: 'Possession', home: 55, away: null, unit: '%' });
    mockFetch(url => url === '/api/health' ? json(health) : json(response));
    await open();
    expect(screen.queryByText('Shots')).toBeNull();
    expect(screen.queryByRole('button', { name: /Compare attacking output/ })).toBeNull();
    expect(screen.getByLabelText('Live Club Possession: 55%')).toBeTruthy();
    expect(screen.getByLabelText('Away Club Possession: Unavailable')).toBeTruthy();
    await flush(() => fireEvent.click(screen.getByRole('button', { name: /Explain possession/ })));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('What does possession tell us?');
  });
  it('does not poll while hidden and refreshes immediately on return', async () => {
    vi.useFakeTimers();
    const fetcher = mockFetch(usual);
    await open();
    const count = () => fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/match')).length;
    expect(count()).toBe(1);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(count()).toBe(1);
    setHidden(false);
    await flush(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(count()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(count()).toBe(3);
  });

  it('ignores a late live response after switching to recorded mode', async () => {
    const old = deferred<Response>();
    const fetcher = mockFetch((url) => url === '/api/match?mode=live' ? old.promise : usual(url));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Recorded Club');
    await act(async () => { old.resolve(await json(match('live', 'Late Live Club'))); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Recorded Club');
    expect(screen.queryByText('Late Live Club')).toBeNull();
    const oldSignal = fetcher.mock.calls.find(([url]) => url === '/api/match?mode=live')?.[1]?.signal;
    expect(oldSignal?.aborted).toBe(true);
  });

  it('preserves valid match information when background refresh fails', async () => {
    let matchCalls = 0;
    mockFetch((url) => {
      if (url.startsWith('/api/match') && ++matchCalls > 1) return Promise.reject(new Error('Match feed temporarily unavailable.'));
      return usual(url);
    });
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Refresh match data' })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    expect(screen.getByText(/The last available match information is still shown/)).toBeTruthy();
    expect(screen.getByText(/Last available update/)).toBeTruthy();
  });

  it.each(['live', 'example'] as const)('ignores a late %s AI answer while the other mode has its own draft and request', async initialMode => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    let asks = 0;
    const fetcher = mockFetch((url) => url === '/api/ask' ? ++asks === 1 ? old.promise : current.promise : usual(url));
    await open();
    if (initialMode === 'example') await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    await flush(() => fireEvent.change(screen.getByRole('textbox', { name: 'Your question about the match' }), { target: { value: 'What happened?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    expect(screen.getByRole('button', { name: 'Thinking' }).hasAttribute('disabled')).toBe(true);
    const nextMode = initialMode === 'live' ? 'example' : 'live';
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: nextMode === 'example' ? 'Recorded match' : 'Current match' })));
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    await flush(() => fireEvent.change(input, { target: { value: 'Who came on?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    await act(async () => { old.resolve(await json({ ...answer('OLD MODE ANSWER'), mode: initialMode })); });
    expect(screen.queryByText('OLD MODE ANSWER')).toBeNull();
    expect(input.value).toBe('Who came on?');
    expect(screen.getByRole('button', { name: 'Thinking' }).hasAttribute('disabled')).toBe(true);
    const signal = fetcher.mock.calls.find(([url]) => url === '/api/ask')?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
    await act(async () => { current.resolve(await json({ ...answer('NEW MODE ANSWER'), mode: nextMode })); });
    expect(screen.getByText('NEW MODE ANSWER')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Who came on?' })).toBeTruthy();
    await flush(() => fireEvent.change(input, { target: { value: 'A new draft question.' } }));
    expect(screen.getByRole('heading', { name: 'Who came on?' })).toBeTruthy();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: initialMode === 'example' ? 'Recorded match' : 'Current match' })));
    expect(input.value).toBe('What happened?');
    expect(screen.queryByRole('article', { name: 'AI answer' })).toBeNull();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: nextMode === 'example' ? 'Recorded match' : 'Current match' })));
    expect(input.value).toBe('A new draft question.');
    expect(screen.queryByRole('article', { name: 'AI answer' })).toBeNull();
  });

  it('keeps the question and match data available after AI failure', async () => {
    mockFetch((url) => url === '/api/ask' ? json({ error: { code: 'AI_UNAVAILABLE', message: 'AI is temporarily unavailable.' } }, false) : usual(url));
    await open();
    const input = screen.getByRole('textbox', { name: 'Your question about the match' }) as HTMLTextAreaElement;
    await flush(() => fireEvent.change(input, { target: { value: 'Explain the latest incident.' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    expect(input.value).toBe('Explain the latest incident.');
    expect(screen.getByRole('alert').textContent).toContain('AI is temporarily unavailable.');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    expect(screen.getByRole('button', { name: 'Ask MatchSide' }).hasAttribute('disabled')).toBe(false);
  });

  it('supports keyboard tab navigation and displays provider lineups without invented positions', async () => {
    mockFetch(usual);
    await open();
    const tab = screen.getByRole('tab', { name: 'Match', selected: true });
    tab.focus();
    await flush(() => fireEvent.keyDown(tab, { key: 'ArrowRight' }));
    const lineups = screen.getByRole('tab', { name: 'Lineups', selected: true });
    expect(document.activeElement).toBe(lineups);
    expect(screen.getByText('Starting Player')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /formation based on provider positions/ })).toBeNull();
    await flush(() => fireEvent.keyDown(lineups, { key: 'Home' }));
    expect(screen.getByRole('tab', { name: 'Match', selected: true })).toBe(document.activeElement);
  });

  it('scopes an incident question and opens the actual returned supporting facts', async () => {
    const fetcher = mockFetch((url) => url === '/api/ask' ? json(answer()) : usual(url));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('button', { name: /Incoming Player on for Outgoing Player/ })));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    const ask = fetcher.mock.calls.find(([url]) => url === '/api/ask');
    expect(JSON.parse(String(ask?.[1]?.body))).toEqual({ mode: 'live', question: 'What happened here?', eventId: 'event-1' });
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'View supporting match facts' })));
    const dialog = screen.getByRole('dialog', { name: 'Supporting match facts' });
    expect(within(dialog).getByText('Incoming Player replaced Outgoing Player at 20 minutes.')).toBeTruthy();
    await flush(() => fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the match' })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('labels inline source actions and opens only the facts cited by each statement', async () => {
    const response = answer();
    response.facts.push({ id: 'fact-2', text: 'Another recorded match fact.', kind: 'event' });
    response.claims.push({ text: 'A statement supported by both facts.', evidenceIds: ['fact-1', 'fact-2'] });
    mockFetch(url => url === '/api/ask' ? json(response) : usual(url));
    await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the match.' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    const single = screen.getByRole('button', { name: 'View evidence for statement 1' });
    const multiple = screen.getByRole('button', { name: 'View evidence for statement 2' });
    expect(single.textContent).toBe('Source');
    expect(multiple.textContent).toBe('Sources');
    await flush(() => fireEvent.click(single));
    let dialog = screen.getByRole('dialog', { name: 'Supporting match facts' });
    expect(within(dialog).getByText(response.facts[0].text)).toBeTruthy();
    expect(within(dialog).queryByText(response.facts[1].text)).toBeNull();
    await flush(() => fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the match' })));
    await flush(() => fireEvent.click(multiple));
    dialog = screen.getByRole('dialog', { name: 'Supporting match facts' });
    expect(within(dialog).getByText(response.facts[0].text)).toBeTruthy();
    expect(within(dialog).getByText(response.facts[1].text)).toBeTruthy();
  });
  it('keeps evidence open when clicking its interior padding and closes only an outside backdrop click', async () => {
    mockFetch(url => url === '/api/ask' ? json(answer()) : usual(url));
    await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What happened?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'View supporting match facts' })));
    const dialog = screen.getByRole('dialog', { name: 'Supporting match facts' });
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 600, top: 100, bottom: 500, width: 500, height: 400, x: 100, y: 100, toJSON() {} });
    await flush(() => fireEvent.click(dialog, { clientX: 110, clientY: 110 }));
    expect(screen.getByRole('dialog', { name: 'Supporting match facts' })).toBeTruthy();
    await flush(() => fireEvent.click(dialog, { clientX: 50, clientY: 110 }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks duplicate AI dispatch while a request is outstanding', async () => {
    const pending = deferred<Response>();
    const fetcher = mockFetch((url) => url === '/api/ask' ? pending.promise : usual(url));
    await open();
    const input = screen.getByRole('textbox', { name: 'Your question about the match' });
    await flush(() => fireEvent.change(input, { target: { value: 'What happened?' } }));
    await flush(() => { fireEvent.submit(input.closest('form')!); fireEvent.submit(input.closest('form')!); });
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/ask')).toHaveLength(1);
    await act(async () => { pending.resolve(await json(answer())); });
  });

  it('shows an honest unconfigured state and never substitutes sample data', async () => {
    mockFetch((url) => url === '/api/health' ? json({ status: 'setup-required', services: { football: false, fixture: false, ai: false, database: false, session: false, aiQuota: false, example: false } }) : json({ mode: 'live', snapshot: null, freshness: 'unavailable', message: 'No match has been connected.' }));
    await open();
    expect(screen.getByText('No match has been connected.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No match connected');
    expect(screen.getByRole('button', { name: 'Ask MatchSide' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText('Live Club')).toBeNull();
    expect(screen.queryByText('Team A')).toBeNull();
    expect(screen.getByText('Keep your stream open alongside MatchSide.')).toBeTruthy();
    expect(screen.queryByText('Independent prototype')).toBeNull();
  });

  it('shows a second-half incident before first-half incidents when provider order restarts', async () => {
    mockFetch((url) => url === '/api/health' ? json(health) : json(matchAcrossHalves()));
    await open();
    const events = screen.getByRole('list');
    const latestRow = within(events).getAllByRole('button')[0];
    expect(latestRow.textContent).toContain('Second-half substitution');
    expect(latestRow.textContent).toContain('46′');
  });

  it('scopes the latest-incident prompt to the chronologically latest event across halves', async () => {
    const fetcher = mockFetch((url) => url === '/api/health' ? json(health) : url === '/api/ask' ? json(answer()) : json(matchAcrossHalves()));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Explain latest incident' })));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    const ask = fetcher.mock.calls.find(([url]) => url === '/api/ask');
    expect(JSON.parse(String(ask?.[1]?.body)).eventId).toBe('second-half-latest');
  });

  it('times out a stalled match refresh, preserves data, and enables a successful retry', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetcher = mockFetch((url, init) => {
      if (url.startsWith('/api/match') && ++calls === 2) return stalledUntilAborted(init?.signal);
      return usual(url);
    });
    await open();
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Refresh match data' })));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByText(/The match update took too long/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Live Club');
    expect(screen.getByRole('button', { name: 'Refresh match data' }).hasAttribute('disabled')).toBe(false);
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Refresh match data' })));
    expect(fetcher.mock.calls.filter(([url]) => url.startsWith('/api/match'))).toHaveLength(3);
    expect(screen.queryByText(/The match update took too long/)).toBeNull();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out stalled AI without losing the question or leaving its controls disabled', async () => {
    vi.useFakeTimers();
    let asks = 0;
    mockFetch((url, init) => url === '/api/ask' ? ++asks === 1 ? stalledUntilAborted(init?.signal) : json(answer()) : usual(url));
    await open();
    const input = screen.getByRole('textbox', { name: 'Your question about the match' }) as HTMLTextAreaElement;
    await flush(() => fireEvent.change(input, { target: { value: 'What happened?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(screen.getByRole('alert').textContent).toContain('The AI answer took too long.');
    expect(input.value).toBe('What happened?');
    expect(input.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Ask MatchSide' }).hasAttribute('disabled')).toBe(false);
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    expect(screen.getByText('A response based on the recorded substitution.')).toBeTruthy();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears request deadlines on mode change without presenting cancellation as a timeout', async () => {
    vi.useFakeTimers();
    mockFetch((url, init) => url === '/api/match?mode=live' ? stalledUntilAborted(init?.signal) : usual(url));
    await open();
    await flush(() => fireEvent.click(screen.getByRole('radio', { name: 'Recorded match' })));
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(screen.queryByText(/took too long/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Recorded Club');
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('marks an answer as older when a fresh snapshot changes its evidence version', async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url === '/api/ask') return json(answer());
      if (url.startsWith('/api/match')) return json(match('live', 'Live Club', ++calls > 1 ? 'v2' : 'v1'));
      return usual(url);
    });
    await open();
    await flush(() => fireEvent.change(screen.getByRole('textbox', { name: 'Your question about the match' }), { target: { value: 'What happened?' } }));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Ask MatchSide' })));
    await flush(() => fireEvent.click(screen.getByRole('button', { name: 'Refresh match data' })));
    expect(screen.getByText(/The match has updated since this answer/)).toBeTruthy();
    expect(screen.getByText('A response based on the recorded substitution.')).toBeTruthy();
  });
});
