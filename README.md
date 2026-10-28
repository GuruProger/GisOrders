# GisOrders

Бэкенд-сервис для заказа валки и спила деревьев: заказчик создаёт заказ с координатами
и характеристиками дерева, исполнители отправляют отклики, а по каждому отклику
автоматически открывается чат между участниками.

## Стек

- Python 3.12+, FastAPI, Uvicorn
- SQLAlchemy 2.0 (async) + asyncpg
- PostgreSQL + PostGIS (GeoAlchemy2, Shapely)
- Alembic, Pydantic v2 + pydantic-settings
- JWT (python-jose), bcrypt (passlib)
- pytest + httpx, uv

## Структура

```
backend/
├── main.py                  # точка входа, CORS, lifespan
├── core/                    # конфиг, БД, JWT, ошибки, работа со временем
├── api/v1/
│   ├── users/               # регистрация, вход, профиль
│   ├── orders/              # заказы и отклики
│   └── chat/                # чаты и сообщения
├── alembic/versions/        # миграции
└── tests/                   # pytest: фикстуры и интеграционные тесты
```

Каждый модуль разделён на `models` (SQLAlchemy), `schemas` (Pydantic),
`services` (бизнес-логика) и `routers` (HTTP + проверка прав).

## Быстрый старт (Docker)

```bash
cp .env.example .env          # заполнить POSTGRES_* и JWT_SECRET_KEY
docker compose up -d --build  # postgres + backend

# миграции и запуск приложения
docker compose exec backend uv run alembic upgrade head
```

API будет доступен на `http://localhost:8000`, OpenAPI — на `/docs`.
При первом создании тома Postgres скрипт `backend/init-db.sh` создаёт
тестовую БД `gisorders_test` с расширением PostGIS.

## Локальный запуск

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

## Переменные окружения

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `DB_URL` | DSN для asyncpg (`postgresql+asyncpg://...`) | обязательна |
| `POSTGRES_*` | параметры контейнера Postgres | — |
| `BACKEND_PORT` | порт приложения | `8000` |
| `JWT_SECRET_KEY` | ключ подписи JWT | обязательна |
| `MAX_PROPOSALS_PER_DAY` | лимит откликов за 24 часа | `3` |
| `CORS_ORIGINS` | JSON-массив источников | `["*"]` |
| `CORS_ALLOW_CREDENTIALS` | credentialed CORS (для Bearer не нужен) | `false` |

## API

Все маршруты имеют префикс `/api/v1`; авторизация — `Authorization: Bearer <token>`.

| Группа | Маршруты |
|---|---|
| Пользователи | `POST /users/register`, `POST /users/login`, `POST /users/login/json`, `GET/PATCH/DELETE /users/me`, `GET /users/{id}`, `DELETE /users/{id}` (admin) |
| Заказы | `POST /orders/`, `GET /orders/my`, `GET /orders/available`, `GET/PATCH/DELETE /orders/{id}`, `POST /orders/{id}/close` |
| Отклики | `POST/GET /orders/{id}/proposals`, `GET /orders/proposals/my`, `GET/PATCH/DELETE /orders/proposals/{id}` |
| Чаты | `GET /chats/my`, `GET /chats/unread/count`, `GET /chats/{id}`, `POST /chats/{id}/messages`, `POST /chats/{id}/read`, `POST /chats/{id}/close` |

## Бизнес-правила

- Исполнитель может отправить не больше `MAX_PROPOSALS_PER_DAY` откликов за скользящие 24 часа.
- На один заказ — один отклик от исполнителя; нельзя откликаться на свой или закрытый заказ.
- Отклик автоматически создаёт чат, а текст отклика становится первым сообщением.
- Удаление отклика закрывает чат; закрытие чата удаляет связанный отклик.
- В закрытый чат писать нельзя; доступ к чату есть только у его участников.
- Заказы с истёкшим дедлайном не попадают в список доступных.
- Время хранится в UTC (`timestamptz`); `deadline` без таймзоны трактуется как UTC.

## Тесты

Тестам нужна отдельная БД `gisorders_test` с PostGIS (создаётся `init-db.sh`).
Каждый тест выполняется в транзакции с откатом, поэтому данные не накапливаются.

```bash
cd backend
uv run pytest
```

## Миграции

```bash
cd backend
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "change description"
```
