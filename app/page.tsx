"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCreators } from "@/lib/api";
import { CreatorCard } from "@/components/CreatorCard";

export default function FeedPage() {
  const queryClient = useQueryClient();

  const { data: creators, isLoading, isFetching, error } = useQuery({
    queryKey: ["creators"],
    queryFn: fetchCreators,
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">The Pulse</h1>
          <p className="text-sm text-zinc-500">
            Trending creators right now
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="text-sm text-zinc-400">Refreshing...</span>
          )}

          <button
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["creators"] })
            }
            disabled={isFetching}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            Refresh Feed
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-zinc-100"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load creators. Pull down to try again.
        </div>
      )}

      {creators && (
        <div className="flex flex-col gap-3">
          {creators.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}
    </div>
  );
}
