import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { token?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, payload } = body;

  if (typeof token !== "string" || token.trim().length === 0) {
    return NextResponse.json(
      { error: "token must be a non-empty string" },
      { status: 400 },
    );
  }

  if (payload === undefined || payload === null) {
    return NextResponse.json({ error: "payload is required" }, { status: 400 });
  }

  const allowed = await checkRateLimit(token);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("runs")
    .insert({ token, payload })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to store run" }, { status: 500 });
  }

  return NextResponse.json({ runId: data.id });
}
