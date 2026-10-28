#!/bin/sh
set -e

# Схема должна быть актуальной до старта приложения. В production-образе
# используется venv-бинарь alembic, без uv и dev-зависимостей.
alembic upgrade head

exec "$@"
