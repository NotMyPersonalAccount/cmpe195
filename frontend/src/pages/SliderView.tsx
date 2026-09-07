import { useState } from "react";
import { useParams } from "react-router-dom";

import { Meter } from "../components/Meter";
import { useRoomSocket } from "../lib/useRoomSocket";

const START = 0;

export function SliderView() {
  const { roomId = "" } = useParams();
  const { state, connected, sendScore } = useRoomSocket(roomId, "student");
  const [value, setValue] = useState(START);
  const [touched, setTouched] = useState(false);

  const onChange = (next: number) => {
    setValue(next);
    setTouched(true);
    sendScore(next);
  };

  return (
    <main className="page">
      <div className="stack">
        <header className="row spread">
          <div>
            <span className="label">Room</span>
            <h1 className="room-code">{roomId}</h1>
          </div>
          <span className="conn" data-on={connected}>
            {connected ? "live" : "reconnecting"}
          </span>
        </header>

        <section className="card">
          <div className="row spread">
            <label className="label" htmlFor="slider">
              How lost are you?
            </label>
            <span className="own-value">{touched ? value : "--"}</span>
          </div>

          <input
            id="slider"
            className="slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ ["--pct" as string]: `${value}%` }}
          />

          <div className="axis-note">
            <span>crystal clear</span>
            <span>totally lost</span>
          </div>

          {!touched && (
            <p className="hint">
              Move the slider to join the average. Nothing is recorded until you do.
            </p>
          )}
        </section>

        <section className="card">
          <Meter average={state?.average ?? 0} responding={state?.responding ?? 0} />
        </section>
      </div>
    </main>
  );
}
