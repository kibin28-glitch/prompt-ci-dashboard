import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";
import { deleteOwnedToken } from "@/lib/tokens";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getSupabaseClient();
  const { deleted } = await deleteOwnedToken(admin, id, user.id);

  if (!deleted) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
