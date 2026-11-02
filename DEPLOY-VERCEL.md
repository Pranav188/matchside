# Deploy MatchSide on Vercel

Prepared 2 November 2026. This guide deploys the React site and its three Node API functions together. Neon remains the database; Sportmonks and Gemini remain external providers. No custom domain, paid plan, video hosting or scheduled worker is required.

## What is ready, and what is still unverified

- `vercel.json` builds with `npm run build`, serves `dist/client`, and bundles the recorded match and `data/recorded-answers.json` into the API functions.
- API files use Vercel's supported `export default { fetch }` Web Request/Response interface. [Node runtime documentation](https://vercel.com/docs/functions/runtimes/node-js)
- A deployment-only bug was reproduced and fixed: emitted JavaScript imported `.ts` paths that were absent from the function bundle. `rewriteRelativeImportExtensions` now produces `.js` imports. A regression loads the emitted handlers in plain Node, without `tsx`, and reads the genuine recording. [TypeScript option](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)
- An isolated check with the official Vercel Node builder passed: the handler loaded, the recording was bundled, and no `.env` file was included. This is a bundling check, not a hosted deployment.
- Full `vercel build` requires linked account/project settings. That check and the hosted API/browser checks remain outstanding until the account is connected.

## 1. Use your personal Hobby account

Finish creating your Vercel account and select the free **Hobby** plan. Use this as your personal internship-assignment project. Keep Neon and Gemini on their existing free plans. There is no need to start a Pro trial or add a paid integration. Hobby has usage caps and is intended for personal, non-commercial projects. [Hobby plan](https://vercel.com/docs/plans/hobby)

The project currently allows each API function up to 60 seconds, within the documented Hobby function duration limit. Its own provider and AI timeouts are shorter. Vercel also meters function requests, memory and CPU, so check **Usage** after sharing the artifact. [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)

## 2. Import the GitHub repository

Once the reviewed source has been pushed to [Pranav188/matchside](https://github.com/Pranav188/matchside):

1. Open the [Vercel dashboard](https://vercel.com/dashboard).
2. Choose **Add New → Project**.
3. Connect GitHub if asked. Grant access to `Pranav188/matchside`, then choose **Import** next to that repository.
4. Keep the project under your personal Hobby account.
5. Choose **Vite** as the framework preset. If the repository contains MatchSide at its root, keep **Root Directory** as `./`.
6. Confirm these settings before deploying:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist/client` |
| Install command | `npm ci` |
| Node.js version | `26.x`, matching the local bundling check |

`vercel.json` already sets the build command and output directory. Vercel currently supports Node 26.x; its minor and patch versions can change automatically. [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

Add the environment variables in the next step **before clicking Deploy**. Do not upload `.env.local` to GitHub.

## 3. Add server environment variables

Expand **Environment Variables** in the import screen. For an existing project, use **Project → Settings → Environment Variables**. Copy each value privately from your local `.env.local` into its matching field. These values are server-only; none should have a `VITE_` prefix.

| Name | What to enter |
| --- | --- |
| `SPORTMONKS_API_TOKEN` | Your existing Sportmonks token |
| `SPORTMONKS_FIXTURE_ID` | The selected supported fixture ID, currently `19713878` |
| `GEMINI_API_KEY` | Your existing Google AI Studio key |
| `DATABASE_URL` | The same Neon connection string already used locally |
| `SESSION_SECRET` | Your existing random secret, at least 32 characters |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GEMINI_FREE_RPD` | Your confirmed free requests/day, previously shown as `20` |
| `GEMINI_FREE_RPM` | Your confirmed free requests/minute, previously shown as `5` |
| `GEMINI_FREE_TPM` | Your confirmed free tokens/minute, previously shown as `250000` |

Recheck the three quota values in AI Studio if the account's allowance has changed. The app reserves five daily provider calls and caps its own daily generations at the smaller of 40 or the free daily allowance minus five. Both local use and hosted use share that allowance when they use the same Neon database and Gemini project.

The recording uses the default path `data/recorded-match.json`, so `RECORDED_SNAPSHOT_PATH` can be omitted. Do not set it to a path on your Mac.

Choose **Production** and **Preview** scopes if both are offered, or add the same variables to Preview later before testing a preview deployment. Production and Preview can have different settings. Changes apply only to new deployments, so redeploy after editing them. [Environment variables](https://vercel.com/docs/environment-variables), [environments](https://vercel.com/docs/deployments/environments)

Reuse the existing Neon database and its installed schema. Deployment does not automatically run migrations. If you intentionally switch to a new empty database, stop and install the schema there before the hosted API checks. Do not reset the current database.

## 4. Deploy and inspect the result

Click **Deploy**. Vercel installs dependencies, builds the frontend, and packages the `/api` functions. Read the build result before opening the website. If it fails, save the error text without credentials and fix that failure before retrying.

Once it succeeds, choose **Visit**. In the project dashboard, open **Domains** and identify the production domain, usually `your-project.vercel.app`. That is the stable URL to use for submission.

The browser talks to relative URLs such as `/api/match` on that same domain. There is no separate backend host or frontend API URL to configure.

## 5. Verify the deployed artifact

Open the **production domain** in a private/incognito browser window where you are not signed into Vercel. A working page in your signed-in browser alone does not prove reviewers can access it.

1. Load `/`. Confirm the match heading, source switch and question field render.
2. Open `/api/health`. Expect JSON with `status: "ready"`. This confirms configuration presence, not that every upstream service works.
3. Open `/api/match?mode=live`. Expect genuine configured fixture data. **Upcoming** is correct before kickoff; do not relabel it live.
4. Open `/api/match?mode=example`. Expect `mode: "example"`, genuine Brøndby–AGF data, and full-time status. This checks that the recording made it into the function bundle.
5. In the page, choose **Recorded match**. Ask **Who came on?** once and open the answer's source link. Expect a genuine saved Gemini answer labelled **Cached**, with the matching recorded substitution and evidence. The three suggested questions do not consume another generation. Custom questions still use the quota-controlled AI path.
6. Switch between the two sources, type a different draft in each, and return. The drafts and match data should stay separate; warm switches should not flash a disconnected state.
7. Check Lineups, a selected incident, Enter to submit, Shift+Enter, source-dialog close/focus, and a narrow mobile viewport.
8. In Vercel, inspect the deployment's **Logs** for failed API requests. Do not paste keys, connection strings or full environment output into a report.

The completed recording demonstrates the interaction outside match hours. It does not prove successive live provider updates or complete the remaining real-model evaluation by itself.

For an off-hours reviewer link, use `https://YOUR-PRODUCTION-DOMAIN/?mode=example`. Keep the recorded/full-time label visible. The normal root page continues to show the configured current fixture.

## 6. Keep previews protected and verify public production access

Under **Project → Settings → Deployment Protection**, inspect the current configuration. Vercel's **Standard Protection** protects preview/generated deployment URLs while allowing production domains to be public. Use the production domain from **Domains**, then verify it in incognito. Do not disable protection across the project just to obtain a reviewer URL. [Deployment Protection](https://vercel.com/docs/deployment-protection)

If incognito shows a Vercel login screen, first check that you used the production domain rather than a generated deployment URL. If **All Deployments** is enabled, public production access requires a deliberate owner-approved change to the protection scope.

## Optional: CLI path instead of GitHub import

Use this only if GitHub import is unavailable. It uploads the reviewed local directory, so run it from this exact project:

```sh
cd /Users/pranav/projects/matchside
npx vercel@65.9.0 login
npx vercel@65.9.0 link
```

Select your personal account, create or link the intended MatchSide project, and confirm directory `./`. Linking creates local `.vercel` metadata; it does not deploy the application. Then add the server variables privately in the linked project's dashboard as described above. Do not run `vercel env pull .env.local` over your existing credential file.

After variables exist, the account-linked build can be tested locally:

```sh
npx vercel@65.9.0 pull --environment=preview
npx vercel@65.9.0 build
```

Create a preview only when ready to upload:

```sh
npx vercel@65.9.0 deploy
```

Preview protection can remain enabled. After checking the preview, publish production when you are ready to make the artifact available:

```sh
npx vercel@65.9.0 deploy --prod
```

Follow the hosted checks above on the production domain. Subsequent local changes require another deploy. With a connected GitHub repository, commits pushed to its production branch normally trigger a deployment instead. [CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli)

## If something fails

| Symptom | First check |
| --- | --- |
| UI loads but `/api/*` returns 404 | Correct project root, API files included, and deployment configured from the source rather than only `dist/client` |
| `setup-required` | Missing variable names/scopes, followed by a new deployment |
| AI unavailable while match data works | Gemini quotas/key, `SESSION_SECRET`, and Neon connectivity; inspect the safe API error code |
| Recorded match missing | Recording committed and `includeFiles` present; no Mac-only snapshot path |
| Provider/database failure | Hosted runtime logs and account/service status; keep valid cached data and retry after backoff |
| Reviewer sees Vercel authentication | Production domain and protection scope |
| A wrong release is public | Restore the previous known-good deployment through Vercel's deployment controls, then fix and redeploy; environment changes need their own review |

No deployment, account change, GitHub push or form submission is performed by this document.
