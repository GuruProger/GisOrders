FROM python:3.12-slim AS build

RUN pip install uv

WORKDIR /app

# Копируем файлы с зависимостями
COPY pyproject.toml uv.lock ./

# Устанавливаем зависимости через uv
RUN uv sync --frozen --compile-bytecode

COPY . .

RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
# --no-sync: зависимости уже установлены в образ через `uv sync --frozen`,
# повторная синхронизация требует доступа к PyPI и падает без сети.
CMD ["sh", "-c", "uv run --no-sync python -m uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000} --reload"]