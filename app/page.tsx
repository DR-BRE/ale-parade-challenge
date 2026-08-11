"use client";

import React from "react";
import Leaderboard from "@/components/Leaderboard";
import PintBackground from "@/components/PintBackground";
import SignInScreen from "@/components/SignInScreen";
import type { Identity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const apply = async (
      session: { access_token: string; user: { id: string } } | null
    ) => {
      if (!session) {
        if (active) { setIdentity(null); setReady(true); }
        return;
      }
      // First login creates the profile row from Google metadata; idempotent after.
      try {
        await fetch("/api/profiles", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Network hiccup: still let them in; writes will re-auth as needed.
      }
      if (active) { setIdentity({ profileId: session.user.id }); setReady(true); }
    };

    // Fires immediately with the current session (INITIAL_SESSION) and on every
    // sign-in / sign-out / token refresh thereafter.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="stage">
      <PintBackground />
      <div className="app">
        {!ready ? null : identity ? (
          <Leaderboard identity={identity} />
        ) : (
          <SignInScreen />
        )}
      </div>
    </div>
  );
}
