"use client";

import Avatar from "@/components/Avatar";
import { GAccuracy, YouActions } from "@/components/RowExtras";

export type Member = { id: string; name: string; photo: string | null };

type LeaderRowProps = {
  member: Member;
  rank: number;
  isYou: boolean;
  count: number;
  avg?: number;
  popKey: number;
  onPour: () => void;
  onUndo: () => void;
};

// One honours-ledger row inside the frosted board panel.
export default function LeaderRow({
  member, rank, isYou, count, avg, popKey, onPour, onUndo,
}: LeaderRowProps) {
  return (
    <div className={isYou ? "row you" : "row"}>
      <div className="rank">{rank}</div>
      <Avatar src={member.photo} name={member.name} size={38} />
      <div className="who"><div className="name">{member.name}</div></div>
      <GAccuracy avg={avg} />
      <div className={popKey > 0 ? "count count-pop" : "count"} key={popKey}>{count}</div>
      {isYou && <YouActions count={count} onPour={onPour} onUndo={onUndo} />}
    </div>
  );
}
