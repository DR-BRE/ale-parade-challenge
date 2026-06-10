// Ale Parade Challenge — shared components
// Exposed on window for use by ale-app.jsx

function Crest({ small }) {
  return (
    <div className={small ? "crest small" : "crest"}>
      <div className="crest-rule"><span className="crest-diamond"></span></div>
      <div className="crest-est" style={{ fontSize: "14px" }}>EST. 1759</div>
      <h1 className="crest-name" style={{ fontSize: "34px" }}>Ale Parade<br /><span className="amp" style={{ fontSize: "32px" }}>Challenge</span></h1>
      <div className="crest-sub" style={{ fontSize: "12px" }}>Split-the-G Tally</div>
      <div className="crest-rule"><span className="crest-diamond"></span></div>
    </div>);

}

function Avatar({ src, name, size }) {
  const [broken, setBroken] = React.useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {src && !broken ?
      <img src={src} alt="" onError={() => setBroken(true)} /> :

      <span className="mono" style={{ fontSize: size * 0.44 }}>{initial}</span>
      }
    </div>);

}

function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 16" aria-hidden="true">
      <path d="M2 14 L2 5 L7 9 L12 1.5 L17 9 L22 5 L22 14 Z" fill="currentColor"></path>
    </svg>);

}

// The +1 button. Each tap re-keys the .pour layer so the
// fill / foam / ring animations restart from zero.
function SplitButton({ onPour }) {
  const [pourId, setPourId] = React.useState(0);
  const handle = () => {
    setPourId((n) => n + 1);
    onPour();
  };
  return (
    <button type="button" className="split-btn" onClick={handle} aria-label="Add one split">
      {pourId > 0 &&
      <span className="pour" key={pourId}>
          <span className="pour-liquid"></span>
          <span className="pour-foam"></span>
          <span className="pour-ring"></span>
        </span>
      }
      <span className={pourId > 0 ? "split-label pour-label" : "split-label"} key={"l" + pourId}>
        <span className="plus">+1</span>Split it!
      </span>
    </button>);

}

// One leaderboard row. `history` is that person's pour breakdown,
// revealed by the chevron to the right of their score.
function LeaderRow({ member, rank, isLeader, isYou, count, popKey, onPour, onUndo, history, hiddenCount, isOpen, onToggle }) {
  const cls = ["row", isLeader ? "leader" : "", isYou ? "you" : ""].join(" ").trim();
  return (
    <div className={cls}>
      {isLeader && <Crown />}
      <div className="rank">{rank}</div>
      <Avatar src={member.photo} name={member.name} size={46} />
      <div className="who">
        <div className="name" style={{ fontSize: isLeader ? "24px" : "22px" }}>
          {member.name}
        </div>
      </div>
      <div className={popKey > 0 ? "count count-pop" : "count"} key={popKey}>{count}</div>
      <button
        type="button"
        className="expand-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={"Show " + member.name + "'s pour history"}>
        
        <svg className={isOpen ? "chev open" : "chev"} viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5 L7 9.2 L11 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      </button>
      {isYou &&
      <div className="you-actions">
          <button
          type="button"
          className="undo-btn"
          disabled={count === 0}
          onClick={onUndo}
          aria-label="Undo one split"
          title="Take one back">
          
            &minus;1
          </button>
          <SplitButton onPour={onPour} />
        </div>
      }
      {isOpen &&
      <div className="breakdown">
          {history.length === 0 ?
        <div className="bd-empty">No pours yet.</div> :

        history.map((e, i) =>
        <div key={e.id || "h" + i} className={e.type === "undo" ? "bd-item undo" : "bd-item"}>
              <span className="bd-text">{e.type === "undo" ? "Took one back" : "Split the G"}</span>
              <span className="bd-time">{e.timeText}</span>
            </div>
        )
        }
        </div>
      }
    </div>);

}

// Full-screen "pint" backdrop: settling Guinness pour — cream foam head with a
// noise-roughened edge, tan settle zone, and a cascade of micro-bubbles
// streaming downward through the dark body.
function PintBackground() {
  const bubbles = React.useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const rnd = (n) => {const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;return x - Math.floor(x);};
    return {
      left: (rnd(1) * 100).toFixed(1) + "%",
      size: (1.4 + rnd(2) * 2.6).toFixed(1) + "px",
      dur: (5.5 + rnd(3) * 8).toFixed(1) + "s",
      delay: (-(rnd(4) * 14)).toFixed(1) + "s",
      o: (0.08 + rnd(5) * 0.2).toFixed(2),
      drift: (rnd(6) * 18 - 9).toFixed(1) + "px"
    };
  }), []);
  return (
    <div className="pint-bg" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="foam-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.05" numOctaves="3" seed="7" result="n"></feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
        </filter>
      </svg>
      <div className="cascade-fade">
        <div className="cascade-streaks">
          <div className="cascade-layer cl-a"></div>
          <div className="cascade-layer cl-b"></div>
        </div>
      </div>
      <div className="bubbles">
        {bubbles.map((b, i) =>
        <span
          key={i}
          className="bubble"
          style={{ left: b.left, width: b.size, height: b.size, animationDuration: b.dur, animationDelay: b.delay, "--o": b.o, "--drift": b.drift }}>
        </span>
        )}
      </div>
      <div className="foam-wrap">
        <div className="foam-core"></div>
      </div>
    </div>);

}

Object.assign(window, { Crest, Avatar, Crown, SplitButton, LeaderRow, PintBackground });