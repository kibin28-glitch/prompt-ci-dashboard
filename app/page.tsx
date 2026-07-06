export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">
        Prompt CI Engine
      </h1>
      <p className="mt-2 text-lg text-gray-600">
        Regression testing for your LLM prompts.
      </p>

      <section className="mt-10 space-y-4 text-gray-700">
        <p>
          Prompt CI Engine is a CLI that runs your prompts against a saved
          baseline and flags regressions before they ship. When a prompt or
          model change degrades output quality, you find out in your terminal
          instead of in production.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 font-semibold text-gray-900">How it works</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            <li>
              <code className="rounded bg-gray-200 px-1">promptci snapshot</code>{" "}
              saves your current prompts as the baseline.
            </li>
            <li>
              <code className="rounded bg-gray-200 px-1">promptci run</code> runs
              your test cases and evaluates current output against the baseline.
            </li>
            <li>
              <code className="rounded bg-gray-200 px-1">promptci run --upload</code>{" "}
              publishes the results here and prints a shareable report URL.
            </li>
          </ol>
        </div>

        <p>
          Uploaded runs get their own report page showing each prompt&apos;s
          pass/fail status, per-case scores, and a side-by-side diff of baseline
          vs. current output.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 font-semibold text-gray-900">Get started</h2>
          <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
            npx @kibin28-glitch/promptci init
          </pre>
        </div>
      </section>

      <div className="mt-10 flex gap-3">
        <a
          href="https://github.com/kibin28-glitch/prompt-ci-engine"
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          View the CLI on GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/@kibin28-glitch/promptci"
          className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          View on npm
        </a>
      </div>
    </main>
  );
}
