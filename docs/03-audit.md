# Audit: Five Failure Modes

---

## 1. Race conditions when clicking Follow multiple times fast

**Vulnerability: sequential optimistic updates overwrite each other's rollback snapshot.**

The button is disabled while `mutation.isPending` is true — `components/CreatorCard.tsx:77`. This prevents simultaneous clicks. But the race window opens *between mutations*, once `isPending` flips back to `false`. Here is the sequence that breaks:

1. Click Follow on creator A. `onMutate` fires. Snapshot S1 is saved (A: not-followed). Cache flipped (A: followed). Server call starts.
2. Server responds (1 second later). `onSettled` fires → invalidates `["creators"]` → triggers a background refetch. `isPending` becomes `false`.
3. User clicks Follow on creator A again (the refetch from step 2 is still in flight). Second mutation's `onMutate` fires.
4. `cancelQueries({ queryKey: ["creators"] })` — line 14 — cancels the in-flight refetch. Good.
5. `const previous = queryClient.getQueryData(...)` — line 16 — this reads the cache *after* the first mutation already optimistically updated it. Snapshot S2 is saved (A: followed).
6. Cache flipped again (A: not-followed).
7. Second server call fails (network drop). `onError` fires.
8. Rollback: `queryClient.setQueryData(["creators"], context.previous)` — line 34 — restores S2 (A: followed).

**Result**: The second mutation failed and the rollback puts A back to "followed" — but the server never received the second request, so the real server state is "not-followed." The cache says followed; the server says not-followed. They are desynced until the next successful refetch.

The root cause is that `previous` is a snapshot of the cache, not a snapshot of the server. Each mutation snapshots whatever the previous mutation left behind, so the rollback chain is built on sand.

**A second race: the mock server itself**. `lib/mock.ts:86-92` mutates a shared array directly:

```ts
export function toggleFollowCreator(id: string): Creator | undefined {
  const creator = creators.find((c) => c.id === id);
  if (creator) {
    creator.isFollowing = !creator.isFollowing;
    creator.followers += creator.isFollowing ? 1 : -1;
  }
  return creator;
}
```

Two concurrent POST requests to `/api/creators/1/follow` both toggle the same module-level array. If request A and B arrive within the same millisecond, both read `isFollowing=false`, both flip to `true`, both return `isFollowing=true` — the net effect is followed (correct by luck). But if they arrive 500ms apart (the simulated delay), A flips to `true`, B flips back to `false`. The client sees one response saying `true` and one saying `false` — and `onSettled` fires twice, causing two invalidations. The second invalidation's refetch wins, and the cache ends up matching the server, but the user saw a flash of the wrong state.

---

## 2. What happens to stale data after the user logs out

**Vulnerability: there is no logout mechanism, so no stale data is ever cleared.**

The app has no authentication, no session state, no user context. But assume one is added later. The cache is completely unaware of user identity:

- `app/providers.tsx:21` — the `QueryClient` is created once in `useState` and lives for the lifetime of the React tree. There is no `queryClient.clear()` call anywhere.
- `components/CreatorCard.tsx:16` — the cache stores `["creators"]` data including `isFollowing: boolean`, which is user-specific state. When User A logs out and User B logs in, User B sees User A's follow relationships until `staleTime` (30 seconds) triggers a background refetch.
- `components/CreatorCard.tsx:43-47` — hover prefetches create `["creator", id]` entries. These are also user-agnostic. If User A hovered over 30 creator cards, those 30 cache entries persist for the full `gcTime` (default 5 minutes) after the last observer unmounts. User B would briefly see User A's prefetched data.

The fix would be to scope query keys to the user ID: `["creators", userId]`. Without that, stale cross-user data leaks through.

**What the user sees**: nothing visible changes. The data on screen looks correct because it was correct for User A. But User B is seeing User A's follow state until the background refetch completes. For 30 seconds (or until a manual refresh), the UI lies about who is followed.

---

## 3. Memory leaks from unbounded cache growth

**Vulnerability: `gcTime` is not configured, and prefetching is unbounded.**

The relevant lines:

- `app/providers.tsx:9-17` — the `QueryClient` config sets `staleTime: 30_000` and `retry: 2`, but **does not set `gcTime`**. The default `gcTime` is 5 minutes (300,000 ms). After 5 minutes of no components observing a query key, the data is garbage collected. This is acceptable for the list query, but problematic for prefetches.

- `components/CreatorCard.tsx:43-47` — every hover over a creator card creates a cache entry under `["creator", creator.id]`. With 8 creators, that's up to 8 extra entries. With 800 creators and a user who rapidly scrolls through them all, that's 800 entries, each holding a full Creator object. If each Creator object is ~500 bytes, 800 entries = ~400 KB — negligible. But if each entry includes additional data (posts, comments, analytics), the memory footprint grows linearly with the number of creators hovered.

- `app/page.tsx:10-13` — the `["creators"]` query has a permanent observer (the feed page is always mounted while viewing the feed), so it **never** garbage collects. This is correct — you want the feed data always available. But it means that entry occupies memory for the entire session.

- The feed itself is a list of 8 objects. Not a real leak. But the pattern scales poorly: if the feed had 10,000 creators and the user scrolled through all of them (rendering 10,000 `CreatorCard` components), each hover would prefetch a `["creator", id]` entry that lives for 5 minutes. That's 10,000 cache entries × ~500 bytes = ~5 MB. Not catastrophic, but unbounded by design.

- **Hidden leak**: the `["creators"]` cache entry stores its data as a plain array. React Query keeps the data in memory along with its structural sharing references. If `fetchCreators` returns a new array reference every time (and it does — `lib/mock.ts:79` uses `.map()` which creates a new array), the old array is garbage collected. But React Query's structural sharing means deeply equal objects reuse references. The mock creates fresh objects each time, so old allocations pile up until GC runs.

**Practical severity**: low for 8 creators. High for a real app with thousands of creators, no pagination, and no `gcTime` tuning.

---

## 4. Over-fetching when the app remounts

**Vulnerability: no `refetchOnMount` override combined with `refetchOnWindowFocus: true` creates redundant network requests.**

The relevant lines:

- `app/providers.tsx:13` — `refetchOnWindowFocus: true` is applied globally. Every query in the app refetches when the window regains focus. If the page has 10 separate queries (creators list + 9 hover-prefetched creator details), all 10 fire a fetch request on focus. On a slow network, these queue up and compete for bandwidth.

- `app/page.tsx:10-13` — the `useQuery` call uses the defaults for `refetchOnMount` and `refetchOnWindowFocus`. Since `staleTime` is 30 seconds, if the component mounts within 30 seconds of the last fetch, no refetch happens (data is fresh). If it mounts after 30 seconds, refetch fires. This is sensible.

- The over-fetching scenario: a user navigates to a creator detail page (feed unmounts), spends 40 seconds there, then navigates back to the feed (feed remounts). The `["creators"]` data is stale (40s > 30s staleTime), so React Query refetches. The user sees cached data immediately (stale-while-revalidate) while the refetch runs. This is the intended design, not waste.

- **Real waste**: `refetchOnWindowFocus` combined with short `staleTime`. If the user is on a slow connection and flicks between two tabs every 20 seconds, the `["creators"]` query refetches every time (20s < 30s staleTime, but the feed component was mounted for only 20 seconds before the user switched, so the data was still fresh when they left, but when they return, `refetchOnWindowFocus` fires anyway — actually, React Query checks staleTime: if the data is still fresh (<30s), it skips the refetch. So flicking every 20 seconds does NOT cause over-fetching. Flicking every 31 seconds DOES cause a refetch every time.

**Worst case**: `staleTime` of 30 seconds + user switches tabs every 35 seconds. Each switch triggers a full refetch of the creator list, plus all prefetched creator details (if they were hovered and have their own `staleTime: 30_000`). Over a 10-minute session at 35-second intervals: ~17 refetches of 1 query + up to 8 detail queries = up to 153 network requests for no visible benefit.

---

## 5. What users see when the network fails mid-mutation

**Vulnerability: the mutation fails silently — no error message is shown to the user.**

The execution path on network failure:

1. User clicks Follow. Button shows `"..."` — `components/CreatorCard.tsx:84`.
2. `onMutate` fires (line 13). Cache is optimistically updated. But the `cancelQueries` call on line 14 makes its own network request... wait, no — `cancelQueries` just cancels in-flight React Query refetches, it doesn't touch the network.
3. The `mutationFn` (line 12) calls `followCreator(creator.id)` — `lib/api.ts:17-22`. This performs a `fetch`. The network is down. The `fetch` throws a `TypeError: Failed to fetch`.
4. `onError` fires (line 32-36). It restores the `previous` snapshot, reverting the optimistic update. The button snaps back to its pre-click state.
5. `onSettled` fires (line 37-39). It calls `invalidateQueries`, which marks `["creators"]` as stale and triggers a background refetch. This refetch also fails (network is still down).
6. The feed's `useQuery` (page.tsx:10-13) receives the error from the failed refetch. The `error` variable is set.

**What the user sees**:

- The button snapped back to "Follow" (from step 4). The follower count reverted. The `"..."` is gone.
- There is **no visual indication that anything went wrong** at the card level. No toast. No inline error. No "Try again" on the button.
- If the `["creators"]` cache still has valid data (the rollback restored it), the feed continues to display the old list. The `error` variable from the failed refetch is set, so the error banner at `app/page.tsx:53-56` renders: a red box saying "Failed to load creators. Pull down to try again."
- But the user sees the red banner **above** the list of creators that clearly loaded fine. This is confusing: the creators are visible, yet there's an error saying they failed to load.

**The confusing state**: `creators` is a non-empty array (from the optimistic rollback), `error` is set (from the failed refetch), `isLoading` is false, `isFetching` is false. The user sees both the creator list AND the error banner simultaneously. The banner says "Pull down to try again" but there's no pull-to-refresh mechanism — only the Refresh Feed button.

**The mutation's `onError` also swallows the error**: the `_err` parameter is never logged, never displayed, never surfaced:

```tsx
onError: (_err, _vars, context) => {
  if (context?.previous) {
    queryClient.setQueryData(["creators"], context.previous);
  }
},
```

The underscore prefix (`_err`) signals "intentionally unused." The error is discarded. In production, this would make debugging network issues impossible without additional monitoring.

**Summary of user-visible states on network failure mid-mutation**:

| Moment | What the user sees | Is it clear? |
|--------|-------------------|--------------|
| Click Follow | Button shows "..." | Yes |
| Network fails | Button snaps back to "Follow" | Can look like a glitch |
| After rollback | Old data + red error banner "Failed to load creators" | Confusing — data is there but error says otherwise |
| Dismiss / Refresh | Error persists until next successful fetch | No recovery hint |

---

## Severity matrix

| Issue | Severity | Likelihood | Mitigation cost |
|-------|----------|------------|-----------------|
| Rapid double-click race | Medium | Low (button is disabled during mutation, but window exists between mutations) | Low — add mutation key or disable button until refetch completes |
| No cache clear on logout | High | Depends on auth being added | Low — call `queryClient.clear()` on logout |
| Unbounded prefetch cache | Low | Low for 8 creators, high for thousands | Low — set `gcTime` explicitly or limit prefetch count |
| Over-fetching on focus + remount | Medium | Moderate (user switching tabs) | Low — tune `staleTime` or set `refetchOnWindowFocus: 'always'` vs `false` per query |
| Silent mutation failure | High | High (Lagos network) | Medium — surface error to user via toast or inline state |
