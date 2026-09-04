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
from app.stats.handicap.scope import scope_label

MIN_HOLES_FOR_18 = 10   # Rule 2.2a
HOLES_FOR_9 = 9         # Rule 2.2b
LOW_INDEX_MIN_SCORES = 20  # Rule 5.7
LOW_INDEX_WINDOW_DAYS = 365  # Rule 5.7


class RoundRecord(TypedDict):
    round_id: int
    date: date
    scope: str  # "18" | "front9" | "back9"
    tee_set_id: int | None  # only to tell "no tee" from "tee without a rating"
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


def _meets_scope_minimum(record: RoundRecord, holes_played: int) -> bool:
    """Whether enough holes were scored to compute a displayable differential.

    Rule 2.2a for an 18-hole score, Rule 2.2b for a 9-hole one. This is the
    single place the thresholds are compared; `_acceptability` calls it rather
    than restating them, so the two can never drift apart.
    """
    if record["scope"] == "18":
        return holes_played >= MIN_HOLES_FOR_18
    return holes_played >= HOLES_FOR_9


def _has_stroke_indexes(record: RoundRecord) -> bool:
    """Whether every hole in scope carries a stroke index.

    Spec 3.1 makes stroke index a precondition for acceptability: net double
    bogey (Rule 3.1b) and net par (Clarification 3.2b/2) both allocate strokes
    by it, so without it there is no defensible Adjusted Gross Score.
    """
    return all(hole["stroke_index"] is not None for hole in record["holes"])


def _acceptability(record: RoundRecord, holes_played: int) -> str | None:
    """Why this round cannot count, or None if it can.

    Spec 2.3: a round that is not handicap-acceptable must say why BY NAME,
    never a silent null.
    """
    if record["course_rating"] is None or record["slope_rating"] is None:
        # Two different situations that used to share one vague message. A
        # round with no tee attached is incomplete setup; a round on a tee
        # that is simply unrated for the nine played is the case spec 3.2
        # asks to be named ("this tee has no front-9 rating").
        if record.get("tee_set_id") is None:
            return "No tee set is attached to this round, so it has no rating"
        return f"This tee has no {scope_label(record['scope'])} rating"
    if not _has_stroke_indexes(record):
        return "This course has no stroke indexes set"
    if not _meets_scope_minimum(record, holes_played):
        if record["scope"] == "18":
            return (
                f"Only {holes_played} holes scored; an 18-hole score needs at "
                f"least {MIN_HOLES_FOR_18} holes"
            )
        return (
            f"Only {holes_played} holes scored; a 9-hole score requires all "
            f"{HOLES_FOR_9}"
        )
    if record["scope"] != "18":
        return "9-hole rounds do not count toward the Index (see spec 2.3)"
    return None


def _established_index(
    counting: list[float],
    index_history: list[tuple[date, float]],
    anchor: date,
) -> float | None:
    """The Handicap Index established by the scores accumulated so far.

    POST-CAP, deliberately. Spec 2.4 defines the player's Index as the value
    after Rule 5.8's soft/hard caps, and spec 2.5 says each round is adjusted
    using "the Index established by the rounds preceding it" — so the Index
    the walk computes with must be the same one it reports. Using the raw
    `handicap_index` here meant a capped player's net double bogeys were
    allocated off an Index several strokes higher than the one on screen.

    `anchor` is the date the 365-day Low Index window is measured back from
    (Rule 5.7); mid-walk that is the round being evaluated, not today.
    """
    calculated = handicap_index(counting)
    if calculated is None:
        return None
    low = _low_index(index_history, len(counting), anchor)
    index, _cap = apply_caps(calculated, low)
    return index


def walk_history(rounds: list[RoundRecord]) -> list[RoundResult]:
    """Replay the record in date order, returning one result per round."""
    ordered = sorted(rounds, key=lambda r: (r["date"], r["round_id"]))

    results: list[RoundResult] = []
    counting: list[float] = []  # differentials that feed the Index, oldest first
    # (date, Index) after each round that had one. Feeds the Low Index window,
    # which is why it must hold capped values — see `_established_index`.
    index_history: list[tuple[date, float]] = []

    for record in ordered:
        holes_played = sum(1 for h in record["holes"] if h["strokes"] is not None)
        reason = _acceptability(record, holes_played)

        # The Index in effect BEFORE this round determines its Course Handicap.
        index_before = _established_index(counting, index_history, record["date"])
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
            and _has_stroke_indexes(record)
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

        index_after = _established_index(counting, index_history, record["date"])
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
    index_history: list[tuple[date, float]],
    counting_scores: int,
    anchor: date | None = None,
) -> float | None:
    """Lowest Index over the 365 days preceding `anchor`.

    Rule 5.7 establishes a Low Handicap Index only once the player has at
    least 20 acceptable scores, so this returns None below that.

    `anchor` defaults to the date of the most recent score in the history,
    which is what Rule 5.7 specifies for the player's current state. The walk
    passes the date of the round it is evaluating instead, so a round played
    after a long lay-off is measured against its own 365 days rather than the
    window that happened to end at the previous score.
    """
    if counting_scores < LOW_INDEX_MIN_SCORES or not index_history:
        return None
    if anchor is None:
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
