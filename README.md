# MatchSide

A football companion for understanding the match while you watch.

I built MatchSide after watching Abha vs Al-Ittihad on FanCode. An injury, substitution and free kick left me looking for context that I could not find beneath the stream. I ended up opening another app. MatchSide brings the match facts and explanations into one place.

## What you can try

- Check the score, match status, incidents and supplied possession.
- View starting lineups, formations and substitutions.
- Select an incident or ask a match question. Gemini answers using the supplied facts, with source links for each claim.
- Switch between the configured current fixture and a genuine recorded Brøndby IF vs AGF match, clearly labelled **Full-time**.

The recorded demo's three suggested questions use saved Gemini answers, labelled **Cached**. They remain available without a new Gemini or database request. Custom questions still require available quota. Saved answers are invalidated if their recording, evidence, model or prompt version changes.

The interface takes cues from FanCode's charcoal and orange palette. It has its own branding and works alongside your broadcaster. There is no embedded stream or official FanCode integration.

## Run locally

Requires Node 26.x and npm.

```sh
npm ci
cp .env.example .env.local
```

Add your Sportmonks, Gemini and Neon credentials, a random session secret and your confirmed free-tier limits to `.env.local`. Keep that file private. The existing Neon schema can be installed in your own database with `npm run db:migrate`.

```sh
npm run dev -- --port 4173 --strictPort
```

Open [localhost:4173](http://127.0.0.1:4173). To start with the recorded match, use [the demo route](http://127.0.0.1:4173/?mode=example).

## How it works

React and TypeScript provide the interface. Vercel Node functions fetch Sportmonks data, coordinate refreshes through Neon Postgres, and send a bounded evidence bundle to Gemini 2.5 Flash. Cached answers retain the facts and match version they used. Server-side quotas limit free-tier usage.

Missing data stays unavailable. AI checks reject invalid references and unsupported names or numbers, but they do not guarantee that every explanation is correct.

```sh
npm test
npm run typecheck
npm run build
npm run test:sites
```

Tests cover request races, source switching, provider corrections, refresh failures, evidence validation and emitted API handlers. They use test fixtures and mocked model responses. Actual in-play observation and the full real-model evaluation remain incomplete.

## Deploy

Follow the [Vercel guide](DEPLOY-VERCEL.md) to import this repository, add server variables and verify the public deployment. The [review notes](BUGFIX-REVIEW-2026-11-02.md) describe the bugs fixed and verification limits. See [scope](SCOPE.md) for supported features.

Contact: [rajeshirkepranav12@gmail.com](mailto:rajeshirkepranav12@gmail.com)
