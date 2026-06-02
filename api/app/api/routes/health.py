from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import engine


router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.get("/health/db")
async def db_health_check():
    async with engine.connect() as conn:
        await conn.execute(text("select 1"))
    return {"status": "ok"}
