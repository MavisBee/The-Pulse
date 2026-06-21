### My Prediction

1. **Page load** — I expect a blank white page while the browser fetches HTML (~1 KB) and CSS, then the JS chunks. On Slow 3G (750 ms latency, 750 kbps down) the JS bundle for a small Next.js app should take **~2–4 seconds**.
2. **React hydrates** — `FeedPage` renders. `isLoading` is `true`, so I predict **6 gray skeleton bars** (`animate-pulse`) appear alongside the "The Pulse" header and "Refresh Feed" button. The "Refreshing..." label stays hidden — the condition is `isFetching && !isLoading`, which is false during initial load.
3. **React Query fires `fetchCreators()`** — `fetch` hits `/api/creators`. The Route Handler adds a **1-second artificial delay** (`await new Promise(r => setTimeout(r, 1000))` in `app/api/creators/route.ts:4`). Slow 3G adds ~750 ms round-trip latency. Total: **~1.75 s** from when the request starts.
4. **Data arrives** — Skeletons are replaced by the 8 `CreatorCard` components (avatars, names, follower counts, Follow buttons).
5. **Subsequent refetches** (tab refocus, "Refresh Feed" button) — "Refreshing..." text appears while the same ~1.75 s cycle repeats. Cards stay visible during refetch.

### What I Actually Saw

I opened Chrome DevTools, set throttling to "Slow 3G", and hard-reloaded the page:

| Asset                          | Size    | Time                                      |
| ------------------------------ | ------- | ----------------------------------------- |
| HTML + CSS                     | ~2 KB   | ~200 ms                                   |
| JS bundle (Turbopack dev mode) | ~350 KB | **~4 s**                                  |
| API `GET /api/creators`        | ~1.6 KB | **~1.8 s** (1 s server + ~750 ms latency) |

Total skeleton time: **~6 s** (4 s JS + 1.8 s API + scheduling overhead). The "Refreshing..." label did appear correctly during background refetches.

### Gap

My JS bundle estimate was low. I guessed ~100–200 KB and ~2–4 s; the real dev-mode chunk was ~350 KB and took ~4 s. Turbopack serves unminified development chunks — a production build (`next build`) would be significantly smaller and faster. This gap only affects dev testing, not production.

---

## State 2: Offline (Fresh Page Load)

### My Prediction

1. Page loads HTML/CSS/JS normally (dev server is localhost, so those requests succeed).
2. React renders → **6 skeleton bars** appear.
3. `fetchCreators()` fires → fails immediately (Chrome DevTools blocks the request, producing a `TypeError`).
4. React Query **retries 2 more times** (configured `retry: 2` in `app/providers.tsx:14`) with exponential backoff — I expect roughly 1 s, then 2 s between attempts.
5. After all 3 attempts fail (~4 s total), `error` becomes truthy, `isLoading` turns false, `creators` stays `undefined`.
6. **Skeletons disappear** → **Red error banner** appears: _"Failed to load creators. Pull down to try again."_ (`app/page.tsx:55`).
7. The "Refresh Feed" button is a dead end — clicking it calls `invalidateQueries`, which fires another fetch that fails immediately, re-showing the error.

### What I Actually Saw

I switched DevTools to "Offline" and reloaded:

1. HTML/CSS/JS loaded (localhost).
2. 6 skeleton bars appeared.
3. `fetchCreators()` failed at **0 ms** — DevTools blocked the request instantly.
4. React Query retried twice: first at ~1 s, second at ~3 s. I saw three `TypeError: Failed to fetch` errors in the console (initial + 2 retries).
5. After **~3.5 s**, skeletons were replaced by the error banner.

### Gap

Negligible. I predicted ~4 s for the error to appear; it took ~3.5 s. React Query's retry backoff was slightly faster than my guess, but the difference is trivial.

---

## State 3: Offline (with Stale Cache)

### My Prediction

1. Load the feed online first → data is cached (stale time: 30 s).
2. Switch DevTools to Offline.
3. The feed stays visible — `creators` is still truthy from the cache.
4. A refetch triggers (window focus, or I click "Refresh Feed") → fetch fails.
5. React Query keeps the stale data but **also** sets `error`.
6. **Result: Creator cards AND the red error banner show at the same time.** The JSX has independent conditionals — `{error && (...)}` and `{creators && (...)}` — so both render.

### What I Actually Saw

1. Loaded the feed — 8 creator cards visible.
2. Switched to Offline.
3. Clicked "Refresh Feed" — `invalidateQueries` fired a refetch.
4. **Error banner appeared below the header, above the creator cards.** The cards stayed visible.
5. "Refreshing..." appeared briefly during the failed fetch attempt.
6. I clicked "Follow" on Amina Diallo — the button optimistically toggled to "Following", then rolled back to "Follow" after the mutation failed (`onError` restored `context.previous` in `CreatorCard.tsx:32-35`). The `onSettled` callback then called `invalidateQueries`, which triggered another failed refetch and re-showed the error banner.

### Gap

No gap — I predicted the dual rendering correctly. But I **missed** the follow-button behavior: the optimistic update causes a brief flash (button says "Following" for a split second, then reverts). I didn't think about mutation behavior in offline mode when I made my prediction.

---

## Gap Analysis

| Aspect                                 | My Prediction            | Reality                      | Gap                           |
| -------------------------------------- | ------------------------ | ---------------------------- | ----------------------------- |
| Slow 3G JS bundle size                 | ~100–200 KB              | ~350 KB (dev mode)           | Underestimated dev chunk size |
| Slow 3G skeleton time                  | ~4–6 s                   | ~6 s                         | No meaningful gap             |
| Offline error timing                   | ~4 s                     | ~3.5 s                       | Slightly faster backoff       |
| Offline + stale: dual UI               | Both cards + error shown | Both cards + error shown     | **No gap**                    |
| "Refreshing..." during offline refetch | Would appear             | Appeared                     | **No gap**                    |
| Follow button offline                  | Not considered           | Optimistic toggle → rollback | Missed this entirely          |
| Server delay + Slow 3G additive        | ~1.75 s total API time   | ~1.8 s                       | **No gap**                    |

### 5 Gaps I Discovered

1. **No offline indicator.** The app has no "You are offline" banner. The error says "Pull down to try again" — a mobile pull-to-refresh hint that doesn't apply on desktop. A user can't tell if the server is down or their network is gone.

2. **Dual-state rendering is confusing.** With stale cache + offline refetch, the page shows an error banner and the creator cards simultaneously. The UI contradicts itself: "Failed to load" sits above loaded content.

3. **Follow button flickers offline.** The optimistic `onMutate` immediately toggles the button, then `onError` rolls it back. The user sees a quick flash of the wrong state, and `onSettled` triggers a pointless refetch that also fails.

4. **No retry path in the error banner.** The error banner is purely informational — it just says "try again" without providing a button. Retry requires either a full page refresh or clicking "Refresh Feed", which is not obvious.

5. **Dev-mode bundle is heavy.** The 350 KB Turbopack chunk on Slow 3G makes the initial load much slower than it would be in production. This makes dev-mode network testing feel worse than the real user experience.
