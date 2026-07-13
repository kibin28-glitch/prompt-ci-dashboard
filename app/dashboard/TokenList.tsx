// app/dashboard/TokenList.tsx
"use client";

import { useState } from "react";

type Token = {
  id: string;
  name: string;
  token: string;
  created_at: string;
};

export default function TokenList({
  initialTokens,
}: {
  initialTokens: Token[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createToken() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setTokens((prev) => [data, ...prev]);
        setName("");
      } else {
        setError(data.error ?? "Failed to generate token.");
      }
    } catch {
      setError("Failed to generate token.");
    } finally {
      setCreating(false);
    }
  }

  async function copyToken(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  async function revokeToken(id: string) {
    if (!confirm("Revoke this token? Anything using it will stop working.")) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to revoke token.");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-2 font-semibold text-gray-900">Your API tokens</h2>
      <p className="mb-3 text-sm text-gray-600">
        Set one as{" "}
        <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code> so
        that{" "}
        <code className="rounded bg-gray-200 px-1">
          promptci run --upload
        </code>{" "}
        links to your account.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Local CI"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={createToken}
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {creating ? "Generating…" : "Generate token"}
        </button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-gray-500">No tokens yet.</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-gray-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {t.name}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-sm text-gray-100">
                  {t.token}
                </code>
                <button
                  onClick={() => copyToken(t.id, t.token)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                >
                  {copiedId === t.id ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => revokeToken(t.id)}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
