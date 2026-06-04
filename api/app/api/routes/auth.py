from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.models.user import User


router = APIRouter(prefix="/auth")
http_bearer = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    role: Literal["user", "admin"]


class LoginResponse(BaseModel):
    accessToken: str
    user: UserOut


class RegisterRequest(BaseModel):
    email: str
    password: str


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    try:
        user_id = UUID(sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    try:
        ok = user is not None and verify_password(req.password, user.password_hash)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Password verification backend error")

    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(subject=str(user.id))
    return {"accessToken": access_token, "user": {"id": user.id, "email": user.email, "role": user.role}}


@router.post("/register", response_model=LoginResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = User(email=req.email, password_hash=hash_password(req.password), role="user")
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(subject=str(user.id))
    return {"accessToken": access_token, "user": {"id": user.id, "email": user.email, "role": user.role}}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}
