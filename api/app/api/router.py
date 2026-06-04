from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.chats import router as chats_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.kbs import router as kbs_router
from app.api.routes.search import router as search_router


api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(chat_router, tags=["chat"])
api_router.include_router(chats_router, tags=["chats"])
api_router.include_router(kbs_router, tags=["kbs"])
api_router.include_router(documents_router, tags=["documents"])
api_router.include_router(search_router, tags=["search"])
