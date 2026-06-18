# Dinner Forecast — The Holme Valley Almanac

Recency-weighted, day-of-week predictor of the next seven dinners. Samples
rather than averages, applies anti-repetition + a modest balance nudge, lets you
swap any night, builds a shopping list, and commits a confirmed week back into
history. State persists in Supabase.

## Stack
Next.js (App Router) · Supabase (Postgres) · lucide-react · deploy on Vercel.

## Supabase — already provisioned
- Project ref: `mvedaurabbwemlqdzwml` (region eu-west-1)
- Table `public.meal_state` (single jsonb row) is created with RLS + anon
  read/write policies. Schema is in `supabase/migrations/0001_init.sql`.
- URL + anon key are baked into `lib/supabase.js` as defaults (the anon key is
  public by design; RLS protects the data). Override via env if you prefer:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

So there is **no Supabase setup left** — `npm install && npm run dev` just works.

## Go live — two paths

### A. GitHub + Vercel (your usual stack)
The repo is already a git repo with commits. Push it, then import in Vercel:
```bash
git remote add origin git@github.com:<you>/dinner-forecast.git
git push -u origin main
```
Then Vercel → New Project → import the repo → Deploy. No env vars required
(creds are baked); add the two NEXT_PUBLIC_SUPABASE_* vars only if you want to
override them.

### B. Fastest, no GitHub
From the project root:
```bash
npx vercel deploy --prod
```
and follow the prompts.

## How the model works
Per upcoming weekday it builds a recency-weighted distribution over what you've
eaten on that day, tilts gently (veg lean, soft cap on a second treat),
penalises recent repeats and same-protein/cuisine back-to-back, occasionally
explores, then samples. Four sliders expose the whole model. Confirm logs the
week as the newest history so next week's prediction learns from it.
