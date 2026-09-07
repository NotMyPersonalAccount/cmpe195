import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { Histogram } from "../components/Histogram";
import { Meter } from "../components/Meter";
import { Sparkline, type Sample } from "../components/Sparkline";
import { useRoomSocket } from "../lib/useRoomSocket";
import { BUCKET_LABELS } from "../lib/types";

const MAX_SAMPLES = 120;

export function Dashboard() {
  const { roomId = "" } = useParams();
  const { state, connected } = useRoomSocket(roomId, "dashboard");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [showTable, setShowTable] = useState(false);
  const lastTs = useRef(0);

  useEffect(() => {
    if (!state || state.ts === lastTs.current) return;
    lastTs.current = state.ts;
    setSamples((prev) => [...prev, { ts: state.ts, average: state.average }].slice(-MAX_SAMPLES));
  }, [state]);

  const histogram = state?.histogram ?? [0, 0, 0, 0, 0];
  const total = histogram.reduce((a, b) => a + b, 0);

  return (
    <main className="page wide">
      <div className="stack">
        <header className="row spread">
          <div>
            <span className="label">Room code</span>
            <h1 className="room-code big">{roomId}</h1>
          </div>
          <span className="conn" data-on={connected}>
            {connected ? "live" : "reconnecting"}
          </span>
        </header>

        <section className="card">
          <Meter average={state?.average ?? 0} responding={state?.responding ?? 0} />
        </section>

        <div className="grid">
          <section className="card">
            <Histogram histogram={histogram} />
          </section>
          <section className="card">
            <Sparkline samples={samples} />
          </section>
        </div>

        <section className="card">
          <button className="btn btn-ghost" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Hide" : "Show"} the numbers
          </button>
          {showTable && (
            <table className="table">
              <caption className="sr-only">Confusion distribution by bucket</caption>
              <thead>
                <tr>
                  <th scope="col">Confusion</th>
                  <th scope="col">People</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {histogram.map((count, i) => (
                  <tr key={i}>
                    <th scope="row">{BUCKET_LABELS[i]}</th>
                    <td>{count}</td>
                    <td>{total ? `${Math.round((count / total) * 100)}%` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
