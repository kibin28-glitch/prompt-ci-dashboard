// app/dashboard/TokenCard.tsx
"use client";

import { useState } from "react";

export default function TokenCard({
  initialToken,
}: {
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateToken() {
    setLoading(true);
    try {
      const res = await fetch("/api/token", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-2 font-semibold text-gray-900">Your API token</h2>
      <p className="mb-3 text-sm text-gray-600">
        Set this as{" "}
        <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code> so
        that{" "}
        <code className="rounded bg-gray-200 px-1">
          promptci run --upload
        </code>{" "}
        links to your account.
      </p>
      {token ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-sm text-gray-100">
            {token}
          </code>
          <button
            onClick={copyToken}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No token yet.</p>
      )}
      <button
        onClick={generateToken}
        disabled={loading}
        className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Generating…" : token ? "Regenerate token" : "Generate token"}
      </button>
    </div>
  );
}
