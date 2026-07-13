import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseClient();
  const { data, error } = await admin
    .from("api_tokens")
    .select("id, name, token, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load tokens" },
      { status: 500 },
    );
  }

  return NextResponse.json({ tokens: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const token = randomUUID();
  const admin = getSupabaseClient();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({ user_id: user.id, token, name })
    .select("id, name, token, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
