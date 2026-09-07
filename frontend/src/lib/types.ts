export interface RoomState {
  room_id: string;
  /** Mean of every submitted score, 0-100. */
  average: number;
  /** People who have moved their slider -- not people connected. */
  responding: number;
  /** Five buckets of 20 points, low confusion first. */
  histogram: number[];
  ts: number;
}

export type Role = "student" | "dashboard";

export const BUCKET_LABELS = ["0-20", "20-40", "40-60", "60-80", "80-100"];

/** Severity bands for the meter. Status colour never travels without this label. */
export const BANDS = [
  { max: 25, label: "Following along", token: "good" },
  { max: 50, label: "Some drift", token: "warning" },
  { max: 75, label: "Losing the room", token: "serious" },
  { max: 101, label: "Lost", token: "critical" },
] as const;

export function bandFor(average: number) {
  return BANDS.find((b) => average < b.max) ?? BANDS[BANDS.length - 1];
}
