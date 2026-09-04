"""The chronological walk over a player's scoring record.

This is the ONLY module in the handicap package that knows about ordering.
Adjusted Gross Score depends on Course Handicap, which depends on the
Handicap Index established by EARLIER rounds; caps depend on the Low Handicap
Index over the preceding 365 days. So a round cannot be evaluated in
isolation — the record is replayed in date order, carrying state forward.

Nothing here is persisted. Raw hole scores remain the single source of truth,
so correcting an old round repairs every downstream number automatically
(spec 2.5, Approach A).
"""

from datetime import date, timedelta
from typing import TypedDict

from app.stats.handicap.differential import (
    HoleScore,
    adjusted_gross_score,
    score_differential_9,
    score_differential_18,
)
from app.stats.handicap.index import (
    DIFFERENTIALS_TABLE,
    apply_caps,
    course_handicap,
    handicap_index,
)

MIN_HOLES_FOR_18 = 10   # Rule 2.2a
HOLES_FOR_9 = 9         # Rule 2.2b
LOW_INDEX_MIN_SCORES = 20  # Rule 5.7
LOW_INDEX_WINDOW_DAYS = 365  # Rule 5.7


class RoundRecord(TypedDict):
    round_id: int
    date: date
    scope: str  # "18" | "front9" | "back9"
    course_rating: float | None
    slope_rating: int | None
    par: int | None
    holes: list[HoleScore]


class RoundResult(TypedDict):
    round_id: int
    date: date
    differential: float | None
    counts_toward_index: bool
    reason: str | None
    index_after: float | None


def _acceptability(record: RoundRecord, holes_played: int) -> str | None:
    """Why this round cannot count, or None if it can."""
    if record["course_rating"] is None or record["slope_rating"] is None:
        return "This tee has no rating for the scope played"
    if record["scope"] != "18":
        if holes_played < HOLES_FOR_9:
            return f"Only {holes_played} holes scored; a 9-hole score requires all 9"
        return "9-hole rounds do not count toward the Index (see spec 2.3)"
    if holes_played < MIN_HOLES_FOR_18:
        return f"Only {holes_played} holes scored; an 18-hole score needs at least 10 holes"
    return None


def _meets_scope_minimum(record: RoundRecord, holes_played: int) -> bool:
    """Whether enough holes were scored to compute a displayable differential."""
    if record["scope"] == "18":
        return holes_played >= MIN_HOLES_FOR_18
    return holes_played >= HOLES_FOR_9


def walk_history(rounds: list[RoundRecord]) -> list[RoundResult]:
    """Replay the record in date order, returning one result per round."""
    ordered = sorted(rounds, key=lambda r: (r["date"], r["round_id"]))

    results: list[RoundResult] = []
    counting: list[float] = []  # differentials that feed the Index, oldest first
    index_history: list[tuple[date, float]] = []

    for record in ordered:
        holes_played = sum(1 for h in record["holes"] if h["strokes"] is not None)
        reason = _acceptability(record, holes_played)

        # The Index in effect BEFORE this round determines its Course Handicap.
        index_before = handicap_index(counting)
        ch = (
            None
            if index_before is None
            else course_handicap(
                index_before,
                record["slope_rating"],
                record["course_rating"],
                record["par"],
            )
        )

        differential: float | None = None
        if (
            record["course_rating"] is not None
            and record["slope_rating"] is not None
            and _meets_scope_minimum(record, holes_played)
        ):
            ags = adjusted_gross_score(record["holes"], ch)
            if record["scope"] == "18":
                differential = score_differential_18(
                    ags, record["course_rating"], record["slope_rating"]
                )
            else:
                # Left UNROUNDED on purpose: Rule 5.1b rounds only once the
                # 9-hole differential is combined with the player's expected
                # score over the other nine, and that table is unpublished
                # (spec 2.3). This value is displayed, never combined, so
                # rounding it here would round at a step the Rules do not
                # have. Matches `score_differential_9`'s own docstring.
                differential = score_differential_9(
                    ags, record["course_rating"], record["slope_rating"]
                )

        if reason is None and differential is not None:
            counting.append(differential)

        index_after = handicap_index(counting)
        if index_after is not None:
            index_history.append((record["date"], index_after))

        results.append(
            {
                "round_id": record["round_id"],
                "date": record["date"],
                "differential": differential,
                "counts_toward_index": reason is None,
                "reason": reason,
                "index_after": index_after,
            }
        )

    return results


def _low_index(
    index_history: list[tuple[date, float]], counting_scores: int
) -> float | None:
    """Lowest Index over the 365 days preceding the most recent score's date.

    Rule 5.7 establishes a Low Handicap Index only once the player has at
    least 20 acceptable scores, so this returns None below that.
    """
    if counting_scores < LOW_INDEX_MIN_SCORES or not index_history:
        return None
    anchor = index_history[-1][0]
    cutoff = anchor - timedelta(days=LOW_INDEX_WINDOW_DAYS)
    window = [idx for when, idx in index_history if when >= cutoff]
    return min(window) if window else None


def current_state(results: list[RoundResult]) -> dict:
    """Summarize a walked history into the player's present handicap state."""
    counting = [
        r for r in results if r["counts_toward_index"] and r["differential"] is not None
    ]
    differentials = [r["differential"] for r in counting]
    calculated = handicap_index(differentials)

    index_history = [
        (r["date"], r["index_after"]) for r in results if r["index_after"] is not None
    ]
    low = _low_index(index_history, len(counting))

    index, cap_applied = (
        (None, None) if calculated is None else apply_caps(calculated, low)
    )

    recent = counting[-20:]
    counting_ids: list[int] = []
    if len(recent) >= 3:
        take, _ = DIFFERENTIALS_TABLE[len(recent)]
        counting_ids = [
            r["round_id"]
            for r in sorted(recent, key=lambda r: r["differential"])[:take]
        ]

    return {
        "index": index,
        "low_index": low,
        "cap_applied": cap_applied,
        "rounds_needed": max(0, 3 - len(counting)),
        "counting_round_ids": counting_ids,
    }
