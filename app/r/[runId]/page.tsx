import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import type { RunResult, CaseResult } from "@/lib/types";

export const dynamic = "force-dynamic";

function StatusBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
        passed
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {passed ? "PASSED" : "FAILED"}
    </span>
  );
}

function CaseCard({ c, index }: { c: CaseResult; index: number }) {
  const pass = c.eval.pass;
  return (
    <div
      className={`rounded-lg border p-4 ${
        pass
          ? "border-green-300 bg-green-50"
          : "border-red-400 bg-red-50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-gray-900">
          Case #{index + 1}
        </span>
        <span
          className={`text-sm font-semibold ${
            pass ? "text-green-700" : "text-red-700"
          }`}
        >
          {pass ? "PASS" : "FAIL"} · score {c.eval.score.toFixed(2)}
        </span>
      </div>

      <p className="mb-3 text-sm text-gray-700">
        <span className="font-semibold">Reason:</span> {c.eval.reason}
      </p>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Input
        </p>
        <pre className="overflow-x-auto rounded bg-white/70 p-2 text-xs text-gray-800">
          {JSON.stringify(c.input, null, 2)}
        </pre>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Baseline output
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-gray-800">
            {c.baselineOutput}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Current output
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-gray-800">
            {c.currentOutput}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("runs")
    .select("id, created_at, payload")
    .eq("id", runId)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const results = data.payload as RunResult[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Regression Report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Run {data.id} · created {new Date(data.created_at).toLocaleString()}
        </p>
      </header>

      <div className="space-y-10">
        {results.map((result, i) => (
          <section key={i}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                {result.promptName}
              </h2>
              <StatusBadge passed={result.passed} />
              <span className="text-sm text-gray-500">
                threshold {result.threshold} ·{" "}
                {new Date(result.timestamp).toLocaleString()}
              </span>
            </div>

            <div className="space-y-4">
              {result.cases.map((c, ci) => (
                <CaseCard key={ci} c={c} index={ci} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
