import { useState } from "react";

export interface Sample {
  ts: number;
  average: number;
}

interface Props {
  samples: Sample[];
}

// Sized so the plot renders at roughly the histogram's 190px height in the
// dashboard's two-column grid, keeping the paired panels visually level.
const W = 640;
const H = 300;
const PAD = { top: 14, right: 16, bottom: 10, left: 16 };

/**
 * Room average over time. One series, so no legend box -- the caption already
 * names what is plotted. Crosshair and tooltip on hover, per the interaction rule.
 */
export function Sparkline({ samples }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  if (samples.length < 2) {
    return (
      <figure className="panel">
        <figcaption className="label">Average over time</figcaption>
        <p className="empty">Collecting -- the trend appears once the room starts moving.</p>
      </figure>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (samples.length - 1)) * innerW;
  // Fixed 0-100 domain: the slider's range is the meaningful scale, and a
  // self-scaling axis would make a 2-point wobble look like a crisis.
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH;

  const line = samples.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s.average)}`).join(" ");
  const area = `${line} L${x(samples.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const last = samples[samples.length - 1];
  const active = hover === null ? null : samples[hover];

  return (
    <figure className="panel">
      <figcaption className="label">Average over time</figcaption>

      <div className="spark-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="spark"
          role="img"
          aria-label={`Room average over the last ${samples.length} samples, currently ${Math.round(last.average)} out of 100`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const rel = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((rel - PAD.left) / innerW) * (samples.length - 1));
            setHover(Math.max(0, Math.min(samples.length - 1, i)));
          }}
        >
          {[0, 50, 100].map((v) => (
            <line key={v} className="spark-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
          ))}

          <path className="spark-area" d={area} />
          <path className="spark-line" d={line} />

          {active && (
            <>
              <line className="crosshair" x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + innerH} />
              {/* 2px surface ring keeps the dot legible where it crosses the line */}
              <circle className="spark-dot-ring" cx={x(hover!)} cy={y(active.average)} r={6} />
              <circle className="spark-dot" cx={x(hover!)} cy={y(active.average)} r={4} />
            </>
          )}

          {!active && (
            <>
              <circle className="spark-dot-ring" cx={x(samples.length - 1)} cy={y(last.average)} r={6} />
              <circle className="spark-dot" cx={x(samples.length - 1)} cy={y(last.average)} r={4} />
            </>
          )}
        </svg>

        {active && (
          <div className="tip tip-float" style={{ left: `${(x(hover!) / W) * 100}%` }} role="tooltip">
            <strong>{Math.round(active.average)}</strong> / 100
            <span className="tip-sub">
              {new Date(active.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
