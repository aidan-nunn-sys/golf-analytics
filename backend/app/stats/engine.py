import pandas as pd


def compute_club_stats(shots: list[dict]) -> dict:
    if not shots:
        return {
            "count": 0,
            "avg_carry": None,
            "median_carry": None,
            "consistency": None,
            "min_carry": None,
            "max_carry": None,
            "direction": {"left": 0, "straight": 0, "right": 0},
        }
    df = pd.DataFrame(shots)
    carry = df["carry_yards"]
    return {
        "count": int(len(df)),
        "avg_carry": round(float(carry.mean()), 1),
        "median_carry": round(float(carry.median()), 1),
        "consistency": round(float(carry.std(ddof=0)), 1),
        "min_carry": float(carry.min()),
        "max_carry": float(carry.max()),
        "direction": {
            "left": int((df["direction"] == "left").sum()),
            "straight": int((df["direction"] == "straight").sum()),
            "right": int((df["direction"] == "right").sum()),
        },
    }


def compute_gapping(clubs: list[dict]) -> list[dict]:
    ranked = sorted(
        (c for c in clubs if c.get("avg_carry") is not None),
        key=lambda c: c["avg_carry"],
        reverse=True,
    )
    rows: list[dict] = []
    for i, club in enumerate(ranked):
        gap = None
        if i + 1 < len(ranked):
            gap = round(club["avg_carry"] - ranked[i + 1]["avg_carry"], 1)
        rows.append({**club, "gap_to_next": gap})
    return rows
