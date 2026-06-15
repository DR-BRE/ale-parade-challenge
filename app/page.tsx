"use client";

import React from "react";
import Leaderboard from "@/components/Leaderboard";
import PintBackground from "@/components/PintBackground";
import SetupScreen from "@/components/SetupScreen";
import { resolveIdentity, saveIdentity, type Identity } from "@/lib/identity";

export default function Home() {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [ready, setReady] = React.useState(false);

  // Identity lives in localStorage (with a durable server cookie as backup),
  // so it can only be resolved client-side.
  React.useEffect(() => {
    let active = true;
    resolveIdentity().then((id) => {
      if (!active) return;
      setIdentity(id);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const finishSetup = (id: Identity) => {
    saveIdentity(id);
    setIdentity(id);
  };

  return (
    <div className="stage">
      <PintBackground />
      <div className="app">
        {!ready ? null : identity ? (
          <Leaderboard identity={identity} />
        ) : (
          <SetupScreen onDone={finishSetup} />
        )}
      </div>
    </div>
  );
}
