"use client";

import Image from "next/image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { followCreator, fetchCreator } from "@/lib/api";
import type { Creator } from "@/lib/types";

export function CreatorCard({ creator }: { creator: Creator }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => followCreator(creator.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["creators"] });

      const previous = queryClient.getQueryData<Creator[]>(["creators"]);

      queryClient.setQueryData<Creator[]>(["creators"], (old) =>
        old?.map((c) =>
          c.id === creator.id
            ? {
                ...c,
                isFollowing: !c.isFollowing,
                followers: c.followers + (c.isFollowing ? -1 : 1),
              }
            : c
        )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["creators"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
    },
  });

  function handlePrefetch() {
    queryClient.prefetchQuery({
      queryKey: ["creator", creator.id],
      queryFn: () => fetchCreator(creator.id),
      staleTime: 30_000,
    });
  }

  return (
    <div
      className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md"
      onMouseEnter={handlePrefetch}
    >
      <Image
        src={creator.avatar}
        alt={creator.name}
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-full bg-zinc-100"
        unoptimized
      />

      <div className="flex-1 min-w-0">
        <h3 className="truncate font-semibold text-zinc-900">
          {creator.name}
        </h3>
        <p className="text-sm text-zinc-500">
          {creator.followers.toLocaleString()} followers
          {" · "}
          {creator.recentPosts} posts
        </p>
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          creator.isFollowing
            ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            : "bg-zinc-900 text-white hover:bg-zinc-800"
        }`}
      >
        {mutation.isPending
          ? "..."
          : creator.isFollowing
            ? "Following"
            : "Follow"}
      </button>
    </div>
  );
}
