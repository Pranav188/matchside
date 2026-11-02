# Review before deployment

Reviewed 2 November 2026. This pass preserves the existing feature scope and visual design.

## Confirmed bugs fixed

| Area | Bug | Verification |
| --- | --- | --- |
| UX | Retry left a failed health check stuck | Recovery regression |
| UX | An unavailable recording hid the switch back to Current match | Direct recorded-route regression |
| UX | Clicking dialog padding closed the source dialog | Interior and backdrop click regressions |
| API | A malformed multibyte cookie could crash signature comparison | Unit and real HTTP boundary regressions |
| AI | Selected-incident answers could omit the selected evidence | Reference, first-claim and supported-refusal regressions |
| Providers | HTTP-date Retry-After values were ignored | Football and Gemini transport regressions |
| Refresh | An initial failure claimed saved data existed when the cache was empty | Empty-cache failure regression |
| Deployment | Compiled JavaScript retained imports for absent TypeScript files | Emitted handlers loaded in plain Node |

Each regression failed before its fix. The previous source-switch loading and separate-draft fixes remain covered. AI prompt/cache identity is now `match-context-v8`.

## Checks completed

- 143 application tests across nine suites passed.
- TypeScript and production frontend build passed.
- Four starter packaging checks passed.
- An isolated build with the official Vercel Node builder loaded the handler, returned health and recorded-match HTTP 200, included the recording and excluded environment files.
- Browser checks on the running local app confirmed neutral first-source loading, cached return switching, separate question drafts and populated lineups.

The three reviewers worked on separate frontend, backend and deployment files. The primary agent inspected the combined changes and reran the checks above. No database schema change or additional real model generation was made in this pass.

## Still to verify

Account-linked Vercel build, public deployment, signed-out access, actual hosted AI responses, broad mobile/keyboard QA, successive in-play provider updates and the full real-model evaluation remain open. Unit tests and evidence-reference validation do not establish complete semantic correctness of generated answers.

The completed recorded match is an approved reviewer demonstration, clearly labelled Full-time. Submission is not automated.

## Recorded-answer cache, same-day follow-up

Three actual Gemini answers were generated and manually checked against the Brøndby IF vs AGF facts. The shipped cache preserves each answer's evidence and captured time, is labelled Cached, and does not expire daily. A mismatched question, incident, recording, model, prompt version or evidence is a cache miss. Custom requests still follow normal quotas.

A real generation failure exposed another retrieval bug: a prior substitution was linked to a later card merely because the player matched. A failing regression reproduced it. Related-event retrieval now connects treatment/substitution context while keeping card explanations scoped to the selected card. The evidence/claim validator was retained. Prompt/cache identity is `match-context-v9`.

With all 15 daily app slots reserved, six repeated saved-answer API calls returned HTTP 200 with network access disabled and zero external calls. The reservation count stayed at 15. An uncached request returned HTTP 429. Plain Node emitted-handler tests also serve all three saved answers with no credentials. Browser QA confirmed Enter submission, the Cached label and a source dialog containing the exact possession fact.

159 application tests, typecheck, production build and four packaging checks passed. The isolated official Vercel Node bundle includes both data files and serves all three answers without external requests. Hosted verification remains pending.

## Quota and cached-answer messaging

A daily app-cap denial is now distinguished from a temporary limit using a read-only counter check after denial. The atomic reservation, limits and database schema are unchanged. The API returns the next Pacific-midnight reset instead of an arbitrary one-hour wait; the current reset and daylight-saving boundary were verified through real read-only SQL.

The UI explains that a cached answer is being shown because of a limit only after receiving a confirmed limit response. Otherwise it neutrally identifies a previously saved answer. Different recorded fixtures remain isolated by fixture/version/context checks; a multiple-recording selector has not been added.

165 tests, typecheck, build and four packaging checks passed. Browser QA reproduced the custom-question denial and then the cached-answer recovery, including the November 3, 1:30 PM IST reset message. No further Gemini generations were requested.

## Owner-approved allowance and backup update

The shared app cap is now 20 attempts/day, bounded by the lower confirmed configured account limits. The five-call reserve was removed at the owner's request. Each primary or fallback attempt gets a separate atomic reservation; per-visitor and rolling limits remain. At most one backup attempt follows a provider rate limit, timeout or outage, within a shared deadline. Invalid responses and configuration errors are not retried.

184 application tests, typecheck, production build and four packaging checks pass. Backup routing is verified with mocked failures; an actual backup generation/failover is not claimed. No schema change was needed.

## Hosted verification

Production: https://matchside.vercel.app/ . Runtime commit: `df6f82a`. Local project moved intact to `/Users/pranav/projects/matchside`; all checks were repeated there. The linked full Vercel build and Hobby deployment passed.

Fresh unauthenticated HTTP requests returned 200 for the page, health, current fixture and recorded fixture. The current fixture remained correctly labelled scheduled. All three shipped answers returned as cached. One actual hosted generation returned “AGF's starting formation was 3-4-2-1.” and cited the matching formation fact. Browser checks covered the recorded page, suggested-question Enter submission, evidence dialog, and a 390px viewport without horizontal overflow; normal viewport settings were restored.

Primary and backup credentials were stored as approved Vercel secrets for Production and Preview. No credential values were included in Git or frontend assets. Backup model metadata access returned 200; actual failover remains unforced. The complete real-model evaluation and successive live in-play observations remain outstanding.


## New-account model compatibility and key handover

The owner requested interchanging the primary and backup account keys, then approved Gemini 3.5 Flash-Lite after the new account rejected 2.5 generation with HTTP 404. Its model-list/metadata endpoints still returned 200; metadata access alone did not establish generation eligibility. Google documents restricted 2.5 access for new users: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash .

The keys were interchanged locally and in Vercel Production/Preview. The exhausted 20-attempt app counter was archived, preserving its value, for this one-time handover to the unused account. A fresh 20-attempt budget was started; failed compatibility checks still count in that new budget. The runtime does not automatically restart budgets or multiply the allowance across accounts.

Runtime commit `27167b4` uses server-selected Gemini 3.5 Flash-Lite for new generations and omits the legacy 2.5 thinking-budget parameter. The existing genuine 2.5 recorded answers remain readable only with their exact fixture, question/context, facts and prompt version; their original model metadata is preserved. The cache preparation command retains these answers instead of relabelling them as new-model outputs. No schema migration or paid activation was required.

Verification: four migration regression cases failed before implementation, then all 188 application tests, typecheck, production build and four packaging checks passed. One real local and one fresh hosted Flash-Lite answer returned 200 with the matching 85-minute Kristian Arnstad argument/card fact. All three shipped suggested answers returned 200 as cached. Browser Enter submission returned that saved answer; the visible keyboard instruction is removed. Hosted proof is retained locally under `qa/hosted-flash-lite-check.json` and `qa/hosted-flash-lite-ui.png`.

The submission Markdown and Downloads PDF now name Flash-Lite; the one-page PDF and clickable contact footer were visually and structurally checked, and visible text remains under 200 words. Actual backup failover and the full real-model evaluation remain unforced/incomplete.


## Explicit card order and answer readability

Numbered yellow/red-card questions now resolve against the supplied chronological event list before cache lookup or generation. Explicit numbered questions override a previous selected incident; missing cards, multiple numbered targets, and ambiguous player/team-specific counts return a selection message without consuming AI quota. The recorded fourth yellow is Oliver Villadsen at 90+2 minutes, not Kristian Arnstad at 85.

The model prompt requests fan-facing sentences. Verbatim raw card records are formatted into readable facts while retaining the original evidence and references. Dynamic answers use a new prompt/cache version so prior incorrect answers are not reused. The three vetted shipped answers retain their original facts, provenance and validation during this presentation-only prompt migration. No provider credentials, quotas, schema or UI layout changed.

Regression coverage includes chronological selection, color filtering, missing and ambiguous references, conflicting selected context, pre-cache resolution, and readable card formatting. Local real-model verification of the exact fourth-card question returned Oliver Villadsen with the matching event reference.
