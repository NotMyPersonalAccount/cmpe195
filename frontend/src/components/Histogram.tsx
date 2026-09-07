import { useState } from "react";

import { BUCKET_LABELS } from "../lib/types";

interface Props {
  histogram: number[];
}

const BAR_MAX_W = 24; // marks stay thin; the band's leftover is air

/**
 * Distribution across the five confusion buckets. Colour is an ordinal ramp in a
 * single hue -- the buckets are an ordered scale, not distinct identities, so
 * categorical hues would be the wrong language here.
 */
export function Histogram({ histogram }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const total = histogram.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...histogram);

  return (
    <figure className="panel">
      <figcaption className="label">Where the room sits</figcaption>

      <div className="hist">
        {/* The baseline belongs to the plot row, so it draws as one continuous
            axis rather than a segment under each column. */}
        <div className="hist-plots">
          {histogram.map((count, i) => (
            <div
              key={i}
              className="hist-col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${BUCKET_LABELS[i]}: ${count} of ${total}`}
            >
              {hover === i && (
                <div className="tip" role="tooltip">
                  <strong>{count}</strong> {count === 1 ? "person" : "people"}
                  <span className="tip-sub">confusion {BUCKET_LABELS[i]}</span>
                </div>
              )}
              {/* Value on the cap, only where there is one -- never a number on
                  every column. */}
              {count > 0 && <span className="hist-value">{count}</span>}
              <div
                className="hist-bar"
                data-step={i}
                style={{ height: `${(count / peak) * 100}%`, maxWidth: BAR_MAX_W }}
              />
            </div>
          ))}
        </div>

        <div className="hist-ticks" aria-hidden="true">
          {BUCKET_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>

      <div className="axis-note">
        <span>clear</span>
        <span>lost</span>
      </div>
    </figure>
  );
}
