// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";
import TokenCard from "./TokenCard";
import type { RunResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = getSupabaseClient();

  const { data: tokenRow } = await admin
    .from("api_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: runs } = await admin
    .from("runs")
    .select("id, created_at, payload")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="mt-6">
        <TokenCard initialToken={tokenRow?.token ?? null} />
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Your runs
        </h2>
        {!runs || runs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No runs yet. Set{" "}
            <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code>{" "}
            to the token above and run{" "}
            <code className="rounded bg-gray-200 px-1">
              promptci run --upload
            </code>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => {
              const results = run.payload as RunResult[];
              const allPassed = results.every((r) => r.passed);
              return (
                <li key={run.id}>
                  <a
                    href={`/r/${run.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-900">
                      {results.map((r) => r.promptName).join(", ")}
                    </span>
                    <span className="flex items-center gap-3 text-sm text-gray-500">
                      <span
                        className={
                          allPassed
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {allPassed ? "PASSED" : "FAILED"}
                      </span>
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
