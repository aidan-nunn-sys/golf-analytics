"""Derived per-round statistics.

Everything here is computed on demand from hole rows — nothing is stored,
per the repo's derived-stats convention. Holes missing the data a stat needs
are excluded from that stat's DENOMINATOR rather than counted as zero, so a
half-filled scorecard never reports 0% fairways.
"""


def _pct(hit: int, possible: int) -> float | None:
    return round(100 * hit / possible, 1) if possible else None


def compute_round_stats(holes: list[dict]) -> dict:
    scored = [h for h in holes if h.get("strokes") is not None]

    score = sum(h["strokes"] for h in scored)
    par_total = sum(h["par"] for h in scored)

    # Fairways: par 3s are excluded from the denominator entirely.
    fairway_holes = [
        h for h in holes if h["par"] >= 4 and h.get("fairway_hit") is not None
    ]
    fairways_hit = sum(1 for h in fairway_holes if h["fairway_hit"])

    # GIR needs both strokes and putts: strokes - putts is the number of shots
    # taken to reach the green, and regulation is par - 2.
    gir_eligible = [h for h in scored if h.get("putts") is not None]

    # Partition gir_eligible by index rather than by `h not in gir_holes`:
    # `in` on a list of dicts compares by value, so two holes with identical
    # par/strokes/putts/fairway_hit/penalties would be indistinguishable
    # under a value-based membership check. Index-based partitioning is also
    # O(n) instead of O(n^2).
    gir_idx = {
        i for i, h in enumerate(gir_eligible)
        if h["strokes"] - h["putts"] <= h["par"] - 2
    }
    gir_holes = [h for i, h in enumerate(gir_eligible) if i in gir_idx]
    missed_gir = [h for i, h in enumerate(gir_eligible) if i not in gir_idx]

    putt_holes = [h for h in holes if h.get("putts") is not None]
    putts_total = sum(h["putts"] for h in putt_holes)
    gir_putts = sum(h["putts"] for h in gir_holes)

    # Scrambling: of holes that missed GIR, the share still made in par or better.
    scrambles = sum(1 for h in missed_gir if h["strokes"] <= h["par"])

    return {
        "score": score,
        "to_par": score - par_total,
        "fairways_hit": fairways_hit,
        "fairways_possible": len(fairway_holes),
        "fairway_pct": _pct(fairways_hit, len(fairway_holes)),
        "gir": len(gir_holes),
        "gir_pct": _pct(len(gir_holes), len(gir_eligible)),
        "putts": putts_total,
        "putts_per_gir": (
            round(gir_putts / len(gir_holes), 2) if gir_holes else None
        ),
        "one_putts": sum(1 for h in putt_holes if h["putts"] == 1),
        "three_putts": sum(1 for h in putt_holes if h["putts"] >= 3),
        "scrambling_pct": _pct(scrambles, len(missed_gir)),
        "penalties": sum(h.get("penalties") or 0 for h in holes),
    }
