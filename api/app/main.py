from fastapi import FastAPI
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.security import hash_password
from app.db.models.user import User
from app.db.session import SessionLocal


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.on_event("startup")
    async def ensure_admin_user():
        if settings.app_env == "prod":
            return
        async with SessionLocal() as db:
            result = await db.execute(select(User).where(User.email == settings.admin_email))
            user = result.scalar_one_or_none()
            if user is not None:
                return
            db.add(User(email=settings.admin_email, password_hash=hash_password(settings.admin_password), role="admin"))
            await db.commit()

    return app


app = create_app()
