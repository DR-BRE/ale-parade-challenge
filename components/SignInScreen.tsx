"use client";

import React from "react";
import Crest from "@/components/Crest";
import { supabase } from "@/lib/supabaseClient";

export default function SignInScreen() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError("Couldn't reach Google — try again");
      setBusy(false);
    }
    // On success the browser navigates to Google; no state reset needed.
  };

  return (
    <div className="setup">
      <Crest />
      <button type="button" className="pour-in-btn" disabled={busy} onClick={signIn}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <div className="toast" role="status">{error}</div>}
    </div>
  );
}
