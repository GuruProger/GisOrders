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
CMD ["sh", "-c", "uv run python -m uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000} --reload"]