from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AdminUserOut(BaseModel):
    id: int
    email: str


class LoginResponse(BaseModel):
    user: AdminUserOut
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
