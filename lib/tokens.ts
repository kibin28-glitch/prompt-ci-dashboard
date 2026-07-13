import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteOwnedToken(
  admin: SupabaseClient,
  id: string,
  userId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await admin
    .from("api_tokens")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  return { deleted: (data?.length ?? 0) > 0 };
}
