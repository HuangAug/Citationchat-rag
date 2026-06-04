from fastapi import FastAPI
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.security import hash_password
from app.db.models.kb import KnowledgeBase
from app.db.models.user import User
from app.db.session import SessionLocal


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.on_event("startup")
    async def ensure_defaults():
        if settings.app_env == "prod":
            return
        async with SessionLocal() as db:
            result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.name == "default").order_by(KnowledgeBase.created_at.asc()))
            default_by_name = result.scalars().first()
            if default_by_name is None:
                default_by_name = KnowledgeBase(name="default", description="Default knowledge base", is_default=True)
                db.add(default_by_name)
                await db.commit()
                await db.refresh(default_by_name)

            result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.is_default.is_(True)).order_by(KnowledgeBase.created_at.asc()))
            defaults = result.scalars().all()
            if not defaults:
                default_by_name.is_default = True
                await db.commit()
            elif len(defaults) > 1:
                keep = defaults[0]
                for kb in defaults[1:]:
                    kb.is_default = False
                await db.commit()

            result = await db.execute(select(User).where(User.email == settings.admin_email))
            user = result.scalar_one_or_none()
            if user is None:
                db.add(User(email=settings.admin_email, password_hash=hash_password(settings.admin_password), role="admin"))
                await db.commit()

    return app


app = create_app()
