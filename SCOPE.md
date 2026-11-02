# MatchSide: approved scope and verification

Updated 2 November 2026 after the owner approved narrowing the scope and using a genuine completed-match demonstration for an afternoon submission. This document supersedes earlier requirements for attacking-output comparisons, core shot coverage and a mandatory in-play recording before submission.

## Fan problem and supported experience

A fan should be able to understand recorded incidents and player changes without leaving their current-match companion to research across other apps.

- Current score, status, source and successful-fetch time.
- Recorded goals, cards, substitutions, VAR and other provider-supplied incidents.
- AI explanations of selected/latest incidents, with missing causes clearly acknowledged.
- Correct incoming/outgoing substitution identification and supplied player positions.
- Starting lineups, listed substitutes and supplied formation, without claiming current tactical positions.
- Possession when supplied, with no inference of dominance or chance quality.
- Answers linked to the exact facts and snapshot version used.
- Explicit genuine completed-match example for off-hours review, labelled **Recorded match · Full-time**. This is not presented as a current live feed.

Suggested questions now cover the latest incident, possession limits, and who came on. The match rail shows supplied possession and incidents. It no longer displays shots or shots on target.

## Excluded

Shot statistics and attacking-output comparisons are deferred. Existing snapshot/adapter shot fields remain for compatibility, but are filtered out of AI evidence and the UI. No clock synchronization, history browser, predictions, ratings, H2H, standings calculations, medical diagnoses, inferred managerial intent, video processing or direct FanCode integration.

## Data gate

The revised completed/in-play coverage probe requires a supplied score, an available event feed, and two lineups with eleven starting players and a supplied formation each. Empty events are permitted as recorded state, not proof that nothing occurred. Possession is optional. Scheduled fixtures can legitimately fail this gate until match data arrives.

Real completed-fixture probe 19713874 (Brøndby IF vs AGF) passed this revised gate. Upcoming fixture 19713878 (Sønderjyske Fodbold vs FC København) is configured locally for 2 November at 23:30 IST. Its in-play coverage remains to be verified.

## Implementation and checks

The match rail and AI suggestions follow the reduced scope. Legacy shot fields are filtered out of AI evidence. Answers retain the exact evidence version used, and prompt changes invalidate old answer-cache identities. Current verification and remaining limits are recorded in [the bug-fix review](BUGFIX-REVIEW-2026-11-02.md).

The included `data/recorded-match.json` contains genuine completed Brøndby IF vs AGF data from Sportmonks. The owner approved this completed fixture instead of waiting for tonight's selected current fixture. Both modes use the same normalized match contract, and the recording is never silently substituted for current data.

## Earlier Gemini smoke result

Three real generation attempts were made through the shared API handler with real Neon quota reservation and a genuine completed fixture. Two were rejected by the old strict suffix validation. After reproducing and fixing it, the third returned HTTP 200:

> At 88', AGF brought on Colin Rösler for Callum McCowatt.

The claim references the corresponding substitution event and retains the exact source snapshot version. The response and selected provider event are saved in `qa/real-ai-smoke-2026-11-02.json`. This validates one integration path on completed-match data; it is not a live observation, genuine in-play recording or passed evaluation set. No local web server was started for this check.

## Recorded-answer availability

Three genuine Gemini responses for the recorded fixture are saved in `data/recorded-answers.json` and labelled Cached in the interface. They are served before database and model calls, without a daily expiry, only for their exact question/context and matching recording, evidence, model and prompt version. Custom questions retain normal quota checks. Regenerate with `npm run cache:recorded -- --confirm` after intentional recording/prompt changes; this consumes available free quota and stops on errors.

## Updated AI allowance and optional backup

The owner raised the shared daily allowance to 20 attempts. It remains bounded by the confirmed free account limits, with the existing visitor, RPM and TPM checks. A distinct optional backup key with confirmed limits permits one fallback after an actual provider rate limit, timeout or outage. Both attempts are reserved separately and use the same snapshot within a shared deadline. Invalid answers, credential errors and validation errors do not trigger fallback. The saved demo does not consume this allowance.

## Remaining release work

Deploy with authorization, verify public access and actual AI responses, and finish the recorded-mode reviewer flow. The full 20-case real-model evaluation, actual in-play updates and broad device QA remain incomplete and must not be claimed as passed. Current local verification is documented separately from those outstanding integration checks. Submission is not automated.
