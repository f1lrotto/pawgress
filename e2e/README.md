# End-to-end smoke test

Start the local Convex deployment before running the test:

```sh
npm run convex:dev
npm run e2e
```

The production-only PWA shell check builds the app, starts a preview server,
then verifies the manifest, active service worker, cached offline shell, and
reconnecting status:

```sh
npm run build
PLAYWRIGHT_PWA=true \
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run preview -- --host 127.0.0.1 --port 5174" \
npx playwright test e2e/pwa-shell.spec.ts
```

Playwright starts Vite on port 5174 and reuses an existing local server. Set
`PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_WEB_SERVER_COMMAND` to use another
address. Each run creates a unique account and dog in local development data;
no credentials are reused.

The daily-driver spec also verifies two-tab household sync for active and
completed walks, potty attachment, walk diaries, alternating sleep state,
custom enrichment play with archived history, and a training command through
mastery with a shared 5/5 session log. It also covers two-tab agenda sync for
goals and reflections, goal completion, and the dashboard’s agenda summary.
The same journey verifies the daily Timeline ledger and kind filtering, then
checks accessible Insights summaries and reactive body-weight history.
Finally, it creates a second isolated user, redeems the owner's invite from
dogless onboarding, verifies the reactive member list, and confirms the new
member's Pee log reaches the owner within one second. The tail switches only
the owner to Slovak, verifies immediate and reload-persisted localization in
both owner tabs, keeps authored notebook text verbatim, and confirms the
invited member remains in English.
