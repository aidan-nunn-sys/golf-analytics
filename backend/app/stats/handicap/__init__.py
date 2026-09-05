"""WHS handicap calculation.

Pure functions over explicit arguments — no DB access, no ordering knowledge
outside `history`. Every constant is cited to the Rules of Handicapping
effective January 2024; see the spec's rule-verification table before
changing any of them.
"""
