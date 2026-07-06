import { getSupabaseClient } from "./supabase/admin";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RUNS_PER_WINDOW = 100;

// Returns true if the token is allowed to submit another run, false if it has
// hit the rate limit within the last 24 hours.
export async function checkRateLimit(token: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error } = await supabase
    .from("runs")
    .select("*", { count: "exact", head: true })
    .eq("token", token)
    .gt("created_at", since);

  if (error) {
    throw error;
  }

  return (count ?? 0) < MAX_RUNS_PER_WINDOW;
}
