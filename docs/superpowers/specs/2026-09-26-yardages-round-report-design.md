# Trustworthy yardages and post-round review

Approved scope: the user's September 26 request to implement the recommended
carry/total correction and post-round report.

## Yardages

Carry and total distance are separate measurements. Existing carry fields become
carry-only; GPS measurements must never contribute to them. Add a separate total
summary and total gapping values. A shot with both measurements can contribute to
both summaries, once each. Ownership and round Trash exclusions apply to both.
No stored data or migrations change. Putter is excluded from dashboard/gapping.

Club detail, dashboard stock yardages, and gapping offer Carry / Total controls,
defaulting to carry, with units, measurement definitions, sample counts on club
summaries, and separate empty states. Legacy carry response fields remain for
compatibility; new total fields are additive.

## Round report

Derive a report from the round's snapshotted holes in the frontend. Place it above
the editable scorecard. Show front/back totals and scored-hole coverage, average
score and average to par for par 3/4/5 holes, doubles-or-worse, recorded penalties,
and putting coverage/one-putts/three-putts. Link highlighted holes to their editable
scorecard rows. Partial rounds use scored holes only; missing putts are unknown,
not zero. Back-nine rounds retain hole numbers 10–18. Show no scored-hole insights
when no scores exist. Categories overlap and must not be added into invented
strokes-lost totals. No strokes-gained claims or handicap changes.

## Decision log

- 2026-09-26: Supersedes the old decision to pool GPS total and range carry in
  one club average. Reports use existing round data without a new endpoint.
