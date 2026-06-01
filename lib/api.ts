import type { Creator } from "./types";

const BASE = "/api";

export async function fetchCreators(): Promise<Creator[]> {
  const res = await fetch(`${BASE}/creators`);
  if (!res.ok) throw new Error("Failed to fetch creators");
  return res.json();
}

export async function fetchCreator(id: string): Promise<Creator> {
  const res = await fetch(`${BASE}/creators/${id}`);
  if (!res.ok) throw new Error("Failed to fetch creator");
  return res.json();
}

export async function followCreator(id: string): Promise<Creator> {
  const res = await fetch(`${BASE}/creators/${id}/follow`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to follow creator");
  return res.json();
}
