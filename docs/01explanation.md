# The Pulse — Explained Like You Are 7

Imagine your computer is a toy box. React Query is a helper who remembers what toys you have so you don't have to run to your room every time you want to play. Whenever you ask for "creators", React Query checks the box first. If the toy is still there and fresh, it gives it to you instantly. If it's old, it gives you the old one while quietly running to get the new one. That is the whole secret.

---

## File by file, line by line

### `lib/types.ts`

| Line | What it does |
|------|--------------|
| `1-9` | Draws the blueprint for a **Creator**. Every creator has an id, a name, an avatar picture, a follower count, a recent-post count, a boolean that says whether you follow them (`isFollowing`), and a short bio. Think of it like a baseball card — it tells you everything about that person. |

---

### `lib/mock.ts`

| Line | What it does |
|------|--------------|
| `3-76` | A pretend list of 8 creators. This is our imaginary database. No real internet needed. Each entry follows the Creator blueprint exactly. |
| `78-79` | `getAllCreators()` makes a copy of the whole list and gives it to you. It uses `.map(c => ({...c}))` which means "take each creator and spread them out into a fresh copy". Why a copy? So if you change something, the original list stays safe until the API says it's okay. |
| `82-83` | `getCreatorById(id)` looks through the list for a creator whose `id` matches. Like flipping through baseball cards until you find the one you want. |
| `86-92` | `toggleFollowCreator(id)` finds a creator and flips their `isFollowing` switch. If they were unfollowed, now they're followed (and follower count goes up by 1). If they were followed, now they're unfollowed (follower count goes down by 1). Then it hands back the updated card. |

---

### `lib/api.ts`

This file is the **messenger**. It runs to the server and brings back data.

| Line | What it does |
|------|--------------|
| `3` | `const BASE = "/api"` — a shortcut so we don't have to type `/api` every time. |
| `5-8` | `fetchCreators()` runs to `/api/creators`, waits for the server to reply, and if the server says "okay!" it turns the response into a list of Creator objects. If the server says "nope", it throws an error like a tantrum. |
| `11-14` | `fetchCreator(id)` runs to `/api/creators/some-id` and brings back just that one creator. |
| `17-22` | `followCreator(id)` runs to `/api/creators/some-id/follow` and says "POST" — which is computer-speak for "I want to change something". It asks the server to toggle the follow status. |

---

### `app/api/creators/route.ts`

This is the **server's response** when someone visits `/api/creators`.

| Line | What it does |
|------|--------------|
| `1` | Pulls in the mock data. |
| `3-5` | `GET()` means "someone is asking for data". The `await new Promise(r => setTimeout(r, 1000))` is a **fake slow network** — it intentionally waits 1 second before answering. This makes the app feel like a real slow Lagos network so we can see the caching tricks work. Then it returns the full list of creators as JSON. |

---

### `app/api/creators/[id]/route.ts`

Same idea, but for a single creator.

| Line | What it does |
|------|--------------|
| `3-6` | `GET(request, { params })` — the `params` is a **Promise** (Next.js 16 style). We have to `await` it before using it, like waiting for mom to open the door before you walk in. |
| `7` | Same 1-second delay. |
| `8` | `const { id } = await params` — pulls the id out of the URL after waiting for it. |
| `9-12` | Looks up the creator. If not found, returns a 404. Otherwise returns the creator data. |

---

### `app/api/creators/[id]/follow/route.ts`

| Line | What it does |
|------|--------------|
| `3-5` | `POST()` — this is a **write** action, not a read. We're changing something. |
| `7` | 1-second fake delay (even writes are slow on a bad network). |
| `8-13` | Toggles the follow status in the mock database and returns the updated creator. |

---

### `app/providers.tsx`

This is the **control center** for React Query. It sets up the rules for the whole app.

| Line | What it does |
|------|--------------|
| `1` | `"use client"` — this file runs in the browser, not on the server. |
| `3-4` | Imports React Query's boss (`QueryClient`) and its radio (`QueryClientProvider`), plus `useState` and `ReactNode` from React. |
| `6` | `export function Providers({ children })` — a wrapper component. Every page inside this wrapper gets React Query powers. |
| `7` | `const [queryClient] = useState(...)` — creates a **QueryClient** one time and remembers it forever. The `useState` trick makes sure we only create it once, not on every render. |
| `9-16` | `new QueryClient({ defaultOptions: { queries: { ... } } })` — sets the **house rules** for all queries in the app: |
| `12` | **`staleTime: 30_000`** — 30 seconds. This is the "freshness window". For the first 30 seconds after data arrives, React Query considers it **fresh** and won't refetch it. After 30 seconds, it's **stale**. But — and this is the key — **stale does not mean useless**. If you ask for creators and the cached copy is stale (older than 30 seconds), React Query gives you the stale copy instantly, then fetches a fresh copy in the background. That's **stale-while-revalidate**. |
| `13` | **`refetchOnWindowFocus: true`** — when you switch away from the tab and come back, React Query quietly re-fetches the data in the background. This is the **background refetch on window focus** feature. |
| `14` | **`retry: 2`** — if a fetch fails, try again 2 more times before giving up. |
| `20-22` | Wraps the app in `QueryClientProvider` so every component can talk to the QueryClient. |

### Stale time vs. Cache time (gcTime)

- **Stale time** (`staleTime`, line 12) = how long until the data is considered old. Before 30 seconds: data is fresh, React Query won't re-fetch. After 30 seconds: data is stale, React Query shows it immediately but also fetches fresh data in the background.
- **Cache time** (`gcTime`, which is the new name for what used to be called `cacheTime`) = how long the data stays in the toy box *after* no one is using it anymore. We didn't set it, so it defaults to 5 minutes. After 5 minutes of nobody looking at that data, it gets thrown away to save memory.
- **The difference**: Stale time answers "when should I refresh the screen?" Cache time answers "how long do I keep this in memory if nobody is looking at it?"

---

### `app/page.tsx`

The **main feed page** — the face of the app.

| Line | What it does |
|------|--------------|
| `1` | `"use client"` — this page runs in the browser because React Query needs the browser. |
| `3-5` | Imports the tools we need: `useQuery` (to fetch data), `useQueryClient` (to manually control the cache), `fetchCreators` (our messenger), and `CreatorCard` (the visual card component). |
| `7` | `export default function FeedPage()` — the main page component. |
| `8` | `const queryClient = useQueryClient()` — grabs the QueryClient that `Providers` created. This lets us talk to the cache directly. |
| `10-13` | **`useQuery({ queryKey: ["creators"], queryFn: fetchCreators })`** — this is the heart of the feed. The **query key** is `["creators"]`. Think of it as a **label on a box in the toy box**. Every time you ask for `["creators"]`, React Query checks if there's already a box with that label. If there is, and it's fresh (less than 30 seconds old), you get the box contents instantly. If the box is stale (older than 30 seconds), you get the contents anyway while React Query quietly refills the box in the background. |
| `15` | The return value has four important things: |
| | • `data` (renamed to `creators`) — the actual list of creators from the cache. |
| | • `isLoading` — true only when there is **no data at all** and a fetch is happening (first load). |
| | • `isFetching` — true **any time** a fetch is happening, even in the background. |
| | • `error` — the error object if the fetch failed. |
| `26-28` | `{isFetching && !isLoading && <span>Refreshing...</span>}` — shows a tiny "Refreshing..." text when data is being refetched in the background but we already have old data on screen. This makes the stale-while-revalidate visible. |
| `30-38` | **The Refresh Feed button**. `onClick` calls `queryClient.invalidateQueries({ queryKey: ["creators"] })`. This is **manual cache invalidation** — it tells React Query "hey, that box labeled `["creators"]` is now dirty, throw it away and fetch new data." The button is disabled while fetching so you can't spam it. |
| `42-50` | **Loading skeleton**: when `isLoading` is true (first ever load, no data at all), show 6 gray pulsing rectangles that look like cards are being loaded. |
| `53-56` | **Error state**: if something went wrong, show a red error box. |
| `59-65` | **The feed**: once `creators` exists (even stale cached data), render a `CreatorCard` for each one. |

---

### `components/CreatorCard.tsx`

This is the most important file. It has **optimistic updates**, **prefetching on hover**, and the **rollback** mechanism.

| Line | What it does |
|------|--------------|
| `1` | `"use client"` — needs the browser. |
| `3-6` | Imports: `Image` from next, `useMutation` and `useQueryClient` from React Query, our API functions, and the Creator type. |
| `8` | `export function CreatorCard({ creator }: { creator: Creator })` — takes a single creator object as a prop and draws a card for them. |
| `9` | `const queryClient = useQueryClient()` — grabs the cache controller so we can read and write the cache. |
| `11-40` | **The mutation**. A mutation is React Query's word for "an action that changes data on the server". |
| `12` | `mutationFn: () => followCreator(creator.id)` — the actual action: run to the server and toggle the follow status. This takes 1 second because the API is slow. |
| `13-31` | **`onMutate`** — runs **immediately**, before the server even answers. This is where the optimistic update happens. |
| `14` | `await queryClient.cancelQueries({ queryKey: ["creators"] })` — stops any in-flight background refetches for the `["creators"]` query. Why? Because if a background refetch returns old data right after we optimistically update, it would overwrite our change. |
| `16` | `const previous = queryClient.getQueryData<Creator[]>(["creators"])` — takes a **snapshot** of the cache before we change it. This is like taking a "before" picture so we can put everything back if something goes wrong. |
| `18-28` | `queryClient.setQueryData(...)` — reaches into the cache and **directly changes** the data for `["creators"]` without waiting for the server. It finds the creator whose id matches and flips their `isFollowing` status and adjusts follower count. This is the **optimistic update**: the UI changes instantly, even before the server says yes. |
| `30` | `return { previous }` — hands the snapshot to React Query so it can be used later in `onError`. This is like giving your friend the "before" photo and saying "hold this, I might need it." |
| `32-36` | **`onError`** — runs if the server call fails (network drops, server crashes, etc.). |
| `33-35` | `if (context?.previous) { queryClient.setQueryData(["creators"], context.previous) }` — **this is the rollback**. If the server says "nope", we grab the snapshot we saved in `onMutate` and put it back into the cache. The UI snaps back to exactly how it was before the user clicked. It's like undoing a drawing you regret. |
| `37-39` | **`onSettled`** — runs after the mutation finishes, whether it succeeded or failed. |
| `38` | `queryClient.invalidateQueries({ queryKey: ["creators"] })` — tells React Query "hey, the server might have changed, go fetch fresh data for `["creators"]`". This ensures the cache is eventually in sync with the server. |
| `42-48` | **`handlePrefetch()`** — the hover prefetch logic. |
| `43-47` | `queryClient.prefetchQuery({ queryKey: ["creator", creator.id], queryFn: () => fetchCreator(creator.id), staleTime: 30_000 })` — when the mouse hovers over a card, this runs **before** the user clicks anything. It fetches the individual creator's detail data and stores it in the cache under the key `["creator", creator.id]`. The `staleTime: 30_000` means this prefetched data stays fresh for 30 seconds. If the user later navigates to a detail page that needs `["creator", "3"]`, the data is already there — zero waiting. |
| `51-92` | The visual card layout. |
| `53` | `onMouseEnter={handlePrefetch}` — connects the hover event to our prefetch function. |
| `55-62` | The avatar image, 48x48 pixels, rounded. |
| `65-73` | The creator's name, follower count, and post count. |
| `75-89` | **The Follow button**. |
| `76` | `onClick={() => mutation.mutate()}` — clicking calls `mutation.mutate()`, which triggers `onMutate` instantly, then the slow server call, then either `onError` or `onSuccess`, then `onSettled`. |
| `77` | `disabled={mutation.isPending}` — while the server is thinking, the button is grayed out so you can't click it again. |
| `79-82` | The button changes color: black background + white text for "Follow", gray background + dark text for "Following". |
| `84-88` | The button text: shows "..." while the server is working, "Following" if you already follow them, "Follow" if you don't. |

---

## How query keys connect everything (the big picture)

There are **three** query keys in this app:

| Query key | Where it's used | What it holds |
|-----------|-----------------|---------------|
| `["creators"]` | `page.tsx:11`, `CreatorCard.tsx:14,16,18,34,38` | The **full list** of all 8 creators. This is the main data for the feed. |
| `["creator", creator.id]` | `CreatorCard.tsx:44` | A **single creator's detail data**. We prefetch this on hover. |

The key `["creators"]` is special because **two different components share it**:
- `FeedPage` reads it with `useQuery` to display the feed.
- `CreatorCard` writes to it with `setQueryData` (optimistic update) and reads from it with `getQueryData` (snapshot).

Because they use the **same key**, they are looking at the **same box in the toy box**. When `CreatorCard` optimistically changes the box, `FeedPage` sees the change immediately — without any extra code. That's why query keys must match.

---

## The full flow of an optimistic update (the movie)

1. User sees Amina Diallo with "Follow" button.
2. User clicks "Follow".
3. **`onMutate` fires instantly** (line 13):
   - Cancel any background refetches for `["creators"]` so they don't overwrite us.
   - Take a snapshot of the cache (save the "before" picture).
   - Directly edit the cache: flip `isFollowing` to `true`, bump followers by 1.
4. **The screen updates instantly**. Amina's button now says "Following" and her follower count jumped. The user feels like magic.
5. Meanwhile, the API call is running in the background (`followCreator`), intentionally slow (1 second).
6. **Scenario A — success**: The server returns the updated creator. `onSettled` fires (line 37), which calls `invalidateQueries`. React Query re-fetches `["creators"]` to make sure everything matches the server. Nothing visible changes because our guess was correct.
7. **Scenario B — failure**: The network dies. `onError` fires (line 32). It grabs the `previous` snapshot and stuffs it back into the cache with `setQueryData`. The UI **snaps back** to the "before" state — Amina's button turns back to "Follow", follower count drops back down. `onSettled` still fires and invalidates queries just to be safe.

This is the **optimistic update with rollback** — the app assumes success, shows the result instantly, and quietly undoes everything if it was wrong.

---

## Stale-while-revalidate in action

1. You load the page for the first time. `isLoading` is `true`. You see 6 gray skeleton boxes.
2. After 1 second (the API delay), the data arrives. The feed appears. The `["creators"]` box is now full and marked **fresh** (30-second timer starts).
3. **You click "Refresh Feed"**. `invalidateQueries` marks the box as stale and triggers a refetch.
4. Because `["creators"]` already has data in the cache (even though it's stale), `creators` is **not undefined**, so `isLoading` is `false`. The old data stays on screen.
5. `isFetching` becomes `true` — you see "Refreshing..." text.
6. After 1 second, the new data arrives. The cards update. `isFetching` goes back to `false`.
7. **You switch to another tab, chat for a bit, then come back.** `refetchOnWindowFocus` triggers. Same thing: old data stays on screen, new data loads in the background, cards update silently.

That's **stale-while-revalidate**: you always see *something* on screen, never a blank loading page, unless it's the very first load.

---

## How mutating the cache optimistically differs from waiting

Without optimistic updates, clicking "Follow" would:
1. Gray out the button.
2. Wait 1 full second.
3. Update the button.
4. Feel slow.

With optimistic updates:
1. Button changes instantly.
2. Server call happens silently in the background.
3. If it fails, button changes back (rollback).
4. Feels instant.

The `setQueryData` call on line 18 **mutates the cache directly** — it reaches into React Query's memory and changes what's there. React Query then tells every component watching `["creators"]` to re-render with the new data. This is the same mechanism that `useQuery` uses to update components when a background refetch finishes — except here we trigger it manually, without waiting for the network.
