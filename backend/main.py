import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from api import router as api_router
from api.v1.ws.event_bus import event_bus
from core.config import settings
from core.database import db_helper
from core.errors import ServiceUnavailableError, register_error_handlers
from core.logging import configure_logging
from core.middleware import RequestIDMiddleware

logger = logging.getLogger(__name__)


async def check_database() -> None:
	"""Проверяет, что соединение с БД действительно работает."""
	async with db_helper.engine.connect() as connection:
		await connection.execute(text("SELECT 1"))


@asynccontextmanager
async def lifespan(lifespan_app: FastAPI):
    configure_logging()
    await event_bus.start()
    try:
        yield
    finally:
        await event_bus.stop()
        await db_helper.dispose()  # Закрываем соединение с бд

app = FastAPI(lifespan=lifespan)

register_error_handlers(app)

app.include_router(api_router)


@app.get(
	"/health",
	tags=["system"],
	summary="Проверка работоспособности",
	description="Возвращает 200, только если приложение отвечает и БД доступна",
)
async def health():
	try:
		await check_database()
	except Exception:
		logger.exception("Health check failed")
		raise ServiceUnavailableError(
			"База данных недоступна",
			code="database_unavailable",
		)
	
	return {"status": "ok", "database": "ok"}

# Загруженные изображения отдаются напрямую, без авторизации:
# URL содержит неугадываемый UUID, а сами файлы не секретны.
settings.media_root.mkdir(parents=True, exist_ok=True)
app.mount(
    settings.media_url,
    StaticFiles(directory=settings.media_root),
    name="media",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Добавляется последним, поэтому оборачивает и CORS-ответы (включая preflight).
app.add_middleware(RequestIDMiddleware)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=True,
    )
