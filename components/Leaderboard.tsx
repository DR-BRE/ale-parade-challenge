"use client";

import React from "react";
import Avatar from "@/components/Avatar";
import Crest from "@/components/Crest";
import EditProfileModal from "@/components/EditProfileModal";
import LeaderRow from "@/components/LeaderRow";
import RateMyG from "@/components/RateMyG";
import type { Identity } from "@/lib/identity";
import { useBoard } from "@/lib/useBoard";

export default function Leaderboard({ identity }: { identity: Identity }) {
  const board = useBoard(identity);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!board.error) return;
    const t = setTimeout(board.clearError, 3000);
    return () => clearTimeout(t);
  }, [board.error, board.clearError]);

  if (board.loading) {
    return <Crest small />;
  }

  const me = board.members.find((m) => m.id === identity.profileId) ?? null;
  const ranked = board.members
    .map((m, i) => ({ m, i, count: board.countsById[m.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const anySplits = ranked.some((r) => r.count > 0);

  return (
    <div>
      {me && (
        <button
          type="button"
          className="profile-corner"
          onClick={() => setEditing(true)}
          aria-label="Edit your profile"
        >
          <Avatar src={me.photo} name={me.name} size={40} />
        </button>
      )}
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
      <RateMyG identity={identity} />
      <div className="footer-note">First sip decides</div>
      {board.error && <div className="toast" role="status">{board.error}</div>}
      {editing && me && (
        <EditProfileModal member={me} identity={identity} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
