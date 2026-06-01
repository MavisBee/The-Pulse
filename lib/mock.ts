import type { Creator } from "./types";

const creators: Creator[] = [
  {
    id: "1",
    name: "Amina Diallo",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Amina",
    followers: 28400,
    recentPosts: 12,
    isFollowing: false,
    bio: "Digital artist & illustrator. Lagos-based.",
  },
  {
    id: "2",
    name: "Chidi Okonkwo",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Chidi",
    followers: 15300,
    recentPosts: 8,
    isFollowing: true,
    bio: "Full-stack dev & tech educator.",
  },
  {
    id: "3",
    name: "Zara Bello",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Zara",
    followers: 42100,
    recentPosts: 24,
    isFollowing: false,
    bio: "Fashion & lifestyle content creator.",
  },
  {
    id: "4",
    name: "Kehinde Ogun",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Kehinde",
    followers: 9700,
    recentPosts: 5,
    isFollowing: false,
    bio: "Photographer. Capturing Lagos one frame at a time.",
  },
  {
    id: "5",
    name: "Ngozi Eze",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Ngozi",
    followers: 56200,
    recentPosts: 31,
    isFollowing: true,
    bio: "Afrobeats curator & podcast host.",
  },
  {
    id: "6",
    name: "Tunde Balogun",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Tunde",
    followers: 18900,
    recentPosts: 9,
    isFollowing: false,
    bio: "Comedian & storyteller.",
  },
  {
    id: "7",
    name: "Simi Adeleke",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Simi",
    followers: 73800,
    recentPosts: 42,
    isFollowing: false,
    bio: "Skincare formulator & wellness advocate.",
  },
  {
    id: "8",
    name: "Emeka Nwosu",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Emeka",
    followers: 22100,
    recentPosts: 15,
    isFollowing: true,
    bio: "Street food reviewer & culinary explorer.",
  },
];

export function getAllCreators(): Creator[] {
  return creators.map((c) => ({ ...c }));
}

export function getCreatorById(id: string): Creator | undefined {
  return creators.find((c) => c.id === id);
}

export function toggleFollowCreator(id: string): Creator | undefined {
  const creator = creators.find((c) => c.id === id);
  if (creator) {
    creator.isFollowing = !creator.isFollowing;
    creator.followers += creator.isFollowing ? 1 : -1;
  }
  return creator;
}
