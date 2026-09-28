from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.tee import Scope, TeeRatingIn

SourceId = Literal['rga-public', 'lonnie-poole']


class ImportedHole(BaseModel):
    number: int = Field(ge=1, le=18)
    par: int = Field(ge=3, le=6)
    stroke_index: int = Field(ge=1, le=18)


class ImportedRating(TeeRatingIn):
    scope: Scope


class ImportedTee(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=60)
    yardage: int = Field(gt=0, le=12000)
    ratings: list[ImportedRating] = Field(min_length=1)


class ScorecardData(BaseModel):
    source_id: SourceId
    course_name: str
    source_urls: list[str]
    retrieved_at: datetime
    holes: list[ImportedHole]
    tees: list[ImportedTee] = Field(min_length=1)
    notes: list[str] = []

    @model_validator(mode='after')
    def validate_card(self):
        if [h.number for h in self.holes] != list(range(1, 19)):
            raise ValueError('The source must contain exactly 18 ordered holes')
        if sorted(h.stroke_index for h in self.holes) != list(range(1, 19)):
            raise ValueError('The source has ambiguous stroke indexes')
        if len({t.key for t in self.tees}) != len(self.tees):
            raise ValueError('The source contains duplicate tees')
        for tee in self.tees:
            if len({r.scope for r in tee.ratings}) != len(tee.ratings):
                raise ValueError('Duplicate rating scope')
            for rating in tee.ratings:
                holes = self.holes[:9] if rating.scope == 'front9' else self.holes[9:] if rating.scope == 'back9' else self.holes
                if rating.par != sum(h.par for h in holes):
                    raise ValueError('Published par does not match the scorecard')
        return self


class ScorecardRequest(BaseModel):
    source_id: SourceId


class ScorecardPreview(BaseModel):
    card: ScorecardData
    conflicts: list[str]
    token: str


class ScorecardApply(BaseModel):
    token: str = Field(max_length=40000)
    replace_conflicts: bool = False
