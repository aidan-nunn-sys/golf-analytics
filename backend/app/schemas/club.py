from pydantic import BaseModel, ConfigDict


class ClubOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    category: str
    order_index: int
    loft: float | None
    brand_model: str | None
    is_active: bool


class ClubCreate(BaseModel):
    label: str
    category: str
    order_index: int = 0
    loft: float | None = None
    brand_model: str | None = None


class ClubUpdate(BaseModel):
    label: str | None = None
    category: str | None = None
    order_index: int | None = None
    loft: float | None = None
    brand_model: str | None = None
    is_active: bool | None = None
