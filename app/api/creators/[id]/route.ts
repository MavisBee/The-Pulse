import { getCreatorById } from "@/lib/mock";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await new Promise((r) => setTimeout(r, 1000));
  const { id } = await params;
  const creator = getCreatorById(id);
  if (!creator) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(creator);
}
