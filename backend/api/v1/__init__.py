from fastapi import APIRouter
from api.v1.users.routers import router as user_router
from api.v1.orders.routers import router as order_router
from api.v1.chat.routers import router as chat_router

router = APIRouter()
router.include_router(user_router)
router.include_router(order_router)
router.include_router(chat_router)
