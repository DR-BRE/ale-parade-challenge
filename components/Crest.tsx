export default function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? "crest small" : "crest"}>
      <h1 className="crest-name">
        Ale <span className="amp">Parade</span>
      </h1>
      <div className="crest-sub">Split-the-G Honours · Est. 1759</div>
    </div>
  );
}
