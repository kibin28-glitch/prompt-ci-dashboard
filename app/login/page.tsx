"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function handleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
      <p className="mt-2 text-gray-600">
        Sign in to see your promptci run history.
      </p>
      <button
        onClick={handleSignIn}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
