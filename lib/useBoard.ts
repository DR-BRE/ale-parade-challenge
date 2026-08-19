"use client";

import React from "react";
import type { Member } from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { averagesByProfile } from "@/lib/averageScores";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = { id: string; name: string; photo_url: string | null; created_at: string };
type SplitRow = { id: string; profile_id: string; delta: number; created_at: string };
type ScoreRow = { profile_id: string; score: number };

export type Board = {
  loading: boolean;
  members: Member[]; // in join order; ranking happens in the component
  countsById: Record<string, number>;
  avgById: Record<string, number>; // mean Rate-my-G accuracy; absent = no attempts
  pour: () => void;
  undo: () => void;
  popKey: number; // bumps on your own +1/-1 to trigger the count pop
  error: string | null;
  clearError: () => void;
};

export function useBoard(identity: Identity): Board {
  const [profiles, setProfiles] = React.useState<ProfileRow[] | null>(null);
  const [splits, setSplits] = React.useState<SplitRow[]>([]);
  const [scores, setScores] = React.useState<ScoreRow[]>([]);
  const [popKey, setPopKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    const [p, s, sc] = await Promise.all([
      supabase.from("profiles").select("id, name, photo_url, created_at").order("created_at"),
      supabase.from("splits").select("id, profile_id, delta, created_at").order("created_at", { ascending: false }),
      supabase.from("scores").select("profile_id, score"),
    ]);
    if (!p.error && p.data) setProfiles(p.data);
    if (!s.error && s.data) setSplits(s.data);
    if (!sc.error && sc.data) setScores(sc.data);
    // Without this, a failed initial load would leave `loading` stuck forever.
    if (p.error) setError("Couldn't load the board — check your connection and refresh");
  }, []);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  // Live updates: any new split or profile change refreshes the board.
  React.useEffect(() => {
    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "splits" }, () => refetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scores" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const send = React.useCallback(
    async (delta: 1 | -1) => {
      // Optimistic: show the change immediately, roll back on failure.
      const temp: SplitRow = {
        id: "temp-" + Date.now() + Math.random().toString(36).slice(2, 6),
        profile_id: identity.profileId,
        delta,
        created_at: new Date().toISOString(),
      };
      setPopKey((n) => n + 1);
      setSplits((s) => [temp, ...s]);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setSplits((s) => s.filter((row) => row.id !== temp.id));
          await supabase.auth.signOut();
          return;
        }
        const res = await fetch("/api/splits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ delta }),
        });
        if (!res.ok) {
          if (res.status === 401) {
            setSplits((s) => s.filter((row) => row.id !== temp.id));
            await supabase.auth.signOut();
            return;
          }
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "That one didn't land — try again");
        }
        const { split } = (await res.json()) as { split: SplitRow };
        setSplits((s) => {
          const replaced = s.map((row) => (row.id === temp.id ? split : row));
          // A realtime refetch may already have delivered the real row.
          return replaced.filter((row, i) => replaced.findIndex((r) => r.id === row.id) === i);
        });
      } catch (e) {
        setSplits((s) => s.filter((row) => row.id !== temp.id));
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    },
    [identity]
  );

  const countsById = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of splits) counts[s.profile_id] = (counts[s.profile_id] || 0) + s.delta;
    return counts;
  }, [splits]);

  const avgById = React.useMemo(() => averagesByProfile(scores), [scores]);

  const members = React.useMemo(
    () => (profiles ?? []).map((p) => ({ id: p.id, name: p.name, photo: p.photo_url })),
    [profiles]
  );

  const myCount = countsById[identity.profileId] || 0;

  return {
    loading: profiles === null,
    members,
    countsById,
    avgById,
    pour: () => send(1),
    undo: () => {
      if (myCount > 0) send(-1);
    },
    popKey,
    error,
    clearError: () => setError(null),
  };
}
