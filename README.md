# iwi7-presentation-registration-app

Registration form for final thesis presentations. Students pick an afternoon,
the system assigns them the earliest free position of that afternoon, and the
corresponding row in a SharePoint list is marked as taken. The app is a static
page on GitHub Pages, embedded into a TYPO3 page through an iframe.

## Why there is a worker in the middle

A Power Automate HTTP trigger has its credential inside its own URL, in the
`sig=` parameter. Anyone holding that URL can call the flow.

GitHub Pages serves static files. Whatever the browser needs to make a request,
the browser must receive, and anyone can read it in the network tab or in the
built JS bundle. There is no way to keep a secret in a static frontend, and
obfuscation only changes how long it takes to find. So the flow URLs live in a
Cloudflare Worker, and the browser talks to the worker instead.

```
Browser (GitHub Pages page, inside the TYPO3 iframe)
    |  GET  /api/sessions     no credentials
    |  POST /api/register     no credentials
    v
Cloudflare Worker            <-- flow URLs stored here as encrypted secrets
    |  origin allowlist, input validation, rate limit, optional Turnstile
    v
Power Automate flows         <-- premium HTTP trigger
    v
SharePoint lists             Presentation_Sessions, Registrations, Faculty_Supervisor
```

What the worker buys beyond hiding the URL: a foreign `Origin` gets a 403, a
malformed payload never reaches SharePoint, the individual positions are
collapsed into a counter before anything leaves the worker so no student data
reaches the browser, and a leaked flow URL can be rotated without touching the
frontend.

Cloudflare Workers free tier covers 100,000 requests per day. This app will not
come close.

## Layout

```
web/                 React + Vite frontend, deployed to GitHub Pages
  src/App.jsx        state, loading, submit handling
  src/api.js         the two calls to the worker
  src/i18n.js        German and English strings, date formatting
  src/components/    session list, form, language toggle, Turnstile
worker/
  src/index.js       the proxy, and the grouping of rows into afternoons
  mock-api.mjs       local stand-in, so the frontend runs without SharePoint
  check-contract.mjs validates a flow or the worker, and reports setup status
  dev-server.mjs     runs the worker locally against the real flows
  wrangler.toml      origin allowlist, secret names
docs/
  umbau-anleitung.md       migration from the old model, step by step (German)
  sharepoint-lists.md      column names and types
  power-automate-flows.md  both flows, step by step
  copilot-prompts.md       the same flows as Copilot prompts
  flow2-schritt-fuer-schritt.md  flow 2 click by click, German UI labels
  flow3-schritt-fuer-schritt.md  flow 3 click by click, Outlook event on new session
  flow-kalender-session.md       flows C and D: calendar event and invitation batch
  deployment.md            worker and Pages setup
  typo3-embed.md           iframe snippet with auto-height
.github/workflows/deploy.yml
```

## Where the setup stands

```bash
node worker/check-contract.mjs status
```

Checks everything reachable from your machine and lists what is left. Run it
whenever you are unsure what to do next.

## Setup order

The pieces depend on each other, so build them in this order.

1. **SharePoint lists** with the exact internal column names.
   See [docs/sharepoint-lists.md](docs/sharepoint-lists.md).
2. **Three Power Automate flows.** Check the premium licence question at the top
   of [docs/power-automate-flows.md](docs/power-automate-flows.md) first, it is
   the one thing that can block the whole approach.
3. **Cloudflare Worker**, with both flow URLs as secrets.
   See [docs/deployment.md](docs/deployment.md).
4. **GitHub Pages**, with the worker URL as a repository variable.
5. **TYPO3 iframe.** See [docs/typo3-embed.md](docs/typo3-embed.md).

## How sessions work

A session is a date with a number of places. In SharePoint that is **one row in
`Sessions`** with `MaxPlaces`, and nothing else has to exist up front.

Students see the date and a counter.

```
Mittwoch, 26. September 2026
13:00 - 17:30 · Raum 62-101            noch 3 von 5 Plätzen frei   [auswählen]
```

Registering creates **one row in `Registrations`**. The counter is `MaxPlaces`
minus the number of rows with that date, computed in the worker.

The exact presentation time is not modelled and not promised. It gets
communicated by hand once the session is full, which takes a few minutes and
removes an entire class of complexity from the system.

### What this replaced

Earlier versions pre-created five placeholder rows per session and flipped an
`IsAvailable` flag. That meant a generator flow, empty rows cluttering the list,
and individual times that every layer had to convert between UTC and local.

Now a session is one row you type in ten seconds, the registrations list
contains only real registrations, and no timestamp is converted anywhere.

## API contract

The worker exposes two endpoints. Flow 1 must answer in exactly this shape, the
mapping happens in its Select actions.

Flow 1 returns three arrays, and the worker turns them into the counter:

```json
{
  "sessions": [
    { "key": "2026-09-26", "date": "2026-09-26", "time": "13:00 - 17:30",
      "room": "62-101", "maxPlaces": 5, "isOpen": true }
  ],
  "registrations": [{ "date": "2026-09-26" }, { "date": "2026-09-26" }],
  "supervisors": [{ "id": 7, "name": "Prof. Dr. Ivo Blohm", "isActive": true }]
}
```

The `registrations` array carries dates and nothing else. That is deliberate.
Counting happens in the worker precisely so the registration rows never have to
expose a name or an address.

`GET /api/sessions` then answers:

```json
{
  "sessions": [
    { "key": "2026-09-26", "date": "2026-09-26", "time": "13:00 - 17:30",
      "room": "62-101", "freeCount": 3, "totalCount": 5 }
  ],
  "supervisors": [{ "id": 7, "name": "Prof. Dr. Ivo Blohm" }]
}
```

Past, closed and full sessions are dropped. No row ids leave the worker, so the
browser cannot address an individual registration.

`POST /api/register`

```json
{
  "sessionKey": "2026-09-26",
  "firstName": "Anna",
  "lastName": "Muster",
  "email": "anna.muster@student.unisg.ch",
  "matriculation": "20-123-456",
  "thesisType": "Master",
  "presentationType": "Final",
  "thesisTitle": "…",
  "supervisorId": 7
}
```

Answers `200 {"ok": true, "slot": {"date": "2026-09-26", "time": "13:00 -
17:30", "room": "62-101"}}`, or `409 {"error": "session_full"}`, or
`400 {"error": "invalid_field", "field": "email"}` on bad input.

## What happens on a collision

Two students submitting within the same second both count four registrations,
both pass the check, and both create a row. You get six registrations for five
places.

That is visible and harmless. Nothing is overwritten and no data is lost, you
see one row too many and write to one person.

This is a deliberate trade. The earlier design locked an `IsAvailable` flag on a
pre-created row, which prevented the overcount but failed the other way when the
lock was skipped, silently destroying one registration. An extra row you can see
beats a lost row you cannot.

`docs/power-automate-flows.md` describes an airtight variant with a re-count
after the insert, if the volume ever justifies it.

## What is not built in

No confirmation email to the student. Add a **Send an email (V2)** action to
the registration flow if you want one, it is two minutes of work in the flow
designer and needs no change here.

No cancellation or rescheduling. Deleting the row in `Registrations` frees the
place again, and the counter follows on the next page load.

No authentication. Anyone who can reach the TYPO3 page can register. Matching
registrations against an actual student register would need a login, which
means Entra ID and a different hosting model than GitHub Pages.
