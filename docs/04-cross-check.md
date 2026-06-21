# Race Conditions and Rollback Edge Cases

This document reviews the optimistic follow/unfollow flow in **The Pulse** and compares the current implementation with a safer production-style approach.

For clarity:

- **Current implementation** refers to the existing code in this repository.
- **Safer implementation** refers to the changes I would make to reduce race conditions and rollback bugs.

## Files involved

| File                                    | Responsibility                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `components/CreatorCard.tsx`            | Runs the optimistic mutation, updates the React Query cache, rolls back on error, and invalidates the feed query. |
| `app/page.tsx`                          | Reads the `creators` query and renders all creator cards.                                                         |
| `app/api/creators/[id]/follow/route.ts` | Handles the follow API request and calls the mock toggle function.                                                |
| `lib/mock.ts`                           | Stores the mock creator list and toggles follow state.                                                            |
| `lib/api.ts`                            | Contains the browser-side fetch helpers.                                                                          |

## Current optimistic update flow

The current `CreatorCard` mutation does the following:

1. Calls `followCreator(creator.id)`.
2. Cancels in-flight `['creators']` queries.
3. Saves the previous `['creators']` cache value.
4. Optimistically flips `isFollowing` for the clicked creator.
5. Optimistically increments or decrements `followers`.
6. Restores the previous full list if the request fails.
7. Invalidates `['creators']` after the request settles.

This is a good demo implementation because it shows the basic optimistic-update pattern. However, several edge cases appear when requests overlap, when other cache entries exist, or when the server state changes outside this one button.

## Race condition 1: toggle APIs are not idempotent

### Current implementation

The client sends a request that means “toggle this creator.” It does not send the desired final state.

The server also performs a toggle:

```ts
creator.isFollowing = !creator.isFollowing;
creator.followers += creator.isFollowing ? 1 : -1;
```

### Why this is risky

A toggle operation depends on the server state at the exact moment the request is processed.

Example:

| Time | Event                                                                               |
| ---- | ----------------------------------------------------------------------------------- |
| T0   | User is not following the creator.                                                  |
| T1   | Request A starts: user intends to follow.                                           |
| T2   | Request B starts from another tab, device, retry, or duplicate trigger.             |
| T3   | Server handles A and toggles `false -> true`.                                       |
| T4   | Server handles B and toggles `true -> false`.                                       |
| T5   | Final server state is unfollowed, even though the user may have intended to follow. |

The button is disabled while its local mutation is pending, which helps prevent normal double-clicks in one card. It does not protect against another browser tab, another device, direct API calls, duplicate requests, or future code that calls the same endpoint from another component.

### Safer implementation

Use an explicit desired state instead of a toggle:

```ts
await setFollowState({ id: creator.id, isFollowing: true });
```

On the server, set the requested state instead of flipping the current state:

```ts
creator.isFollowing = requestedIsFollowing;
```

That makes the operation idempotent. Two `isFollowing: true` requests still end with `isFollowing === true`.

## Race condition 2: full-list rollback can erase newer successful changes

### Current implementation

The mutation stores the whole previous `creators` list before making the optimistic change. If the request fails, it restores that entire list.

### Why this is risky

If something else changes the same list while the mutation is pending, rollback can overwrite that newer change.

Example:

| Time | Event                                                               |
| ---- | ------------------------------------------------------------------- |
| T0   | Cache contains creators A, B, and C.                                |
| T1   | User follows creator A. The whole list is saved as rollback data.   |
| T2   | Creator B changes successfully through another mutation or refresh. |
| T3   | Creator A request fails.                                            |
| T4   | Rollback restores the whole old list from T0.                       |
| T5   | Creator B's valid newer change is lost in the UI cache.             |

### Safer implementation

Save only the affected creator:

```ts
const previousCreator = previousCreators?.find((c) => c.id === creator.id);
```

Then restore only that creator on error:

```ts
queryClient.setQueryData<Creator[]>(["creators"], (current) =>
  current?.map((c) =>
    c.id === creator.id && previousCreator ? previousCreator : c,
  ),
);
```

This keeps unrelated creators from being rolled back accidentally.

## Race condition 3: out-of-order responses can show stale intent

### Current implementation

The optimistic update flips whatever value is currently in the cache. After the mutation settles, it invalidates the list query.

### Why this is risky

If multiple requests overlap, their responses can arrive in a different order than the user's actions.

Example:

| Time | Event                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------- |
| T0   | User is not following.                                                                               |
| T1   | Request A intends to follow.                                                                         |
| T2   | Request B intends to unfollow.                                                                       |
| T3   | B finishes first.                                                                                    |
| T4   | A finishes later.                                                                                    |
| T5   | The UI may briefly or finally reflect the older intent depending on server order and refetch timing. |

### Safer implementation

Use one or more of these protections:

- Send explicit desired state, not a toggle.
- Track the latest local mutation ID per creator.
- Ignore stale mutation responses that are older than the latest intent.
- Use a server-side version or `updatedAt` field.
- Roll back only if the failed mutation still matches the current optimistic value.

## Race condition 4: list cache and detail cache can disagree

### Current implementation

The card prefetches creator detail data under this key:

```ts
["creator", creator.id];
```

The optimistic follow mutation updates only this key:

```ts
["creators"];
```

### Why this is risky

The list can say one thing while the prefetched detail cache says another.

Example:

| Cache key         | Possible state                                                     |
| ----------------- | ------------------------------------------------------------------ |
| `['creators']`    | Creator is optimistically followed.                                |
| `['creator', id]` | Creator is still shown as unfollowed from earlier prefetched data. |

If a detail page later reads `['creator', id]`, it could display stale follow status.

### Safer implementation

Update or invalidate both cache entries:

```ts
queryClient.setQueryData(["creators"], updateCreatorInList);
queryClient.setQueryData(["creator", creator.id], updateSingleCreator);
```

After settlement:

```ts
queryClient.invalidateQueries({ queryKey: ["creators"] });
queryClient.invalidateQueries({ queryKey: ["creator", creator.id] });
```

## Rollback edge case 1: rollback after a newer refresh

### Current implementation

The page has a manual refresh button that invalidates the same `['creators']` query. The mutation also restores an older saved snapshot on error.

### Why this is risky

Example:

| Time | Event                                                          |
| ---- | -------------------------------------------------------------- |
| T0   | User clicks Follow and the mutation saves a rollback snapshot. |
| T1   | User clicks Refresh Feed or another refresh happens.           |
| T2   | Newer server data enters the cache.                            |
| T3   | The follow request fails.                                      |
| T4   | Rollback restores the older T0 snapshot.                       |

The cache can temporarily move backward in time.

### Safer implementation

Before rolling back, check whether the cache still contains the optimistic value from this mutation. If the cache has already changed, avoid overwriting it.

```ts
const stillHasThisOptimisticValue =
  currentCreator?.isFollowing === optimisticValue;

if (stillHasThisOptimisticValue) {
  restorePreviousCreator();
}
```

## Rollback edge case 2: server succeeded but the client saw an error

### Current implementation

If the request throws, the UI rolls back immediately. The mutation then invalidates the list query.

### Why this is risky

The server may have successfully toggled the follow state, but the response could fail because of a network interruption. In that case:

1. Server state changes.
2. Client thinks the request failed.
3. Client rolls back to the old state.
4. Refetch eventually corrects the UI.

This creates a confusing temporary snap-back.

### Safer implementation

Keep the invalidation, but consider showing an error message and refetching quickly. For important data, avoid assuming the server definitely failed just because the client did not receive a successful response.

## Rollback edge case 3: no previous cache exists

### Current implementation

Rollback only happens when a previous list exists.

This is acceptable for the current page because creator cards render from the loaded `creators` query. However, if `CreatorCard` is reused somewhere that does not already have the list cache, rollback will not restore anything.

### Safer implementation

Make the component's optimistic strategy match the cache it actually depends on. If the card is used on a detail page, update and roll back the detail query too.

## Rollback edge case 4: follower counts can drift

### Current implementation

The client and server both increment or decrement follower counts by one based on follow state.

### Why this is risky

In real systems, follower count should reflect actual relationships. If several clients mutate the same creator or if a request is replayed, a simple increment/decrement can drift from the true count.

### Safer implementation

For a demo, clamp the value so it cannot go below zero:

```ts
followers: Math.max(0, nextFollowers);
```

For production, calculate follower count from the database or perform an atomic update only when the relationship actually changes.

## Comparison table

| Area                       | Current implementation                         | Safer implementation                                 |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| API meaning                | Toggle the current state.                      | Set explicit final state.                            |
| Mutation input             | Uses `creator.id` only.                        | Sends `{ id, isFollowing }`.                         |
| Optimistic update          | Flips cached `isFollowing`.                    | Sets known desired state.                            |
| Rollback data              | Stores the whole creator list.                 | Stores only the affected creator.                    |
| Rollback action            | Restores the whole list.                       | Restores only the affected creator if still safe.    |
| Detail cache               | Prefetched but not updated by follow mutation. | Keep list and detail cache in sync.                  |
| Server response            | Ignored until invalidation refetches.          | Merge returned creator immediately, then invalidate. |
| Duplicate request behavior | Two toggles can cancel out.                    | Repeated identical requests remain safe.             |

## Recommended fix order

1. Replace the toggle endpoint with an explicit `isFollowing` request body.
2. Save and roll back only the affected creator instead of the whole list.
3. Update both `['creators']` and `['creator', id]` cache entries.
4. Merge the server response into the cache in `onSuccess`.
5. Add latest-intent or version checks if multiple follow mutations can overlap.
6. Move follower-count correctness to the server/database layer for production.

## Bottom line

The current implementation is good for explaining optimistic UI because it is small and readable. The main weaknesses are caused by two design choices:

1. The API toggles state instead of setting an explicit desired state.
2. Rollback restores a whole cached list instead of only the affected creator.

Those two choices create most of the race-condition and rollback edge cases described above.
