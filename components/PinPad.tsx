export function PinPad({
  value,
  onChange,
  onSubmit,
  length = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  length?: number;
}) {
  const press = (k: string) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) setTimeout(() => onSubmit(next), 90);
  };
  return (
    <>
      <div className="cf-pins">
        {Array.from({ length }).map((_, i) => (
          <i key={i} data-on={i < value.length ? "1" : "0"} />
        ))}
      </div>
      <div className="cf-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
          <button key={k} type="button" className="cf-key" onClick={() => press(k)} aria-label={`Digit ${k}`}>
            {k}
          </button>
        ))}
        <button
          type="button"
          className="cf-key"
          style={{ opacity: 0, pointerEvents: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        >
          ·
        </button>
        <button type="button" className="cf-key" onClick={() => press("0")} aria-label="Digit 0">
          0
        </button>
        <button type="button" className="cf-key" onClick={() => press("del")} aria-label="Delete">
          ←
        </button>
      </div>
    </>
  );
}
