# FanCode competition fit

Research date: 2 November 2026. Research only; no provider, league or account configuration changed.

## Conclusion

A football competition streamed by FanCode can use the same companion architecture, provided its data source supplies the required fields. Streaming access and developer data access are separate. No replacement competition currently has verified free, current-season access to all MatchSide features.

| Candidate | FanCode evidence | Data constraint |
|---|---|---|
| Saudi Roshn League | The official 2026–27 page includes the Abha vs Al-Ittihad match watched on 30 October. | Outside the existing Sportmonks free entitlement. API-Football is a candidate, subject to an actual free-account current-season probe. |
| AFC Champions League Elite | Official FanCode 2026–27 competition page lists fixtures. | Same API-Football entitlement and field-coverage checks; not a verified replacement yet. |
| LaLiga | Official FanCode 2026–27 fixtures are listed. | football-data.org includes free competition coverage but delayed scores; its lineup/event deep data and statistics require paid products, reducing the fit for the current scope. |

The official FanCode Scottish Premiership page found in this research contains historical 2022–2023 matches. It does not establish current 2026–27 streaming. No current Danish Superliga streaming confirmation was found in the inspected FanCode listings. Absence from those listings is not proof that FanCode never streams either league.

## Recommendation

For today's submission, retain the genuine Danish recording already captured and describe the FanCode experience as the observed problem, not an existing integration. Saudi Roshn League is the strongest next integration candidate because it matches that experience. First probe a free API-Football account against a completed 2026–27 Saudi fixture for score, incident IDs/timing, substitution direction, starters and formations. Possession is optional under the narrowed scope.

API-Football publishes a free allowance of 100 requests/day with season restrictions. Its coverage listing alone does not establish a particular free account's current-season access or per-match completeness. Such a budget also needs deliberately limited shared polling. Do not activate a paid plan or rely on undocumented SofaScore/FotMob endpoints to claim reliable free coverage.

## Official sources

- [FanCode Saudi 2026–27 fixtures](https://www.fancode.com/football/tour/roshn-saudi-league-2026-2027-19802831/matches)
- [FanCode AFC Champions League Elite 2026–27](https://www.fancode.com/football/tour/afc-champions-league-elite-2026-27-19843162)
- [FanCode LaLiga 2026–27](https://www.fancode.com/football/tour/laliga-2026-27-19782952/matches)
- [FanCode historical Scottish Premiership page](https://www.fancode.com/football/tour/scottish-premiership-1787922/matches)
- [FanCode football competition listing](https://www.fancode.com/tour-listing/football)
- [Sportmonks free-plan coverage](https://www.sportmonks.com/football-api/free-plan/)
- [API-Football plans](https://www.api-football.com/)
- [API-Football competition coverage](https://www.api-football.com/coverage)
- [football-data.org coverage](https://www.football-data.org/coverage)
- [football-data.org pricing](https://www.football-data.org/pricing)

Current-season API-Football entitlement, actual stream playback and successive live updates remain unverified.
