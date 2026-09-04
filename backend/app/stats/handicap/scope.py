"""A round's rating scope: which TeeRating it uses and which holes it covers.

Scope is DECLARED at round creation from `hole_count`/`nine` and then fixed
(spec 3.2) — an 18-hole round abandoned at hole 12 is still an 18-hole round
against the 18-hole rating, with holes 13–18 valued at net par.

Two callers ask the same question and used to answer it separately: the
rounds router, which snapshots the rating for the declared scope, and the
stats adapter, which slices a round's holes before handing them to the walk.
Divergence there is how a nine came to be scored over all eighteen holes, so
both now ask here.
"""

SCOPES = ("18", "front9", "back9")

# How a scope is named in a message aimed at a human ("this tee has no
# front-9 rating"), per the wording spec 3.2 asks for.
_LABELS = {"18": "18-hole", "front9": "front-9", "back9": "back-9"}


def scope_for(hole_count: int, nine: str | None) -> str:
    """The TeeRating scope a round of this shape is played against."""
    return "18" if hole_count == 18 else f"{nine}9"


def scope_label(scope: str) -> str:
    """Human-facing name for a scope, for use in a non-acceptability reason."""
    return _LABELS.get(scope, scope)


def covers_hole(scope: str, hole_number: int) -> bool:
    """Whether hole `hole_number` is part of a round played to this scope.

    A course always has all 18 `RoundHole` rows created for it, so the front
    nine of a course is holes 1–9 and the back nine is holes 10–18; an
    18-hole scope covers everything.
    """
    if scope == "front9":
        return hole_number <= 9
    if scope == "back9":
        return hole_number >= 10
    return True
