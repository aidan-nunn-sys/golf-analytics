import { Link } from "react-router-dom";
import type { Handicap } from "../api/types";
import { StatCard } from "./StatCard";

const indexLabel = (value: number | null) => value === null ? "—" : value < 0 ? `+${Math.abs(value).toFixed(1)}` : value.toFixed(1);

export function HandicapOverview({ data }: { data: Handicap }) {
  return <div className="space-y-3">
    <p className="text-sm text-gray-600">This Index is for personal use and is not an official World Handicap System record.</p>
    {data.index === null ? <p>Need {data.rounds_needed} more acceptable {data.rounds_needed === 1 ? "round" : "rounds"} to establish an Index.</p> : <div className="grid grid-cols-2 gap-3">
      <StatCard label="Index" value={indexLabel(data.index)} />
      <StatCard label="Low Index" value={indexLabel(data.low_index)} />
    </div>}
    {data.cap_applied && <p className="text-sm">{data.cap_applied === "soft" ? "Soft" : "Hard"} cap applied{data.cap_adjustment === null ? "." : `: reduced the calculated Index by ${data.cap_adjustment.toFixed(1)}.`}</p>}
    <Link to="/rounds/new" className="inline-block text-sm text-green-700 underline">Enter a past round</Link>
  </div>;
}
