# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Dinner Forecast — The Holme Valley Almanac** is a single-page Next.js app that
predicts the next seven dinners. It's a personal, single-family tool: a
recency-weighted, day-of-week-conditioned model that *samples* from what you
actually eat (rather than averaging to the modal week), applies anti-repetition
constraints, a small exploration term, and a tunable nudge toward balance. You
can swap any night, build a deduplicated shopping list, and confirm a week back
into history so the next forecast learns from it.

State persists in Supabase (a single JSON row), so the whole household shares
one dataset across devices.

## Stack

- **Next.js 14** (App Router) — `app/` directory
- **React 18** — the entire UI is one client component
- **Supabase** (`@supabase/supabase-js`) — Postgres, single-row JSON store
- **lucide-react** — icons
- **Anthropic Messages API** — optional, client-side, for ingredient suggestions
- Deploys on **Vercel**

There is no TypeScript, no test framework, no CSS framework, and no component
library. Styling is a single CSS template string inside `app/page.js` plus a
tiny `app/globals.css` reset.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server (http://localhost:3000)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # next lint
```

Supabase is already provisioned and credentials are baked into
`lib/supabase.js`, so `npm install && npm run dev` works with no extra setup.

## Layout

```
app/
  layout.js      Root layout + metadata (server component)
  page.js        The ENTIRE app — model, UI, and CSS (one client component)
  globals.css    Minimal reset + page background
lib/
  supabase.js    Supabase client (creds baked in, env-overridable)
  store.js       loadState / saveState against the single meal_state row
supabase/
  migrations/
    0001_init.sql   meal_state table + RLS policies
next.config.mjs  reactStrictMode: true
jsconfig.json    baseUrl "." for absolute imports
```

`app/page.js` is ~1200 lines and is where almost all work happens. It contains
the forecasting engine, the React component, helper functions, and the CSS. When
asked to change behavior or appearance, this is almost certainly the file.

## How the model works (`generatePlan` in `app/page.js`)

For each upcoming weekday (a fixed Monday→Sunday week starting from
`mondayOfWeek`), the engine:

1. **Builds a base distribution** over meals eaten on that day-of-week,
   recency-weighted (`recency(weeksAgo) = 0.5 ^ (weeksAgo / halfLife)`). Fish is
   excluded everywhere (no one in this house eats it). With no week history it
   does a uniform "cold start" shuffle of the library; with no data for a
   specific day it falls back to the overall rotation.
2. **Applies a normative tilt** — leans toward `hasVeg` meals and away from a
   second `isTreat` night, scaled by the `nudge` param.
3. **Applies anti-repetition** — heavily penalizes meals inside `repeatWindow`,
   and softly penalizes back-to-back same `protein` / same `cuisine`.
4. **Occasionally explores** (`epsilon` chance) — slots in something not eaten
   lately to widen the rotation.
5. **Samples** with a seeded RNG (`mulberry32`) so a given `seed` is
   reproducible. Re-roll bumps the seed.

Each result carries a `prob`, top-4 `candidates`, a human `rationale`, and any
`tilt` reasons, which the UI surfaces per day.

### Model params (the four sliders)

- `halfLife` — how fast older weeks fade (weeks)
- `nudge` — strength of the veg-lean / treat-cap tilt (0–1)
- `epsilon` — exploration probability (0–0.4)
- `repeatWindow` — days before a meal can return

## Data model

All app state is one object persisted to `public.meal_state` under the single
row id `"default"`:

- `library` — array of meal objects: `{ id, name, protein, cuisine, isTreat,
  hasVeg, isOilyFish, isSkip, ingredients[] }`
- `weeks` — array of weeks, newest first; each week is 7 meal ids (Mon→Sun),
  empty string for a blank cell
- `params` — the four model params above
- `cleared` — flag so a deliberately emptied dataset isn't re-seeded

Meal tags are auto-guessed from the name by `autoTag` on add, and drive the
variety/balance logic. Ingredients (which feed the shopping list) come from
`guessIngredients` (deterministic) or, on request, `aiIngredients` (Anthropic
API). A meal named exactly "skip" becomes a skip night (leftovers / out), which
is exempt from anti-repetition.

On first ever load, `seedData()` populates a realistic example library and six
weeks of synthetic history.

## Persistence (`lib/store.js`)

- `loadState()` reads the `data` column of the `"default"` row; returns `null`
  on miss or error.
- `saveState(state)` upserts the whole state blob plus `updated_at`.
- The component loads once on mount, then debounces saves (~600ms) on any change
  to `library`, `weeks`, or `params`, surfacing a "Saving… / Saved ✓ / Couldn't
  save" status.

## Conventions

- **JavaScript only** (no TS). React function components and hooks.
- **`"use client"`** at the top of `app/page.js`; `layout.js` stays a server
  component.
- **All styling lives in the `CSS` template string** at the bottom of
  `app/page.js`, scoped under `.dfc`. Use the existing CSS variables (`--ink`,
  `--paper`, `--amber`, `--sage`, etc.) and the established fonts (Fraunces,
  Inter, Space Mono). Don't introduce a CSS framework.
- **Absolute-ish imports** are not configured beyond `baseUrl: "."`; existing
  code uses relative imports (`../lib/store`). Match that.
- **British English** in user-facing copy (en-GB dates, "chilli", "lasagne").
- Keep the app a single shared dataset — there is no per-user auth.

## Supabase / security notes

- The anon key in `lib/supabase.js` is **public by design** (it ships to the
  browser). Data is protected by RLS, not by hiding the key. Do not treat it as
  a leaked secret.
- RLS policies (`supabase/migrations/0001_init.sql`) are **intentionally open**:
  anonymous read + insert + update on `meal_state`. Anyone with the URL + anon
  key can read/edit. If locking down is ever requested, swap these for Supabase
  Auth policies.
- Override credentials via `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` if needed; otherwise the baked defaults apply.

## Anthropic API usage

`aiIngredients(name)` in `app/page.js` calls the Anthropic Messages API directly
from the browser to suggest ingredients, using model `claude-sonnet-4-6`. It
expects a JSON array back and **always falls back** to `guessIngredients` on any
error, so it must stay non-blocking and optional. If you touch it, keep the
graceful fallback and prefer a current Claude model id.

## Deployment

- Primary: push to GitHub, import in Vercel, Deploy. No env vars required
  (creds are baked); add the two `NEXT_PUBLIC_SUPABASE_*` vars only to override.
- Fast path without GitHub: `npx vercel deploy --prod` from the project root.

## Working agreements

- This is a small, self-contained app. Prefer minimal, surgical edits inside
  `app/page.js` over restructuring.
- There are no automated tests; verify changes by running `npm run dev` and
  exercising the Forecast and History tabs.
- Run `npm run lint` before considering a change done.
- Don't commit real secrets. The Supabase anon key is fine; never add a service
  role key or an Anthropic API key to the repo.
