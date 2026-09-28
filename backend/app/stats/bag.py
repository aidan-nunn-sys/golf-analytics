"""Empirical distance distributions. No trimming or probability claims."""
from math import floor, isfinite


def distribution(measurements):
    valid = [(float(value), played) for value, played in measurements
             if value is not None and isfinite(value) and value > 0]
    values = sorted(value for value, _ in valid)
    excluded = sum(value is not None for value, _ in measurements) - len(values)

    def percentile(fraction):
        if not values:
            return None
        position = (len(values) - 1) * fraction
        lower = floor(position)
        upper = min(lower + 1, len(values) - 1)
        return round(values[lower] + (values[upper] - values[lower]) * (position - lower), 1)

    return dict(count=len(values), excluded=excluded, median=percentile(.5),
                p10=percentile(.1), p90=percentile(.9),
                minimum=min(values) if values else None,
                maximum=max(values) if values else None,
                last_played=max(played for _, played in valid).isoformat() if valid else None)
