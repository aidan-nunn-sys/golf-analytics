import { Link } from "react-router-dom";
import { useHandicap } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { HandicapOverview } from "../components/HandicapOverview";
import { Sparkline } from "../components/Sparkline";

export function Handicap() {
  const { data, isLoading, error } = useHandicap();
  const rows = [...(data?.differentials ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.round_id - b.round_id);
  const history = rows.filter((row) => row.counts_toward_index && row.index_after !== null).map((row) => row.index_after!);
  return <div className="space-y-4">
    <h1 className="text-xl font-semibold">Handicap Index</h1>
    <AsyncBoundary loading={isLoading} error={error}>
      {data && <>
        <HandicapOverview data={data} />
        <Sparkline values={history} label="Handicap Index history" />
        <h2 className="text-lg font-semibold">Scoring record</h2>
        <p className="text-sm text-gray-600">Counting scores are highlighted. The Index uses the most recent 20 acceptable scores, or fewer while your record is building.</p>
        {rows.length === 0 ? <p>No finalized rounds yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <caption className="sr-only">Score differentials and Index eligibility</caption>
          <thead><tr><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Differential</th><th scope="col" className="p-2">Index status</th></tr></thead>
          <tbody>{rows.reverse().map((row) => <tr key={row.round_id} className={`border-t ${row.is_counting ? "bg-green-50" : ""}`}>
            <td className="whitespace-nowrap p-2"><Link className="text-green-700 underline" to={`/rounds/${row.round_id}/summary`}>{row.date}</Link></td>
            <td className="p-2">{row.differential === null ? "—" : String(row.differential)}</td>
            <td className="p-2">{row.is_counting ? <strong>Counting</strong> : row.reason ?? (row.counts_toward_index ? "Acceptable · not currently counting" : "Does not count toward Index")}</td>
          </tr>)}</tbody>
        </table></div>}
      </>}
    </AsyncBoundary>
  </div>;
}
