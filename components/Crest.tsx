export default function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? "crest small" : "crest"}>
      <div className="crest-rule"><span className="crest-diamond" /></div>
      <div className="crest-est" style={{ fontSize: 14 }}>EST. 1759</div>
      <h1 className="crest-name" style={{ fontSize: 34 }}>
        Ale Parade<br />
        <span className="amp" style={{ fontSize: 32 }}>Challenge</span>
      </h1>
      <div className="crest-sub" style={{ fontSize: 12 }}>Split-the-G Tally</div>
      <div className="crest-rule"><span className="crest-diamond" /></div>
    </div>
  );
}
