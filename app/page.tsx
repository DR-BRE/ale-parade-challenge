"use client";

import React from "react";
import Leaderboard from "@/components/Leaderboard";
import PintBackground from "@/components/PintBackground";
import SetupScreen from "@/components/SetupScreen";
import { loadIdentity, saveIdentity, type Identity } from "@/lib/identity";

export default function Home() {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [ready, setReady] = React.useState(false);

  // Identity lives in localStorage, so it can only be read client-side.
  React.useEffect(() => {
    setIdentity(loadIdentity());
    setReady(true);
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
