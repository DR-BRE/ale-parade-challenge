"use client";

import Avatar from "@/components/Avatar";
import Crown from "@/components/Crown";
import SplitButton from "@/components/SplitButton";
import { timeText } from "@/lib/timeText";

export type Member = { id: string; name: string; photo: string | null };
export type Entry = { id: string; type: "split" | "undo"; ts: number };

type LeaderRowProps = {
  member: Member;
  rank: number;
  isLeader: boolean;
  isYou: boolean;
  count: number;
  popKey: number;
  onPour: () => void;
  onUndo: () => void;
  history: Entry[];
  isOpen: boolean;
  onToggle: () => void;
};

// One leaderboard row. `history` is that person's pour breakdown,
// revealed by the chevron to the right of their score.
export default function LeaderRow({
  member, rank, isLeader, isYou, count, popKey,
  onPour, onUndo, history, isOpen, onToggle,
}: LeaderRowProps) {
  const cls = ["row", isLeader ? "leader" : "", isYou ? "you" : ""].join(" ").trim();
  return (
    <div className={cls}>
      {isLeader && <Crown />}
      <div className="rank">{rank}</div>
      <Avatar src={member.photo} name={member.name} size={46} />
      <div className="who">
        <div className="name" style={{ fontSize: isLeader ? 24 : 22 }}>
          {member.name}
        </div>
      </div>
      <div className={popKey > 0 ? "count count-pop" : "count"} key={popKey}>{count}</div>
      <button
        type="button"
        className="expand-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={"Show " + member.name + "'s pour history"}
      >
        <svg className={isOpen ? "chev open" : "chev"} viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5 L7 9.2 L11 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isYou && (
        <div className="you-actions">
          <button
            type="button"
            className="undo-btn"
            disabled={count === 0}
            onClick={onUndo}
            aria-label="Undo one split"
            title="Take one back"
          >
            &minus;1
          </button>
          <SplitButton onPour={onPour} />
        </div>
      )}
      {isOpen && (
        <div className="breakdown">
          {history.length === 0 ? (
            <div className="bd-empty">No pours yet.</div>
          ) : (
            history.map((e) => (
              <div key={e.id} className={e.type === "undo" ? "bd-item undo" : "bd-item"}>
                <span className="bd-text">{e.type === "undo" ? "Took one back" : "Split the G"}</span>
                <span className="bd-time">{timeText(e.ts)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
