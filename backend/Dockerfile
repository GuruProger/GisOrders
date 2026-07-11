FROM python:3.12-slim AS build

RUN pip install uv

WORKDIR /app

# Копируем файлы с зависимостями
COPY pyproject.toml uv.lock ./

# Устанавливаем зависимости через uv
RUN uv sync --frozen --compile-bytecode

COPY . .


CMD ["uv", "run", "python", "-m", "uvicorn", "main:app", "--reload"]