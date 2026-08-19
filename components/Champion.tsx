"use client";

import Avatar from "@/components/Avatar";
import Crown from "@/components/Crown";
import type { Member } from "@/components/LeaderRow";
import { GAccuracy, YouActions } from "@/components/RowExtras";

type ChampionProps = {
  member: Member;
  count: number;
  avg?: number;
  isYou: boolean;
  popKey: number;
  onPour: () => void;
  onUndo: () => void;
};

// The reigning champion, rendered as a liquid-glass honours plaque that
// refracts the pint settling behind it.
export default function Champion({ member, count, avg, isYou, popKey, onPour, onUndo }: ChampionProps) {
  return (
    <section className="glass champ" aria-label="Reigning champion">
      <div className="g-distort" />
      <div className="g-tint" />
      <div className="g-edge" />
      <div className="g-content">
        <div className="champ-tag"><Crown /> Reigning Champion</div>
        <Avatar src={member.photo} name={member.name} size={56} />
        <div className="champ-who">
          <div className="champ-name">
            {member.name}
            {isYou && <span className="champ-you-tag" />}
          </div>
          <div className="champ-sub">{isYou ? "You hold the crown" : "Holds the crown"}</div>
        </div>
        <GAccuracy avg={avg} />
        <div className={popKey > 0 ? "champ-count count-pop" : "champ-count"} key={popKey}>
          {count}<small>Splits</small>
        </div>
        {isYou && <YouActions count={count} onPour={onPour} onUndo={onUndo} />}
      </div>
    </section>
  );
}
