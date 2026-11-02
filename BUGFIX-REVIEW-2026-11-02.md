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
