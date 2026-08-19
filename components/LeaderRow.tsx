"use client";

import Avatar from "@/components/Avatar";
import { Breakdown, YouActions } from "@/components/RowExtras";

export type Member = { id: string; name: string; photo: string | null };
export type Entry = { id: string; type: "split" | "undo"; ts: number };

type LeaderRowProps = {
  member: Member;
  rank: number;
  isYou: boolean;
  count: number;
  popKey: number;
  onPour: () => void;
  onUndo: () => void;
  history: Entry[];
  isOpen: boolean;
  onToggle: () => void;
};

// One honours-ledger row inside the frosted board panel.
export default function LeaderRow({
  member, rank, isYou, count, popKey,
  onPour, onUndo, history, isOpen, onToggle,
}: LeaderRowProps) {
  return (
    <div className={isYou ? "row you" : "row"}>
      <div className="rank">{rank}</div>
      <Avatar src={member.photo} name={member.name} size={38} />
      <div className="who"><div className="name">{member.name}</div></div>
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
      {isYou && <YouActions count={count} onPour={onPour} onUndo={onUndo} />}
      {isOpen && <Breakdown history={history} />}
    </div>
  );
}
