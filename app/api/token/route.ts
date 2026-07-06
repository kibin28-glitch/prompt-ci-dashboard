import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = randomUUID();
  const admin = getSupabaseClient();
  const { error } = await admin
    .from("api_tokens")
    .upsert({ user_id: user.id, token }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
