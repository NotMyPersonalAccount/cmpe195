import { bandFor } from "../lib/types";

interface Props {
  average: number;
  responding: number;
}

/**
 * Hero figure + meter. A single ratio against a limit is a meter, not a dial or
 * a two-slice pie. The status colour never carries the reading alone -- the band
 * label beside it always says the same thing in words.
 */
export function Meter({ average, responding }: Props) {
  const band = bandFor(average);
  const pct = Math.max(0, Math.min(100, average));
  const idle = responding === 0;

  return (
    <div className="meter">
      <div className="meter-head">
        <span className="label">Room confusion</span>
        <span className="meter-band" data-status={idle ? "none" : band.token}>
          <span className="meter-dot" aria-hidden="true" />
          {idle ? "No responses yet" : band.label}
        </span>
      </div>

      <div className="hero">
        {idle ? "--" : Math.round(average)}
        <span className="hero-unit">/ 100</span>
      </div>

      <div
        className="meter-track"
        role="meter"
        aria-valuenow={idle ? undefined : Math.round(average)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Average confusion level"
        data-status={idle ? "none" : band.token}
      >
        <div className="meter-fill" style={{ width: `${idle ? 0 : pct}%` }} />
      </div>

      <p className="meter-foot">
        {responding === 0
          ? "Nobody has moved their slider yet."
          : `${responding} ${responding === 1 ? "person has" : "people have"} responded`}
      </p>
    </div>
  );
}
