# Four Caching Principles — Mapped to the Code

---

## 1. Cache invalidation as a hard problem

> **Plain definition**: Once you store data in a cache, knowing exactly *when* to throw that data away and fetch fresh stuff is one of the hardest problems in programming. If you clear too eagerly you lose the benefit of caching. If you clear too late the user sees stale junk. You need a strategy, not a guess.

**Where to see it in the code:**

**Line** `app/page.tsx:30-38` — The manual Refresh button. The user hits it, and we call `invalidateQueries`. This is us admitting we don't know the perfect moment — we hand the choice to the person who does know: the human.

```tsx
<button onClick={() => queryClient.invalidateQueries({ queryKey: ["creators"] })}>
  Refresh Feed
</button>
```

**Line** `components/CreatorCard.tsx:37-39` — After a mutation (follow/unfollow) finishes, `onSettled` always invalidates `["creators"]`. Why not just trust our optimistic update? Because the server might have done something unexpected — maybe the follow count went up by 2 elsewhere, maybe the server rejected it — and we need the real server state to overwrite our guess. This is the "invalidation at the right moment" strategy:

```tsx
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ["creators"] });
},
```

**Line** `app/providers.tsx:12` — `staleTime: 30_000`. This is the least aggressive invalidation: "don't bother re-fetching for 30 seconds." It's a truce with the server — nothing changed that fast, so don't waste a request.

**Line** `app/providers.tsx:13` — `refetchOnWindowFocus: true`. A medium-confidence invalidation: "when the user comes back to the tab, assume the data might be stale." The user walked away for a minute — maybe something happened.

The hard problem is visible in the tension between all three: stale time says "don't fetch", window-focus says "maybe fetch", the button says "definitely fetch", and `onSettled` says "always fetch after a write". There is no single answer — you layer strategies.

---

## 2. Single source of truth for server state

> **Plain definition**: The server is the boss. Whatever the server says is what's true. The cache is not its own reality — it's just a photocopy. When the server speaks (via a fetch or mutation response), its answer overwrites everything local. Never let local state drift so far from the server that you can't tell which one is real.

**Where to see it in the code:**

**Line** `app/page.tsx:10-13` — The `useQuery` call with `queryKey: ["creators"]`. This declares: "React Query, you are now the single source of truth for creator data." Every component that needs the creator list reads from this one cache entry — there is no second copy in a `useState` or a Redux store.

```tsx
const { data: creators, isLoading, isFetching, error } = useQuery({
  queryKey: ["creators"],
  queryFn: fetchCreators,
});
```

**Line** `components/CreatorCard.tsx:16` — Before the optimistic update fires, we take a snapshot of the single source of truth:

```tsx
const previous = queryClient.getQueryData<Creator[]>(["creators"]);
```

This only works because `["creators"]` is where the truth lives. If we had scattered the data across multiple state variables, we'd have to snapshot each one. One key, one snapshot.

**Line** `components/CreatorCard.tsx:18-28` — The optimistic update writes directly into the single source of truth. It does not create a parallel copy:

```tsx
queryClient.setQueryData<Creator[]>(["creators"], (old) =>
  old?.map((c) =>
    c.id === creator.id ? { ...c, isFollowing: !c.isFollowing, followers: ... } : c
  )
);
```

**Line** `components/CreatorCard.tsx:38` — `onSettled` invalidates the single source of truth, forcing it to re-sync with the real boss (the server):

```tsx
queryClient.invalidateQueries({ queryKey: ["creators"] });
```

**Line** `components/CreatorCard.tsx:33-35` — The rollback restores the single source of truth to its previous state. There is no other copy to worry about:

```tsx
onError: (_err, _vars, context) => {
  if (context?.previous) {
    queryClient.setQueryData(["creators"], context.previous);
  }
},
```

The principle in action: the cache is a photocopy of the server. We optimistically edit the photocopy (lines 18-28). If the server disagrees (onError), we revert the photocopy (lines 33-35). If the server agrees (onSettled), we fetch a fresh photocopy anyway (line 38). The server is always the final word.

---

## 3. Optimistic UI as a trust contract

> **Plain definition**: Optimistic UI means you show the user what you *believe* will happen before the server confirms it. It's a trust contract: you promise the user that your guess is extremely likely to be right, and you promise that if it's wrong you will fix it immediately and transparently. The contract is broken if the UI lies and doesn't correct itself.

**Where to see it in the code:**

**Line** `components/CreatorCard.tsx:12` — The mutation function is the promise we make to the server ("we will send this request"):

```tsx
mutationFn: () => followCreator(creator.id),
```

**Line** `components/CreatorCard.tsx:13-31` — `onMutate` is where we show the user the result *before* the server answers. This is the "trust me, I'm confident" part of the contract:

```tsx
onMutate: async () => {
  await queryClient.cancelQueries({ queryKey: ["creators"] });
  const previous = queryClient.getQueryData<Creator[]>(["creators"]);
  queryClient.setQueryData<Creator[]>(["creators"], (old) =>
    old?.map((c) =>
      c.id === creator.id
        ? { ...c, isFollowing: !c.isFollowing, followers: c.followers + (c.isFollowing ? -1 : 1) }
        : c
    )
  );
  return { previous };
},
```

**Line** `components/CreatorCard.tsx:32-36` — `onError` is the contract's safety net. If the server says no, we put everything back exactly as it was:

```tsx
onError: (_err, _vars, context) => {
  if (context?.previous) {
    queryClient.setQueryData(["creators"], context.previous);
  }
},
```

**Line** `components/CreatorCard.tsx:37-39` — `onSettled` is the cleanup that ensures the cache eventually matches the server, making the contract honest in the long run:

```tsx
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ["creators"] });
},
```

**Line** `components/CreatorCard.tsx:75-89` — The button is the user-facing side of the contract. While the server is thinking, the button is disabled but still shows the *optimistic* state ("Following" not "Follow"):

```tsx
<button
  onClick={() => mutation.mutate()}
  disabled={mutation.isPending}
  className={...}
>
  {mutation.isPending ? "..." : creator.isFollowing ? "Following" : "Follow"}
</button>
```

The trust contract broken down:
- **Promise**: "I will show you the new state immediately." (lines 18-28)
- **Bailout**: "If I'm wrong, I'll put it back." (lines 32-36)
- **Reconciliation**: "Then I'll fetch the real truth from the server." (lines 37-39)

---

## 4. Stale-while-revalidate as a strategy

> **Plain definition**: A caching strategy where you never make the user wait. When data is requested: if you have *any* cached data — even if it's old — you show it immediately (stale). Then, in the background, you fetch fresh data (revalidate). The user sees something on screen instantly every time, except the very first visit. Stale is better than blank.

**Where to see it in the code:**

**Line** `app/providers.tsx:12` — The strategy's trigger. `staleTime: 30_000` means: for 30 seconds after a fetch, the cache is considered fresh and React Query won't even revalidate. After 30 seconds, the cache is stale, but React Query *still serves it immediately* while revalidating in the background:

```tsx
staleTime: 30_000,
```

**Line** `app/page.tsx:26-28` — The visual proof of the strategy. While the stale data is on screen and the revalidation happens in the background, we show a subtle "Refreshing..." indicator:

```tsx
{isFetching && !isLoading && (
  <span className="text-sm text-zinc-400">Refreshing...</span>
)}
```

**Line** `app/page.tsx:59` — The key behavior: we render `creators` as soon as it has *any* value, even stale. Without stale-while-revalidate, we'd check `isLoading` and show a spinner. With it, we show data and only show a spinner on the *first* load (lines 42-50):

```tsx
{creators && (
  <div className="flex flex-col gap-3">
    {creators.map((creator) => (
      <CreatorCard key={creator.id} creator={creator} />
    ))}
  </div>
)}
```

**Line** `app/providers.tsx:13` — `refetchOnWindowFocus: true` is another revalidation trigger for the strategy. When the user returns to the tab, stale data is shown instantly and revalidation fires in the background:

```tsx
refetchOnWindowFocus: true,
```

**Line** `components/CreatorCard.tsx:42-48` — Prefetching on hover is stale-while-revalidate applied *proactively*. Before the user even navigates to a detail page, we fetch the data and cache it. When they do navigate, the data is either fresh (< 30s) or stale but instantly available, with a background revalidation queued:

```tsx
function handlePrefetch() {
  queryClient.prefetchQuery({
    queryKey: ["creator", creator.id],
    queryFn: () => fetchCreator(creator.id),
    staleTime: 30_000,
  });
}
```

The strategy's flow:
1. User opens the page → first load shows skeleton (because there is zero cached data).
2. Data arrives → stored in cache with `staleTime: 30_000`.
3. User clicks "Refresh Feed" after 60 seconds → stale data shows immediately, "Refreshing..." appears, cache updates silently after 1 second.
4. User switches tabs and comes back → same as step 3, triggered by `refetchOnWindowFocus`.
5. User hovers a card → detail data is prefetched and cached. If they navigate to detail, it's instant.

Stale is never hidden from the user — the "Refreshing..." indicator is the honesty that makes the strategy trustworthy.
