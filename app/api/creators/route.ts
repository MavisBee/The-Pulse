import { getAllCreators } from "@/lib/mock";

export async function GET() {
  await new Promise((r) => setTimeout(r, 1000));
  return Response.json(getAllCreators());
}
