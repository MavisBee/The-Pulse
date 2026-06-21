# Lie Detector: Caching

Five statements about how caching works in this app. Four are true. One is a lie.

## The Statements

**1.** The app's `staleTime: 30_000` config means React Query will skip refetching for 30 seconds after the last successful fetch, even if the user refocuses the browser tab.

**2.** When the follow mutation fails (e.g. offline), `onError` restores the query cache to the snapshot saved in `context.previous`, undoing the optimistic update.

**3.** The API route handlers (`/api/creators`) set a `Cache-Control: max-age=30` HTTP header so the browser caches responses for 30 seconds independently of React Query.

**4.** Hovering over a CreatorCard triggers `prefetchQuery` for that creator's individual data, which caches it under `['creator', creator.id]` with a 30-second stale time.

**5.** After a successful mutation, `onSettled` calls `invalidateQueries`, which marks the creators query stale and triggers a background refetch to sync the cache with the server.

---

## The Lie

**Statement 3** is false. The API routes set no `Cache-Control` headers whatsoever. The 30-second caching window is purely a React Query client-side concern, managed by `staleTime`, not by HTTP cache headers on the server response.
