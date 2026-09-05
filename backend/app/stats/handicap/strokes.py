"""Stroke allocation and per-hole score caps (Rules 3.1, 3.2)."""


def strokes_received(course_handicap: int, stroke_index: int) -> int:
    """Handicap strokes a player receives on one hole.

    A player receives one stroke on every hole whose stroke index is <= their
    Course Handicap, and an additional stroke on holes whose stroke index is
    <= Course Handicap - 18, continuing upward.

    A plus handicap gives strokes back to the course beginning at stroke
    index 18 (Appendix C), so a +2 gives back on stroke indexes 18 and 17.
    The return value is negative in that case.
    """
    if course_handicap >= 0:
        full, remainder = divmod(course_handicap, 18)
        return full + (1 if stroke_index <= remainder else 0)

    given_back = -course_handicap
    full, remainder = divmod(given_back, 18)
    return -(full + (1 if stroke_index > 18 - remainder else 0))


def net_double_bogey(par: int, stroke_index: int, course_handicap: int) -> int:
    """Rule 3.1b: par + 2 + any handicap strokes received on that hole."""
    return par + 2 + strokes_received(course_handicap, stroke_index)


def max_hole_score(par: int, stroke_index: int, course_handicap: int | None) -> int:
    """The maximum score recordable on a hole.

    Rule 3.1a: par + 5 for a player without an established Handicap Index
    (`course_handicap is None`). Rule 3.1b: net double bogey thereafter.
    """
    if course_handicap is None:
        return par + 5
    return net_double_bogey(par, stroke_index, course_handicap)


def net_par(par: int, stroke_index: int, course_handicap: int) -> int:
    """Score assigned to a hole that was not played.

    Rule 3.2b specifies the player's expected score, whose calculation the
    USGA does not publish. Clarification 3.2b/2 permits net par instead with
    Authorized Association approval; this Index is unofficial, so the spec
    self-authorizes that substitution. See spec 2.3.
    """
    return par + strokes_received(course_handicap, stroke_index)
