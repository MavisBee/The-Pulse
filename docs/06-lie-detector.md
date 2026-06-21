# Lie Detector: Caching

Five statements about how caching works in this app. Four are true. One is a lie.

## The Statements

**1.** The app's `staleTime: 30_000` config means React Query will skip refetching for 30 seconds after the last successful fetch, even if the user refocuses the browser tab.

**2.** When the follow mutation fails (e.g. offline), `onError` restores the query cache to the snapshot saved in `context.previous`, undoing the optimistic update.

**3.** The API route handlers (`/api/creators`) set a `Cache-Control: max-age=30` HTTP header so the browser caches responses for 30 seconds independently of React Query.

**4.** Hovering over a CreatorCard triggers `prefetchQuery` for that creator's individual data, which caches it under `['creator', creator.id]` with a 30-second stale time.

**5.** After a successful mutation, `onSettled` calls `invalidateQueries`, which marks the creators query stale and triggers a background refetch to sync the cache with the server.

---

## Investigation

### Statement 1 — TRUE

`staleTime: 30_000` is set globally in `app/providers.tsx:12`. `refetchOnWindowFocus` is `true` (`providers.tsx:13`). React Query's behavior is: refetchOnWindowFocus only refetches when the data is *stale*. Since `staleTime` is 30 s, data stays fresh for 30 seconds after the last successful fetch. Tab refocus within that window does nothing. Verified against TanStack Query v5 docs.

### Statement 2 — TRUE

Confirmed in `components/CreatorCard.tsx:13-35`:

```ts
onMutate: async () => {
  const previous = queryClient.getQueryData<Creator[]>(["creators"]);
  // ... optimistically set new data ...
  return { previous };
},
onError: (_err, _vars, context) => {
  if (context?.previous) {
    queryClient.setQueryData(["creators"], context.previous);
  }
},
```

The cache snapshot is saved via `getQueryData` before mutation, then restored via `setQueryData` on failure.

### Statement 3 — **FALSE (THE LIE)**

No route handler in this app sets any `Cache-Control` header. I checked all three:

| Route | File | Response Header |
|---|---|---|
| `GET /api/creators` | `app/api/creators/route.ts:5` | `Response.json(...)` — no Cache-Control |
| `GET /api/creators/:id` | `app/api/creators/[id]/route.ts:13` | `Response.json(...)` — no Cache-Control |
| `POST /api/creators/:id/follow` | `app/api/creators/[id]/follow/route.ts:13` | `Response.json(...)` — no Cache-Control |

The browser HTTP cache is not involved. Caching is handled entirely by React Query's in-memory cache on the client side. The `staleTime` is a React Query concern, not an HTTP cache directive.

### Statement 4 — TRUE

Confirmed in `components/CreatorCard.tsx:42-48`:

```ts
function handlePrefetch() {
  queryClient.prefetchQuery({
    queryKey: ["creator", creator.id],
    queryFn: () => fetchCreator(creator.id),
    staleTime: 30_000,
  });
}
```

Bound to `onMouseEnter` on the card container (`CreatorCard.tsx:53`). Prefetches on hover and caches with its own 30-second stale window.

### Statement 5 — TRUE

Confirmed in `components/CreatorCard.tsx:37-39`:

```ts
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ["creators"] });
},
```

`onSettled` fires after every mutation attempt (both success and failure). `invalidateQueries` marks the query stale and triggers a background refetch. The statement says "after a successful mutation" — which is a subset of when it actually runs, but not incorrect.

---

## The Lie

**Statement 3** is false. The API routes set no `Cache-Control` headers whatsoever. The 30-second caching window is purely a React Query client-side concern, managed by `staleTime`, not by HTTP cache headers on the server response.
