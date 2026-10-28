# GisOrders

Бэкенд-сервис для заказа валки и спила деревьев: заказчик создаёт заказ с координатами
и характеристиками дерева, исполнители отправляют отклики, а по каждому отклику
автоматически открывается чат между участниками.

## Стек

- Python 3.12+, FastAPI, Uvicorn
- SQLAlchemy 2.0 (async) + asyncpg
- PostgreSQL + PostGIS (GeoAlchemy2, Shapely)
- Alembic, Pydantic v2 + pydantic-settings
- JWT (python-jose), bcrypt
- Redis (rate limiting, WebSocket pub/sub) — опционально
- pytest + httpx, uv

## Структура

```
backend/
├── main.py                  # точка входа, CORS, lifespan
├── core/                    # конфиг, БД, JWT, ошибки, работа со временем
├── api/v1/
│   ├── users/               # регистрация, вход, профиль
│   ├── orders/              # заказы и отклики
│   ├── chat/                # чаты и сообщения
│   ├── uploads/             # загрузка изображений
│   └── ws/                  # WebSocket-события чатов
├── alembic/versions/        # миграции
└── tests/                   # pytest: фикстуры и интеграционные тесты
```

Каждый модуль разделён на `models` (SQLAlchemy), `schemas` (Pydantic),
`services` (бизнес-логика) и `routers` (HTTP + проверка прав).

## Быстрый старт (Docker)

```bash
cp .env.example .env          # заполнить POSTGRES_* и JWT_SECRET_KEY
docker compose up -d --build  # postgres + backend

# миграции выполняются автоматически в entrypoint контейнера
curl http://localhost:8000/health
```

API будет доступен на `http://localhost:8000`, OpenAPI — на `/docs`.
При первом создании тома Postgres скрипт `backend/init-db.sh` создаёт
тестовую БД `gisorders_test` с расширением PostGIS.

### Production

Отдельный образ без dev-зависимостей и `--reload`, non-root пользователь,
два воркера uvicorn, Redis для общих лимитов и WebSocket-событий:

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
curl http://localhost:8000/health
```

Миграции применяются автоматически при старте контейнера. В production
включён JSON-формат логов (`LOG_JSON=true`), а `REDIS_URL` задаётся compose-файлом.

## Локальный запуск

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

## Администратор

Выдать права админа существующему пользователю или создать нового:

```bash
cd backend
uv run python scripts/create_admin.py --email admin@example.com
# для нового пользователя дополнительно: --username admin (пароль спросит интерактивно)
```

## Переменные окружения

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `DB_URL` | DSN для asyncpg (`postgresql+asyncpg://...`) | обязательна |
| `POSTGRES_*` | параметры контейнера Postgres | — |
| `BACKEND_PORT` | порт приложения | `8000` |
| `JWT_SECRET_KEY` | ключ подписи JWT (минимум 32 символа) | обязательна |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | время жизни access-токена | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | время жизни refresh-токена | `30` |
| `REDIS_URL` | Redis для общих лимитов и WebSocket pub/sub | не задан (in-memory) |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW_SECONDS` | попытки входа на IP+email | `10` / `60` |
| `REGISTER_RATE_LIMIT` / `REGISTER_RATE_WINDOW_SECONDS` | регистрации на IP | `5` / `3600` |
| `LOG_LEVEL` | минимальный уровень логов | `INFO` |
| `LOG_JSON` | писать логи одной JSON-строкой | `false` |
| `WS_AUTH_TIMEOUT_SECONDS` | ожидание кадра авторизации WebSocket | `10` |
| `MAX_PROPOSALS_PER_DAY` | лимит откликов за 24 часа | `3` |
| `MEDIA_ROOT` | каталог для загруженных изображений | `backend/media` |
| `MEDIA_MAX_UPLOAD_SIZE_MB` | максимальный размер загружаемого файла | `5` |
| `CORS_ORIGINS` | JSON-массив источников | `["*"]` |
| `CORS_ALLOW_CREDENTIALS` | credentialed CORS (для Bearer не нужен) | `false` |

## API

Все маршруты имеют префикс `/api/v1`; авторизация — `Authorization: Bearer <token>`.

| Группа | Маршруты |
|---|---|
| Пользователи | `POST /users/register`, `POST /users/login`, `POST /users/login/json`, `POST /users/refresh`, `POST /users/logout`, `GET/PATCH/DELETE /users/me`, `POST /users/me/password`, `GET /users/{id}`, `DELETE /users/{id}` (admin), `POST /users/{id}/block`, `POST /users/{id}/unblock` (admin) |
| Заказы | `POST /orders/`, `GET /orders/my`, `GET /orders/available`, `GET/PATCH/DELETE /orders/{id}`, `POST /orders/{id}/close` |
| Отклики | `POST/GET /orders/{id}/proposals`, `GET /orders/proposals/my`, `GET/PATCH/DELETE /orders/proposals/{id}`, `POST /orders/{id}/proposals/{proposal_id}/accept` |
| Чаты | `GET /chats/my`, `GET /chats/unread/count`, `GET /chats/{id}`, `POST /chats/{id}/messages`, `POST /chats/{id}/read`, `POST /chats/{id}/close` |
| Загрузки | `POST /uploads/images` (multipart `file`); файлы отдаются с `/media/...` |
| Realtime | `WS /ws/chats/{chat_id}` (авторизация первым кадром) |
| Система | `GET /health` — вне `/api/v1`, проверяет соединение с БД |

## Realtime

`ws://<host>/api/v1/ws/chats/{chat_id}` — события конкретного чата.
Браузерный WebSocket не умеет передавать `Authorization`, поэтому после
подключения клиент отправляет первым кадром:

```json
{"type": "auth", "token": "<access_token>"}
```

Сервер отвечает `{"type": "auth.ok", ...}`. Коды закрытия: `4401` — токен не
передан/недействителен, `4403` — не участник или аккаунт заблокирован,
`4404` — чат не найден.

Клиент может отправлять `{"type": "typing", "is_typing": true}`,
`{"type": "read"}` и `{"type": "ping"}`. Сервер присылает `typing`,
`message.read`, `pong`, а также `message.created` после отправки сообщения
через REST. Сама отправка сообщений остаётся REST-эндпоинтом.

## Бизнес-правила

Статусы заказа: `open → assigned → closed`, статусы отклика: `pending → accepted | rejected`.

- `POST /users/login*` возвращает `access_token` (15 минут) и `refresh_token` (30 дней). Refresh-токен opaque, в БД хранится только его SHA-256.
- `POST /users/refresh` ротирует refresh-токен: старый отзывается, выдаётся новый. Повторное использование отозванного токена считается компрометацией и отзывает все сессии пользователя.
- `POST /users/logout` отзывает refresh-токен текущей сессии.
- `POST /users/me/password` требует текущий пароль, меняет его и отзывает все refresh-токены. Ранее выданные access-токены живут до 15 минут.
- Вход и регистрация ограничены по частоте: попытки входа — на IP+email, регистрации — на IP. Ответ `429` содержит `Retry-After`. С `REDIS_URL` счётчики общие для всех воркеров; без Redis используется in-memory fallback.

- Исполнитель может отправить не больше `MAX_PROPOSALS_PER_DAY` откликов за скользящие 24 часа.
- На один заказ — один отклик от исполнителя (защищено уникальным индексом); нельзя откликаться на свой или закрытый заказ.
- Отклик автоматически создаёт чат, а текст отклика становится первым сообщением.
- `POST /orders/{id}/proposals/{proposal_id}/accept` выбирает исполнителя: заказ переходит в `assigned`, выбранный отклик — в `accepted`, остальные — в `rejected`, их чаты закрываются. Заказ пропадает из `/available`.
- `assigned` — это факт выбора исполнителя, а не статус оплаты или хода работ: оплата происходит вне сервиса.
- Принятый отклик нельзя редактировать или отозвать, а его чат нельзя закрыть напрямую — только вместе с заказом.
- Закрытие заказа (`POST /orders/{id}/close`) закрывает все его чаты и отклоняет отклики без решения; `closed_at` фиксирует время.
- `assigned`-заказ нельзя редактировать или удалить: сначала закройте его.
- Редактировать и отзывать можно только `pending`-отклики.
- В закрытый чат писать нельзя; доступ к чату есть только у его участников.
- Заблокированный пользователь (`is_active=false`) не может войти, а выданные ранее токены перестают работать; блокировка доступна только админам.
- `POST /uploads/images` принимает только JPEG, PNG и WebP до `MEDIA_MAX_UPLOAD_SIZE_MB`. Файл проверяется через Pillow (а не по расширению), поворачивается по EXIF, уменьшается до 1920 px по длинной стороне и сохраняется как WebP с UUID-именем; ответ содержит `url` для поля `photos` заказа.
- `/media/*` отдаётся статикой без авторизации: имена файлов — случайные UUID, содержимое не секретно.
- Realtime с `REDIS_URL` использует общий pub/sub-канал: событие, отправленное в одном воркере, получают клиенты всех воркеров. Без Redis события доставляются только внутри процесса (in-memory fallback).
- Каждый HTTP-ответ содержит `X-Request-ID` (значение клиента сохраняется), а в логах есть request_id, метод, путь, статус и длительность запроса.
- Заказы с истёкшим дедлайном не попадают в список доступных.
- Время хранится в UTC (`timestamptz`); `deadline` без таймзоны трактуется как UTC.

## Тесты

Тестам нужна отдельная БД `gisorders_test` с PostGIS (создаётся `init-db.sh`).
Каждый тест выполняется в транзакции с откатом, поэтому данные не накапливаются.

```bash
cd backend
uv run pytest --cov=api --cov=core --cov-report=term-missing
uv run ruff check .
```

Порог покрытия — 75%; CI также проверяет миграции и линтер.

## Обслуживание

```bash
cd backend
# Удалить истёкшие refresh-токены (cron, например раз в сутки)
uv run python scripts/purge_refresh_tokens.py

# Посмотреть неиспользуемые изображения старше 24 часов
uv run python scripts/cleanup_media.py --dry-run

# Удалить их
uv run python scripts/cleanup_media.py --min-age-hours 24
```

Линтер и проверка YAML также запускаются через pre-commit:

```bash
pre-commit install   # один раз после клонирования
```

## Миграции

```bash
cd backend
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "change description"
uv run alembic check   # нет ли расхождений между моделями и БД
```
