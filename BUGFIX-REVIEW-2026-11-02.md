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
