from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    is_admin: bool
    unit_preference: str
    created_at: datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""


class UserUpdate(BaseModel):
    display_name: str | None = None
    unit_preference: str | None = None  # "yards" or "meters"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
