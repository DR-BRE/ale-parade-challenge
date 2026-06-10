"use client";

import React from "react";
import Crest from "@/components/Crest";
import LeaderRow from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { useBoard } from "@/lib/useBoard";

export default function Leaderboard({ identity }: { identity: Identity }) {
  const board = useBoard(identity);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!board.error) return;
    const t = setTimeout(board.clearError, 3000);
    return () => clearTimeout(t);
  }, [board.error, board.clearError]);

  if (board.loading) {
    return <Crest small />;
  }

  const ranked = board.members
    .map((m, i) => ({ m, i, count: board.countsById[m.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const anySplits = ranked.some((r) => r.count > 0);

  return (
    <div>
      <Crest small />
      {!anySplits && (
        <div className="empty-banner">
          <div className="big">No one&rsquo;s split the G yet. Tragic.</div>
          <div className="small">Be the first &mdash; the crown is sitting right there.</div>
        </div>
      )}
      <div className="board">
        {ranked.map((r, idx) => (
          <LeaderRow
            key={r.m.id}
            member={r.m}
            rank={idx + 1}
            isLeader={anySplits && idx === 0}
            isYou={r.m.id === identity.profileId}
            count={r.count}
            popKey={r.m.id === identity.profileId ? board.popKey : 0}
            onPour={board.pour}
            onUndo={board.undo}
            history={board.historyById[r.m.id] || []}
            isOpen={openId === r.m.id}
            onToggle={() => setOpenId(openId === r.m.id ? null : r.m.id)}
          />
        ))}
      </div>
      <div className="footer-note">First sip decides</div>
      {board.error && <div className="toast" role="status">{board.error}</div>}
    </div>
  );
}
