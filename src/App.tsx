import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowClockwise, ArrowRight, ArrowUpRight, ArrowsLeftRight, CaretDown, Clock, Info, MonitorPlay, PlugsConnected, SoccerBall, Sparkle, WarningCircle, X } from '@phosphor-icons/react';
import type { AiAnswer, ApiError, EvidenceFact, HealthResponse, MatchEvent, MatchResponse, MatchSnapshot, Mode, Player, TeamLineup } from '../shared/contracts';

import { MATCH_QUESTIONS } from '../shared/questions';

const POLL_MS = 15_000;
const MATCH_TIMEOUT_MS = 20_000;
const AI_TIMEOUT_MS = 35_000;
const QUESTION_LIMIT = 400;
class ApiRequestError extends Error {
  constructor(message:string,public code:string|undefined,public retryUntil:number) {super(message);}
}

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('The connection returned an unreadable response. Please try again.'); }
  if (!response.ok) {
    const error = (body as ApiError)?.error;
    const reset=error?.retryAt?Date.parse(error.retryAt):NaN;
    const seconds=error?.retryAfterSeconds;
    const wait=Number.isFinite(reset)?` New answers resume ${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(reset))}.`:seconds?seconds>=3600?' Please try again later.':seconds>=60?` Try again in ${Math.ceil(seconds/60)} minute${seconds>60?'s':''}.`:` Try again in ${seconds} seconds.`:'';
    throw new ApiRequestError((error?.message || 'Something went wrong. Please try again.') + wait,error?.code,Number.isFinite(reset)?reset:Date.now()+(seconds??60)*1000);
  }
  return body as T;
}

interface MatchLoadState { result: MatchResponse | null; error: string | null; settled: boolean; refreshing: boolean }

function useMatch(mode: Mode) {
  const [sources, setSources] = useState<Partial<Record<Mode, MatchLoadState>>>({});
  const trigger = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    let requestTimer: number | null = null;
    const updateSource = (update: Partial<MatchLoadState>) => setSources(previous => ({
      ...previous,
      [mode]: { result: null, error: null, settled: false, refreshing: false, ...previous[mode], ...update },
    }));
    const fetchMatch = async () => {
      if (pending || document.hidden || !active) return;
      pending = true;
      controller = new AbortController();
      const currentController = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; currentController.abort(); }, MATCH_TIMEOUT_MS);
      requestTimer = timeout;
      updateSource({ refreshing: true });
      try {
        const response = await fetch(`/api/match?mode=${mode}`, { signal: controller.signal });
        const next = await readResponse<MatchResponse>(response);
        if (active && !timedOut) updateSource({ result: next, error: null });
      } catch (cause) {
        if (active && (timedOut || !(cause instanceof DOMException && cause.name === 'AbortError'))) {
          updateSource({ error: timedOut ? 'The match update took too long. Please try again.' : cause instanceof Error ? cause.message : 'Could not refresh the match.' });
        }
      } finally {
        window.clearTimeout(timeout);
        requestTimer = null;
        pending = false;
        if (active) updateSource({ settled: true, refreshing: false });
      }
    };
    const onVisible = () => { if (!document.hidden) void fetchMatch(); };
    trigger.current = () => { void fetchMatch(); };
    void fetchMatch();
    const interval = window.setInterval(() => { void fetchMatch(); }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      if (requestTimer !== null) window.clearTimeout(requestTimer);
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      trigger.current = () => {};
    };
  }, [mode]);
  const source = sources[mode];
  return {
    result: source?.result?.mode === mode ? source.result : null,
    error: source?.error ?? null,
    loading: !source?.settled,
    refreshing: source?.refreshing ?? false,
    refresh: useCallback(() => trigger.current(), []),
  };
}

function minute(event: { minute: number | null; addedMinute?: number | null }) {
  if (event.minute === null) return 'Time unavailable';
  return `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ''}′`;
}
function time(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function statusText(snapshot: MatchSnapshot) {
  const labels = { scheduled: 'Upcoming', live: 'Live', halftime: 'Half-time', finished: 'Full-time', postponed: 'Postponed', unknown: 'Status unavailable' };
  return labels[snapshot.status];
}

function EmptyState({ icon, title, children, compact = false }: { icon: ReactNode; title: string; children: ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>{icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}<h3>{title}</h3><p>{children}</p></div>;
}
function Tabs({ value, onChange, id }: { value: 'match' | 'lineups'; onChange: (tab: 'match' | 'lineups') => void; id: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="rail-tabs" role="tablist" aria-label="Match information">{(['match', 'lineups'] as const).map((tab, index) => <button key={tab} ref={(node) => { refs.current[index] = node; }} id={`${id}-${tab}`} role="tab" aria-selected={value === tab} aria-controls={`${id}-panel`} tabIndex={value === tab ? 0 : -1} onClick={() => onChange(tab)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index; onChange(next === 0 ? 'match' : 'lineups'); refs.current[next]?.focus(); } }}>{tab === 'match' ? 'Match' : 'Lineups'}</button>)}</div>;
}

function StatRows({ snapshot }: { snapshot: MatchSnapshot | null }) {
  const stat = snapshot?.availability.statistics ? snapshot.stats.find(item => item.key === 'possession') : undefined;
  if (!stat || (stat.home === null && stat.away === null)) return <p className="possession-unavailable">Possession unavailable.</p>;
  const format = (value: number | null) => value === null ? 'Unavailable' : `${value}%`;
  return <section className="stats-section" aria-labelledby="stats-heading"><div className="section-heading"><h3 id="stats-heading">Possession</h3></div><div className="stat-team-head"><span>{snapshot?.teams[0].shortName}</span><span>{snapshot?.teams[1].shortName}</span></div><div className="stat-row"><strong aria-label={`${snapshot?.teams[0].name} Possession: ${format(stat.home)}`}>{format(stat.home)}</strong><span aria-hidden="true">%</span><strong aria-label={`${snapshot?.teams[1].name} Possession: ${format(stat.away)}`}>{format(stat.away)}</strong></div></section>;
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  if (type === 'substitution') return <ArrowsLeftRight size={17} />;
  if (type === 'goal') return <SoccerBall size={17} />;
  if (type === 'var') return <MonitorPlay size={17} />;
  if (type === 'card') return <WarningCircle size={17} />;
  return <Info size={17} />;
}
function Events({ snapshot, selected, onSelect, disabled }: { snapshot: MatchSnapshot | null; selected: string | null; onSelect: (event: MatchEvent) => void; disabled: boolean }) {
  const [all, setAll] = useState(false);
  // The provider adapter normalizes chronological order across periods.
  const events = snapshot?.availability.events ? [...snapshot.events].reverse() : [];
  const shown = all ? events : events.slice(0, 6);
  return <section className="events-section" aria-labelledby="events-heading"><div className="section-heading"><h3 id="events-heading">Match moments</h3><span>{events.length > 0 ? `${events.length} recorded` : 'Recorded incidents'}</span></div>{shown.length === 0 ? <EmptyState compact icon={null} title={snapshot?.availability.events ? 'No incidents recorded yet' : 'Waiting for match events'}>Goals, cards and substitutions will appear here. Select an incident to ask about it.</EmptyState> : <><ol className="event-list">{shown.map((event) => <li key={event.id}><button className={`event-row ${selected === event.id ? 'selected' : ''}`} aria-pressed={selected === event.id} disabled={disabled} onClick={() => onSelect(event)}><span className="event-minute">{minute(event)}</span><span className={`event-symbol ${event.type}`} aria-hidden="true"><EventIcon type={event.type} /></span><span className="event-copy"><strong>{event.detail || event.type}</strong>{event.player && <span>{event.player}{event.relatedPlayer ? ` / ${event.relatedPlayer}` : ''}</span>}</span><ArrowUpRight className="event-action" size={16} aria-hidden="true" /></button></li>)}</ol>{events.length > 6 && <button className="text-button show-events" onClick={() => setAll(!all)}>{all ? 'Show recent events' : `Show all ${events.length} events`}<CaretDown size={14} /></button>}<p className="data-caption">Select a moment to give your question context.</p></>}</section>;
}

function Lineups({ snapshot }: { snapshot: MatchSnapshot | null }) {
  const [side, setSide] = useState<0 | 1>(0);
  const lineup = snapshot?.availability.lineups ? snapshot.lineups.find((item) => item.teamId === snapshot.teams[side].id) : undefined;
  const starters = lineup?.players.filter((player) => player.starter) || [];
  const substitutes = lineup?.players.filter((player) => !player.starter) || [];
  return <section className="lineups-section"><div className="team-switch" role="group" aria-label="Lineup team">{([0, 1] as const).map((index) => <button key={index} aria-pressed={side === index} onClick={() => setSide(index)}>{snapshot?.teams[index].shortName || (index === 0 ? 'Home' : 'Away')}</button>)}</div>{!lineup || starters.length === 0 ? <EmptyState icon={<SoccerBall size={30} />} title="Lineup not available">Confirmed players and formation will appear when the provider supplies them.</EmptyState> : <><div className="section-heading"><h3>{snapshot?.teams[side].name}</h3><span>{lineup.formation || 'Formation unavailable'}</span></div><p className="data-caption">Starting formation</p><Formation lineup={lineup} /><PlayerList players={starters} title="Starting lineup" /><PlayerList players={substitutes} title="Substitutes" /></>}</section>;
}
function Formation({ lineup }: { lineup: TeamLineup }) {
  const starters = lineup.players.filter((player) => player.starter);
  const positions = starters.map((player) => ({ player, field: player.formationField?.match(/^(\d+):(\d+)$/) }));
  if (!positions.length || positions.some((item) => !item.field)) return null;
  const rowNumbers = [...new Set(positions.map((item) => Number(item.field![1])))].sort((a, b) => b - a);
  return <div className="formation" role="img" aria-label={`${lineup.formation || 'Team'} formation based on provider positions`}>{rowNumbers.map((row) => <div className="formation-row" key={row}>{positions.filter((item) => Number(item.field![1]) === row).sort((a, b) => Number(a.field![2]) - Number(b.field![2])).map(({ player }) => <div className="formation-player" key={player.id}><span>{player.number ?? '?'}</span><span>{player.name}</span></div>)}</div>)}</div>;
}
function PlayerList({ players, title }: { players: Player[]; title: string }) {
  if (players.length === 0) return null;
  return <div className="player-group"><h4>{title}</h4><ul>{players.map((player) => <li key={player.id}><span className="shirt-number">{player.number ?? 'N/A'}</span><span>{player.name}</span><span className="player-position">{player.position || 'Position unavailable'}</span></li>)}</ul></div>;
}

function EvidenceDialog({ facts, close }: { facts: EvidenceFact[] | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (facts && !dialog.current?.open) dialog.current?.showModal(); if (!facts && dialog.current?.open) dialog.current.close(); }, [facts]);
  const groups = new Map<string, EvidenceFact[]>();
  for (const fact of facts || []) {
    const label = fact.id.startsWith('formation:') ? 'Formation' : ({ score: 'Score', event: 'Match event', stat: 'Possession', lineup: 'Player', limitation: 'Data availability' } as const)[fact.kind];
    groups.set(label, [...(groups.get(label) || []), fact]);
  }
  return <dialog ref={dialog} className="evidence-dialog" aria-labelledby="evidence-title" onCancel={close} onClose={close} onClick={event => {
    if (event.target !== dialog.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }}><div className="dialog-heading"><h2 id="evidence-title">Supporting match facts</h2><button className="icon-button" onClick={close} aria-label="Close evidence"><X size={22} /></button></div><p className="dialog-intro">From the match update used for this answer.</p><div className="evidence-groups">{[...groups].map(([label, group]) => <section key={label}><h3>{label}</h3><ul className="evidence-list">{group.map(fact => <li key={fact.id}><p>{fact.text}</p></li>)}</ul></section>)}</div><button className="primary-button" onClick={close}>Back to the match<ArrowRight size={17} /></button></dialog>;
}

export function App() {
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(window.location.search).get('mode') === 'example' ? 'example' : 'live');
  const [tab, setTab] = useState<'match' | 'lineups'>('match');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthAttempt, setHealthAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Record<Mode, string>>({ live: '', example: '' });
  const question = questions[mode];
  const setQuestion = (value: string) => setQuestions(previous => ({ ...previous, [mode]: value }));
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [answerQuestion, setAnswerQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [aiLimit, setAiLimit] = useState<{daily:boolean;until:number}|null>(null);
  const [evidence, setEvidence] = useState<EvidenceFact[] | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const aiRequest = useRef<AbortController | null>(null);
  const aiTimer = useRef<number | null>(null);
  const aiGeneration = useRef(0);
  const aiBusy = useRef(false);
  const { result, error, loading, refreshing, refresh } = useMatch(mode);
  const snapshot = result?.snapshot || null;
  const selected = snapshot?.events.find((event) => event.id === selectedId) || null;
  const latest = snapshot?.availability.events ? snapshot.events.at(-1) || null : null;
  const latestSubstitution = snapshot?.availability.events ? [...snapshot.events].reverse().find(event => event.type === 'substitution') || null : null;
  const possession = snapshot?.availability.statistics ? snapshot.stats.find(stat => stat.key === 'possession') : null;
  const hasLineups = !!snapshot?.availability.lineups && snapshot.lineups.some(lineup => lineup.players.length > 0);
  const hasPossession = !!possession && (possession.home !== null || possession.away !== null);
  const exampleUnavailable = !!health && !health.services.example;
  const tabsId = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(readResponse<HealthResponse>).then((next) => { if (!controller.signal.aborted) { setHealth(next); setHealthError(null); } }).catch((cause) => { if (!controller.signal.aborted) setHealthError(cause instanceof Error ? cause.message : 'Connection status is unavailable.'); });
    return () => controller.abort();
  }, [healthAttempt]);
  useEffect(() => {
    aiGeneration.current += 1;
    aiRequest.current?.abort();
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    aiTimer.current = null;
    aiBusy.current = false;
    setAsking(false); setAnswer(null); setAskError(null); setSelectedId(null); setEvidence(null);
    return () => { aiGeneration.current += 1; aiRequest.current?.abort(); if (aiTimer.current !== null) window.clearTimeout(aiTimer.current); aiTimer.current = null; aiBusy.current = false; };
  }, [mode]);
  const modeAnswer = answer?.mode === mode ? answer : null;
  const missingSelected = Boolean(selectedId && snapshot && !selected);
  const aiConfigured = !health || health.services.ai;
  const aiReady = Boolean(snapshot && !missingSelected && aiConfigured && (!health || health.services.aiQuota));
  const changed = Boolean(modeAnswer && snapshot && modeAnswer.contentVersion !== snapshot.contentVersion);
  const chooseEvent = (event: MatchEvent) => { setSelectedId(event.id); setQuestion('What happened here?'); setAskError(null); questionRef.current?.focus({ preventScroll: true }); questionRef.current?.scrollIntoView?.({ block: 'center' }); };
  const suggest = (text: string, event?: MatchEvent | null) => { setQuestion(text); setSelectedId(event?.id || null); setAskError(null); questionRef.current?.focus({ preventScroll: true }); questionRef.current?.scrollIntoView?.({ block: 'center' }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (aiBusy.current || !aiReady || !question.trim() || question.length > QUESTION_LIMIT) return;
    aiBusy.current = true; setAsking(true); setAskError(null);
    const generation = ++aiGeneration.current;
    const controller = new AbortController(); aiRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, AI_TIMEOUT_MS);
    aiTimer.current = timeout;
    const asked = question.trim();
    try {
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, question: asked, ...(selected ? { eventId: selected.id } : {}) }), signal: controller.signal });
      const next = await readResponse<AiAnswer>(response);
      if (generation === aiGeneration.current && !controller.signal.aborted) { setAnswer(next); setAnswerQuestion(asked); if(!next.cached)setAiLimit(null); }
    } catch (cause) {
      if (generation === aiGeneration.current && (timedOut || !controller.signal.aborted)) {
        setAskError(timedOut ? 'The AI answer took too long. Please try again.' : cause instanceof Error ? cause.message : 'The answer could not be generated. Please try again.');
        if(cause instanceof ApiRequestError && ['AI_DAILY_LIMIT','AI_RATE_LIMIT','AI_RATE_LIMITED'].includes(cause.code??''))setAiLimit({daily:cause.code==='AI_DAILY_LIMIT',until:cause.retryUntil});
      }
    } finally {
      window.clearTimeout(timeout);
      if (aiTimer.current === timeout) aiTimer.current = null;
      if (generation === aiGeneration.current) { aiBusy.current = false; setAsking(false); }
    }
  };
  const providerMessage = mode === 'example' ? null : result?.message;
  const stale = result?.freshness === 'stale' || Boolean(error && snapshot);
  return <><a className="skip-link" href="#ask-heading">Skip to AI match assistant</a><header className="site-header"><a className="brand" href="#" aria-label="MatchSide home"><SoccerBall weight="duotone" size={30} /><span>match<span>side</span><span className="brand-period">.</span></span></a><div className="header-descriptor"><span className="header-divider" />Football match companion</div></header><main className="app-shell"><section className="match-header" aria-label="Current match" aria-busy={loading || refreshing}><div className="match-heading"><p className="competition">{snapshot?.competition || 'Match centre'}</p>{snapshot ? <h1 className="scoreboard"><span className="home-team">{snapshot.teams[0].name}</span><span className="score">{snapshot.status === 'scheduled' && snapshot.score.home === null && snapshot.score.away === null ? <span className="versus">vs</span> : <>{snapshot.score.home ?? '?'}<span>:</span>{snapshot.score.away ?? '?'}</>}</span><span className="away-team">{snapshot.teams[1].name}</span></h1> : <h1>{loading ? 'Loading match…' : 'No match connected'}</h1>}<div className="match-meta">{snapshot ? <><span className={`status-dot ${snapshot.status}`} /><span>{statusText(snapshot)}{snapshot.minute !== null ? ` · ${minute(snapshot)}` : ''}</span><span className="meta-separator">/</span>{snapshot.status === 'scheduled' && snapshot.kickoff && <time dateTime={snapshot.kickoff}>Kickoff {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(snapshot.kickoff))}</time>}<span>Updated {time(snapshot.fetchedAt)}</span></> : <><PlugsConnected size={15} /><span>{loading ? 'Loading match information' : 'Waiting for a connected match'}</span></>}</div></div>{(!exampleUnavailable || mode === 'example') && <fieldset className="mode-control"><legend>Match source</legend><div>{(['live', 'example'] as const).map((item) => <label key={item} className={mode === item ? 'active' : ''}><input type="radio" name="mode" value={item} checked={mode === item} disabled={item === 'example' && exampleUnavailable} aria-describedby={item === 'example' && exampleUnavailable ? 'example-help' : undefined} onChange={() => setMode(item)} />{item === 'live' ? 'Current match' : 'Recorded match'}</label>)}</div>{exampleUnavailable && <p id="example-help" className="mode-help">No recording available yet.</p>}</fieldset>}</section>
    <nav className="match-navigation" aria-label="Match sections"><a href="#ask-heading">Ask AI</a><a href="#match-details" onClick={() => setTab('match')}>Match</a><a href="#match-details" onClick={() => setTab('lineups')}>Lineups</a></nav>
    {mode === 'example' && snapshot && <div className="notice recorded"><Clock size={18} /><p><strong>Recorded match{snapshot.status === 'finished' ? ' · Full-time' : ''}.</strong> Captured match data, not current live updates.</p></div>}
    {(error || providerMessage || healthError || (!loading && !snapshot)) && <div className={`notice ${stale ? 'warning' : ''}`} role="status"><Info size={19} /><p>{error || providerMessage || healthError || 'Match data is not connected yet. Scores, events and lineups will appear here once a source is available.'}{stale && <span> The last available match information is still shown.</span>}</p><button className="text-button" onClick={() => { refresh(); if (healthError) setHealthAttempt(attempt => attempt + 1); }} disabled={refreshing}><ArrowClockwise className={refreshing ? 'spinning' : ''} size={15} />{refreshing ? 'Checking' : 'Retry'}</button></div>}
    <div className="watch-layout"><div className="main-column"><section className="viewing-area" aria-labelledby="video-heading"><div className="viewing-icon"><MonitorPlay size={26} weight="regular" /></div><div className="viewing-copy"><h2 id="video-heading">Watch with your broadcaster.</h2><p>Keep your stream open alongside MatchSide.</p></div><a href="https://www.fancode.com/football" target="_blank" rel="noreferrer" className="stream-link" aria-label="Open FanCode football in a new tab">Open FanCode<ArrowUpRight size={17} /></a></section>
    <section className="ai-section" aria-labelledby="ask-heading"><div className="ai-title-row"><span className="sparkle-mark"><Sparkle size={22} weight="fill" /></span><div><h2 id="ask-heading">Ask about the match.</h2></div></div>
    {missingSelected && <div className="selected-context"><span>The selected incident is no longer in the latest match feed.</span><button className="text-button" onClick={() => setSelectedId(null)}>Clear selection</button></div>}
    {selected && <div className="selected-context"><span><EventIcon type={selected.type} /><strong>{minute(selected)}</strong> {selected.detail}{selected.player ? ` · ${selected.player}` : ''}</span><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Clear selected incident" disabled={asking}><X size={16} /></button></div>}
    <form onSubmit={submit}><label className="sr-only" htmlFor="match-question">Your question about the match</label><div className="question-field"><textarea id="match-question" ref={questionRef} value={question} maxLength={QUESTION_LIMIT} rows={2} onChange={(event) => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!asking && aiReady && question.trim()) event.currentTarget.form?.requestSubmit(); } }} placeholder="Why was that player booked?" disabled={asking} aria-describedby="question-help" /><button className="ask-button" type="submit" disabled={!aiReady || !question.trim() || asking}>{asking ? <><ArrowClockwise className="spinning" size={18} />Thinking</> : <>Ask MatchSide<ArrowRight size={18} /></>}</button></div><div className="question-help" id="question-help"><span className="keyboard-help">Enter to ask · Shift+Enter for a new line</span><span>{!snapshot ? loading ? 'Loading match information…' : 'Match information is unavailable. Retry above.' : !aiConfigured ? 'AI answers are not connected yet. Match data remains available.' : health && !health.services.aiQuota ? 'AI capacity is currently unavailable. Match data remains available.' : 'Answers use the latest available match data, which may lag your broadcast.'}</span><span>{question.length}/{QUESTION_LIMIT}</span></div></form><div className="prompt-chips" role="group" aria-label="Suggested questions"><button onClick={() => suggest(latest ? MATCH_QUESTIONS.incident : 'How are both teams lining up?', latest)} disabled={(!latest && !hasLineups) || asking}>{latest ? 'Explain latest incident' : 'Explain the lineups'}</button><button onClick={() => suggest(MATCH_QUESTIONS.possession)} disabled={!hasPossession || asking} aria-describedby={!hasPossession ? 'prompt-availability' : undefined}>Explain possession</button><button onClick={() => suggest(MATCH_QUESTIONS.substitution, latestSubstitution)} disabled={!latestSubstitution || asking} aria-describedby={!latestSubstitution ? 'prompt-availability' : undefined}>Who came on?</button></div>{snapshot && (!hasPossession || !latestSubstitution) && <p id="prompt-availability" className="prompt-availability">{!hasPossession ? 'Possession not supplied yet. ' : ''}{!latestSubstitution ? 'No substitutions recorded yet.' : ''}{hasLineups ? ' Ask about players in the lineup.' : ''}</p>}
    {askError && <div className="ask-error" role="alert"><WarningCircle size={18} /><p>{askError} Your question is kept above so you can try again.</p></div>}
    {asking && <div className="answer-loading" role="status"><Sparkle size={18} /><span>Checking the match facts and preparing an answer…</span></div>}
    <p className="sr-only" role="status" aria-live="polite">{modeAnswer && !asking && !askError ? 'Answer ready. The explanation and supporting sources follow.' : ''}</p>
    {modeAnswer && <article className="answer" aria-label="AI answer"><div className="answer-heading"><p>MatchSide answer{modeAnswer.cached ? ' · Cached' : ''}</p><span>{modeAnswer.matchMinute !== null ? `${modeAnswer.matchMinute}′ · ` : ''}{time(modeAnswer.asOf)}</span></div><h3>{answerQuestion}</h3>{modeAnswer.cached && <p className="data-caption">{aiLimit && aiLimit.until>Date.now() ? aiLimit.daily ? "We’re showing a cached answer because the daily AI generation limit has been reached." : "We’re showing a cached answer while new AI requests are rate-limited." : modeAnswer.mode==='example' ? 'Showing a saved AI answer for this recorded match. No new AI request was made.' : 'Showing a previously generated answer for this match. No new AI request was made.'}</p>}{changed && <p className="answer-stale"><Info size={15} />The match has updated since this answer. Ask again for the latest context.</p>}<div className="answer-claims">{modeAnswer.claims.map((claim, index) => <p key={`${modeAnswer.contentVersion}-${index}`}>{claim.text}{claim.evidenceIds.length > 0 && <button className="claim-source" aria-label={`View evidence for statement ${index + 1}`} onClick={() => setEvidence(modeAnswer.facts.filter((fact) => claim.evidenceIds.includes(fact.id)))}>{claim.evidenceIds.length === 1 ? 'Source' : 'Sources'}<ArrowUpRight size={12} aria-hidden="true" /></button>}</p>)}</div>{modeAnswer.limitation && <p className="answer-limitation"><Info size={16} />{modeAnswer.limitation}</p>}<button className="text-button evidence-button" onClick={() => setEvidence(modeAnswer.facts)}>View supporting match facts<ArrowUpRight size={15} /></button></article>}
    <a href="https://www.fancode.com/football" target="_blank" rel="noreferrer" className="mobile-stream-link" aria-label="Open FanCode football in a new tab">Open FanCode<ArrowUpRight size={15} /></a>
    </section></div>
    <aside id="match-details" className="information-rail" aria-label="Match details" tabIndex={-1}><Tabs value={tab} onChange={setTab} id={tabsId} /><div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="rail-content">{loading && !snapshot ? <p className="match-loading" role="status">Loading match information…</p> : tab === 'match' ? <><StatRows snapshot={snapshot} /><Events snapshot={snapshot} selected={selected?.id || null} onSelect={chooseEvent} disabled={asking} /></> : <Lineups snapshot={snapshot} />}</div><div className="rail-footer"><span className={!snapshot ? 'connection-state pending' : stale ? 'connection-state stale' : 'connection-state'} /><span>{snapshot ? `${mode === 'example' ? 'Recorded data' : stale ? 'Last available update' : 'Latest available data'} · ${snapshot.provider}` : loading ? 'Loading match information…' : 'Match data unavailable'}</span>{snapshot && <button className="icon-button" aria-label="Refresh match data" disabled={refreshing} onClick={refresh}><ArrowClockwise className={refreshing ? 'spinning' : ''} size={16} /></button>}</div></aside></div>
    <footer className="site-footer"><a href="mailto:rajeshirkepranav12@gmail.com">Contact: rajeshirkepranav12@gmail.com</a></footer>
  </main><EvidenceDialog facts={evidence} close={() => setEvidence(null)} /></>;
}
