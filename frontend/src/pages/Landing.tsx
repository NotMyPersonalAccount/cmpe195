import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`server said ${res.status}`);
      const { room_id } = await res.json();
      navigate(`/dash/${room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not reach the server");
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (clean) navigate(`/r/${clean}`);
  };

  return (
    <main className="page centred">
      <div className="stack">
        <header>
          <h1>Confusion Level</h1>
          <p className="sub">
            A live read on how lost the room is. Students slide, everyone sees the average.
          </p>
        </header>

        <section className="card">
          <h2>Join a room</h2>
          <form onSubmit={join} className="row">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn" type="submit" disabled={!code.trim()}>
              Join
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Teaching?</h2>
          <p className="sub">Open a room and put the code on the projector.</p>
          <button className="btn btn-primary" onClick={createRoom} disabled={busy}>
            {busy ? "Creating..." : "Create a room"}
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </main>
  );
}
