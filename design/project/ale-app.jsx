// Ale Parade Challenge — app logic
// Mock data + screens + tweaks. UI only; backend wired up separately.

const APC_STORE_KEY = "aleParade_v1";

const APC_FRIENDS = [
  { id: "sinead", name: "Sinéad", photo: "https://randomuser.me/api/portraits/women/65.jpg", count: 14 },
  { id: "connor", name: "Connor", photo: "https://randomuser.me/api/portraits/men/32.jpg", count: 8 },
  { id: "aoife",  name: "Aoife",  photo: "https://randomuser.me/api/portraits/women/44.jpg", count: 6 },
  { id: "declan", name: "Declan", photo: "https://randomuser.me/api/portraits/men/85.jpg", count: 4 },
  { id: "maya",   name: "Maya",   photo: "https://randomuser.me/api/portraits/women/68.jpg", count: 2 },
];
const APC_YOU_ID = "you";
const APC_YOU_DEFAULT = { id: APC_YOU_ID, name: "Brett", photo: "https://randomuser.me/api/portraits/men/11.jpg" };
const APC_YOU_SEED_COUNT = 9;

// Seeded per-person pour history (fixed labels); new entries get a real timestamp.
const apcS = (label) => ({ type: "split", label });
const apcU = (label) => ({ type: "undo", label });
const APC_HISTORY = {
  sinead: [apcS("2h ago"), apcS("7h ago"), apcS("Yesterday"), apcS("Yesterday"), apcS("3 days ago")],
  you:    [apcS("4h ago"), apcS("Yesterday"), apcS("2 days ago")],
  connor: [apcU("6h ago"), apcS("6h ago"), apcS("Yesterday"), apcS("4 days ago")],
  aoife:  [apcS("Yesterday"), apcS("3 days ago")],
  declan: [apcS("2 days ago"), apcS("5 days ago")],
  maya:   [apcS("Yesterday"), apcS("6 days ago")],
};

function apcLoad() {
  try { return JSON.parse(localStorage.getItem(APC_STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function apcSave(data) {
  try { localStorage.setItem(APC_STORE_KEY, JSON.stringify(data)); } catch (e) {}
}

function apcTimeText(entry) {
  if (entry.label) return entry.label;
  const mins = Math.floor((Date.now() - entry.ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

// Downscale an uploaded photo to a small square dataURL so it fits localStorage.
function apcReadPhoto(file, cb) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const S = 192;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d");
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    URL.revokeObjectURL(url);
    cb(c.toDataURL("image/jpeg", 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); };
  img.src = url;
}

const APC_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "warmth": 60,
  "goldIntensity": 65,
  "pintBg": true,
  "emptyState": false
}/*EDITMODE-END*/;

function SetupScreen({ onDone }) {
  const [name, setName] = React.useState("");
  const [photo, setPhoto] = React.useState(null);
  const fileRef = React.useRef(null);
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) apcReadPhoto(f, setPhoto);
    e.target.value = "";
  };
  const submit = () => { if (name.trim()) onDone(name.trim(), photo); };
  return (
    <div className="setup" data-screen-label="Profile setup">
      <Crest />
      <button type="button" className="uploader" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Add a profile photo">
        <span className="ring"></span>
        <Avatar src={photo} name={name || "?"} size={110} />
        <span className="cam">+</span>
        <span className="hint">{photo ? "Looking sharp" : "Add a photo"}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pick} />
      <input
        className="name-input"
        type="text"
        placeholder="Your name"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <button type="button" className="pour-in-btn" disabled={!name.trim()} onClick={submit}>
        Pour me in
      </button>
    </div>
  );
}

function MainScreen({ you, counts, historyById, onPour, onUndo, popKey }) {
  const [openId, setOpenId] = React.useState(null);
  const members = [you, ...APC_FRIENDS];
  const ranked = members
    .map((m, i) => ({ m, i, count: counts[m.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const anySplits = ranked.some((r) => r.count > 0);

  return (
    <div data-screen-label="Leaderboard">
      <Crest small />
      {!anySplits && (
        <div className="empty-banner">
          <div className="big">No one&rsquo;s split the G yet. Tragic.</div>
          <div className="small">Be the first &mdash; the crown is sitting right there.</div>
        </div>
      )}
      <div className="board">
        {ranked.map((r, idx) => {
          const history = historyById[r.m.id] || [];
          const net = history.reduce((n, e) => n + (e.type === "undo" ? -1 : 1), 0);
          return (
            <LeaderRow
              key={r.m.id}
              member={r.m}
              rank={idx + 1}
              isLeader={anySplits && idx === 0}
              isYou={r.m.id === APC_YOU_ID}
              count={r.count}
              popKey={r.m.id === APC_YOU_ID ? popKey : 0}
              onPour={onPour}
              onUndo={onUndo}
              history={history}
              hiddenCount={Math.max(0, r.count - net)}
              isOpen={openId === r.m.id}
              onToggle={() => setOpenId(openId === r.m.id ? null : r.m.id)}
            />
          );
        })}
      </div>
      <div className="footer-note">First sip decides</div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(APC_TWEAK_DEFAULTS);
  const stored = React.useMemo(apcLoad, []);

  const [profile, setProfile] = React.useState(stored.profile || APC_YOU_DEFAULT);
  const [screen, setScreen] = React.useState("main");
  const [youCount, setYouCount] = React.useState(
    typeof stored.youCount === "number" ? stored.youCount : APC_YOU_SEED_COUNT
  );
  const [extraFeed, setExtraFeed] = React.useState(stored.extraFeed || []);
  const [popKey, setPopKey] = React.useState(0);

  // Transient state for empty-state preview (not persisted)
  const [emptyCount, setEmptyCount] = React.useState(0);
  const [emptyFeed, setEmptyFeed] = React.useState([]);
  const prevEmpty = React.useRef(t.emptyState);
  React.useEffect(() => {
    if (t.emptyState && !prevEmpty.current) { setEmptyCount(0); setEmptyFeed([]); }
    prevEmpty.current = t.emptyState;
  }, [t.emptyState]);

  const persist = (next) => apcSave({ profile, youCount, extraFeed, ...next });

  const you = { id: APC_YOU_ID, name: profile.name, photo: profile.photo };
  const empty = !!t.emptyState;

  const counts = {};
  if (empty) {
    [you, ...APC_FRIENDS].forEach((m) => { counts[m.id] = 0; });
    counts[APC_YOU_ID] = emptyCount;
  } else {
    APC_FRIENDS.forEach((f) => { counts[f.id] = f.count; });
    counts[APC_YOU_ID] = youCount;
  }

  // Per-person breakdowns, with display-ready time strings
  const withTime = (list) => list.map((e) => ({ ...e, timeText: apcTimeText(e) }));
  const historyById = {};
  [you, ...APC_FRIENDS].forEach((m) => {
    if (empty) {
      historyById[m.id] = m.id === APC_YOU_ID ? withTime(emptyFeed) : [];
    } else {
      const seed = APC_HISTORY[m.id] || [];
      historyById[m.id] = m.id === APC_YOU_ID ? withTime([...extraFeed, ...seed]) : withTime(seed);
    }
  });

  const addEntry = (type) => ({ id: "e" + Date.now() + Math.random().toString(36).slice(2, 6), type, ts: Date.now() });

  const onPour = () => {
    setPopKey((n) => n + 1);
    if (empty) {
      setEmptyCount((c) => c + 1);
      setEmptyFeed((f) => [addEntry("split"), ...f]);
    } else {
      const nc = youCount + 1;
      const nf = [addEntry("split"), ...extraFeed].slice(0, 30);
      setYouCount(nc); setExtraFeed(nf);
      persist({ youCount: nc, extraFeed: nf });
    }
  };
  const onUndo = () => {
    setPopKey((n) => n + 1);
    if (empty) {
      if (emptyCount === 0) return;
      setEmptyCount((c) => c - 1);
      setEmptyFeed((f) => [addEntry("undo"), ...f]);
    } else {
      if (youCount === 0) return;
      const nc = youCount - 1;
      const nf = [addEntry("undo"), ...extraFeed].slice(0, 30);
      setYouCount(nc); setExtraFeed(nf);
      persist({ youCount: nc, extraFeed: nf });
    }
  };

  const finishSetup = (name, photo) => {
    const p = { id: APC_YOU_ID, name, photo: photo || null };
    setProfile(p);
    setScreen("main");
    apcSave({ profile: p, youCount, extraFeed });
  };

  const replaySetup = () => {
    try { localStorage.removeItem(APC_STORE_KEY); } catch (e) {}
    setScreen("setup");
  };

  // Theme derived from tweaks
  const warmChroma = (0.004 + (t.warmth / 100) * 0.03).toFixed(4);
  const goldChroma = (0.04 + (t.goldIntensity / 100) * 0.105).toFixed(4);
  const themeVars = {
    "--bg": `oklch(0.185 ${warmChroma} 62)`,
    "--bg-deep": `oklch(0.135 ${(warmChroma * 0.85).toFixed(4)} 62)`,
    "--stout": `oklch(0.24 ${Math.min(warmChroma, 0.022)} 60)`,
    "--stout-faint": `oklch(0.24 0.015 60 / 0.45)`,
    "--stout-card": `oklch(0.23 ${warmChroma} 62)`,
    "--stout-card-deep": `oklch(0.185 ${warmChroma} 62)`,
    "--cream": "oklch(0.93 0.022 88)",
    "--cream-gold": `oklch(0.89 ${Math.max(goldChroma * 0.45, 0.03)} 88)`,
    "--cream-edge": "oklch(0.93 0.022 88)",
    "--cream-dim": "oklch(0.93 0.022 88 / 0.55)",
    "--cream-faint": "oklch(0.93 0.022 88 / 0.18)",
    "--gold": `oklch(0.79 ${goldChroma} 85)`,
    "--gold-deep": `oklch(0.6 ${goldChroma} 80)`,
    "--gold-glow": `oklch(0.79 ${goldChroma} 85 / 0.45)`,
  };

  return (
    <div className={t.pintBg ? "stage pint" : "stage"} style={themeVars}>
      {t.pintBg && <PintBackground />}
      <div className="app">
        {screen === "setup" ? (
          <SetupScreen onDone={finishSetup} />
        ) : (
          <MainScreen
            you={you}
            counts={counts}
            historyById={historyById}
            onPour={onPour}
            onUndo={onUndo}
            popKey={popKey}
          />
        )}
        <TweaksPanel>
          <TweakSection label="Theme" />
          <TweakSlider label="Background warmth" value={t.warmth} min={0} max={100} step={5}
                       onChange={(v) => setTweak("warmth", v)} />
          <TweakSlider label="Gold intensity" value={t.goldIntensity} min={0} max={100} step={5}
                       onChange={(v) => setTweak("goldIntensity", v)} />
          <TweakToggle label="Pint background" value={t.pintBg}
                       onChange={(v) => setTweak("pintBg", v)} />
          <TweakSection label="States" />
          <TweakToggle label="Empty state (no splits)" value={t.emptyState}
                       onChange={(v) => setTweak("emptyState", v)} />
          <TweakButton label="Replay first-run setup" onClick={replaySetup} />
        </TweaksPanel>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
