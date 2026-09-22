# Scoring trends and practice priorities

The dashboard shows recent scoring and concrete practice suggestions using existing round data.

## Behavior

- Use the latest 20 finalized rounds returned by the existing trends endpoint.
- Separate 9-hole and 18-hole rounds; exclude incomplete scorecards from comparisons.
- Show the latest five eligible rounds, their mean and best gross score, and links to scorecards.
- Compare the latest five against the preceding five only when both groups are available. Scores are not adjusted for course difficulty.
- Suggest putting distance control when recorded three-putts exist, and safer landing-area practice when recorded penalty strokes exist.
- Show missing putt coverage explicitly. Suggestions are simple observations, not strokes-gained estimates or a comprehensive ranking of weaknesses.

## API

Add round ID, date, declared hole count, scored-hole count, and recorded-putt-hole count to each `/api/stats/rounds` entry. Preserve existing averages and per-round stats. Order by descending date and ID for stable ties. No database migration.

## Verification

Cover round-length separation, incomplete scorecards, chronological comparisons, evidence-based suggestions, missing putting data, empty/loading/error states, and API metadata.
