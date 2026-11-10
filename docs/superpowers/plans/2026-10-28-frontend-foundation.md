# GisOrders: бэкенд-доработки и фундамент фронтенда — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в API поиск, счётчики и нормализацию породы дерева и собрать работающий каркас фронтенда: сборка, дизайн-токены, UI-кит, API-клиент с обновлением токенов, вход и регистрация, оболочка с переключателем ролей.

**Architecture:** Бэкенд — точечные правки существующих слоёв FastAPI (схемы → роутер → сервис), без миграций. Фронтенд — SPA на React + Vite в каталоге `frontend/`, слои `pages → widgets → features → entities → api/shared`, Tailwind с токенами палитры, TanStack Query для серверного состояния, Zustand только для сессии.

**Tech Stack:** FastAPI, SQLAlchemy 2 (async), PostGIS, pytest; React 19, TypeScript, Vite, Tailwind 4, TanStack Query 5, React Router 7, Zustand 5, react-hook-form + zod, Vitest + Testing Library + MSW, nginx.

**Spec:** `docs/superpowers/specs/2026-10-28-frontend-design.md`

**Следующий план:** `docs/superpowers/plans/2026-10-28-frontend-screens.md` — экраны, карта, чаты, отклики.

## Global Constraints

- Интерфейс и все пользовательские тексты — на русском. Имена файлов, функций, типов и коммиты — на английском.
- TypeScript strict; в экспортируемых сигнатурах нет `any`.
- Цвета только из токенов палитры (`--color-forest-900`, `--color-moss-600` и т.д.). Хардкод hex в компонентах запрещён.
- Минимальная зона нажатия — 44×44 px.
- Суммы: `2 500 ₽` — неразрывный пробел между тысячами и перед знаком валюты.
- Даты: `ru-RU`, в местном времени пользователя; API отдаёт UTC.
- Бэкенд: отступы табами, как в существующих файлах; `line-length = 120`; покрытие не ниже 75%.
- Тесты бэкенда требуют запущенного Postgres с БД `gisorders_test` (создаётся `backend/init-db.sh`): `docker compose up -d postgres_db`.
- API-префикс `/api/v1`; базовый URL фронтенда — `VITE_API_BASE_URL`, по умолчанию `/api/v1`.
- Ветка работы: `feature/frontend`. Коммит после каждой задачи.

## Review Focus

- **Просроченный access-токен при нескольких параллельных запросах.** Ожидание: одно обновление токена, остальные запросы ждут его результат и повторяются; пользователя не разлогинивает.
- **Две вкладки обновляют токен одновременно.** Ожидание: обновление выполняет только одна вкладка; иначе бэкенд считает это кражей и отзывает все сессии.
- **Отозванный или истёкший refresh-токен.** Ожидание: чистый выход на `/login` с возвратом на исходный адрес, без цикла редиректов и без «вечной загрузки».
- **Поиск со спецсимволами `%`, `_` и в другом регистре.** Ожидание: символы ищутся буквально, регистр не важен, пустая строка не сужает выдачу.
- **Порода дерева с `ё`, лишними пробелами и в другом регистре.** Ожидание: « Сосна », «сосна» и «сосна» (через ё) фильтруются одинаково.
- **`X-Total-Count` при кросс-доменной разработке.** Ожидание: заголовок читается фронтендом при `vite dev` на другом порту (CORS `expose_headers`).

---

## Задача 1: Поиск по названию и описанию заказа

**Files:**
- Modify: `backend/api/v1/orders/schemas.py` (класс `OrderFilters`)
- Modify: `backend/api/v1/orders/routers.py` (`get_available_orders`, строки 57–92)
- Modify: `backend/api/v1/orders/services.py` (`get_available_orders`, строки 72–170)
- Test: `backend/tests/test_order_search.py`

**Interfaces:**
- Consumes: существующие `OrderFilters`, `OrderService.get_available_orders(session, executor_id, filters)`.
- Produces: поле `OrderFilters.search: str | None`; query-параметр `search` у `GET /api/v1/orders/available`.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_order_search.py`:

```python
import pytest

from conftest import make_order

AVAILABLE_API = "/api/v1/orders/available"


def params(**overrides) -> dict:
	base = {"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10}
	base.update(overrides)
	return base


async def available_ids(client, headers, **overrides) -> set[int]:
	resp = await client.get(AVAILABLE_API, params=params(**overrides), headers=headers)
	assert resp.status_code == 200, resp.text
	return {order["id"] for order in resp.json()}


@pytest.mark.asyncio
async def test_search_matches_title_case_insensitive(client, db, customer, exec_headers, current_user_override):
	target = await make_order(db, customer_id=customer.id, title="Спилить сухую СОСНУ")
	other = await make_order(db, customer_id=customer.id, title="Покос травы")

	ids = await available_ids(client, exec_headers, search="сосну")

	assert target.id in ids
	assert other.id not in ids


@pytest.mark.asyncio
async def test_search_matches_description(client, db, customer, exec_headers, current_user_override):
	target = await make_order(db, customer_id=customer.id, title="Работа во дворе")
	target.description = "Нужно убрать аварийную ветку над крышей"
	await db.flush()
	other = await make_order(db, customer_id=customer.id, title="Другая работа")

	ids = await available_ids(client, exec_headers, search="аварийную ветку")

	assert target.id in ids
	assert other.id not in ids


@pytest.mark.asyncio
async def test_search_treats_percent_as_literal(client, db, customer, exec_headers, current_user_override):
	with_percent = await make_order(db, customer_id=customer.id, title="Скидка 50% на спил")
	without = await make_order(db, customer_id=customer.id, title="Скидка 50 рублей на спил")

	ids = await available_ids(client, exec_headers, search="50%")

	assert with_percent.id in ids
	assert without.id not in ids


@pytest.mark.asyncio
async def test_blank_search_does_not_narrow_results(client, db, customer, exec_headers, current_user_override):
	order = await make_order(db, customer_id=customer.id, title="Любой заказ")

	ids = await available_ids(client, exec_headers, search="   ")

	assert order.id in ids
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && uv run pytest tests/test_order_search.py -v`
Expected: FAIL — поиск игнорируется, `test_search_matches_title_case_insensitive` получает лишний `other.id`, а `test_search_treats_percent_as_literal` — оба заказа.

- [ ] **Step 3: Реализовать поиск**

В `backend/api/v1/orders/schemas.py` в `OrderFilters` добавить после `tree_type`:

```python
	search: Optional[str] = Field(None, max_length=200)
```

В `backend/api/v1/orders/routers.py` добавить параметр и передать его в `OrderFilters`:

```python
		search: Optional[str] = Query(None, max_length=200, description="Поиск по названию и описанию"),
```

В `backend/api/v1/orders/services.py` добавить модульную функцию (рядом с классом `OrderService`) и применить её в `get_available_orders`:

```python
def _escape_like(value: str) -> str:
	"""Экранирует спецсимволы LIKE, чтобы % и _ искались буквально."""
	return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
```

```python
		if filters.search and filters.search.strip():
			pattern = f"%{_escape_like(filters.search.strip())}%"
			stmt = stmt.where(
				or_(
					Order.title.ilike(pattern, escape="\\"),
					Order.description.ilike(pattern, escape="\\"),
				)
			)
```

`or_` уже импортирован в модуле; если нет — добавить в импорт из `sqlalchemy`.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && uv run pytest tests/test_order_search.py -v`
Expected: PASS, 4 теста.

- [ ] **Step 5: Прогнать весь набор и линтер**

Run: `cd backend && uv run pytest --cov=api --cov=core --cov-report=term-missing && uv run ruff check .`
Expected: все тесты PASS, покрытие ≥ 75%, ruff без замечаний.

- [ ] **Step 6: Коммит**

```bash
git add backend/api/v1/orders/schemas.py backend/api/v1/orders/routers.py backend/api/v1/orders/services.py backend/tests/test_order_search.py
git commit -m "feat(orders): add text search to available orders"
```

---

## Задача 2: Счётчик откликов и общее число найденного

**Files:**
- Modify: `backend/api/v1/orders/schemas.py` (`OrderResponse`)
- Modify: `backend/api/v1/orders/services.py` (хелпер + три метода)
- Modify: `backend/api/v1/orders/routers.py` (`get_available_orders`)
- Modify: `backend/core/config.py` (`cors_origins` рядом — настройки CORS)
- Modify: `backend/main.py` (`CORSMiddleware`)
- Test: `backend/tests/test_order_counters.py`

**Interfaces:**
- Consumes: `Order`, `OrderProposal`, `ProposalStatus` из `api/v1/orders/models.py`; `OrderFilters` после задачи 1.
- Produces: `OrderResponse.proposals_count: int`; заголовок `X-Total-Count` у `GET /api/v1/orders/available`; `OrderService.count_available_orders(session, executor_id, filters) -> int`; `OrderService._attach_proposals_count(session, orders) -> None`.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_order_counters.py`:

```python
import pytest
from sqlalchemy import update

from api.v1.orders.models import OrderProposal, ProposalStatus
from conftest import make_order, make_proposal

AVAILABLE_API = "/api/v1/orders/available"


def params(**overrides) -> dict:
	base = {"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10}
	base.update(overrides)
	return base


@pytest.mark.asyncio
async def test_available_orders_report_pending_proposals_only(
		client, db, customer, executor, exec_headers, current_user_override
):
	order = await make_order(db, customer_id=customer.id)
	pending = await make_proposal(db, order_id=order.id, executor_id=executor.id)
	second = await make_proposal(db, order_id=order.id, executor_id=executor.id)
	await db.execute(
		update(OrderProposal).where(OrderProposal.id == second.id).values(status=ProposalStatus.REJECTED)
	)
	await db.flush()

	resp = await client.get(AVAILABLE_API, params=params(), headers=exec_headers)
	assert resp.status_code == 200, resp.text
	row = next(item for item in resp.json() if item["id"] == order.id)

	assert row["proposals_count"] == 1, f"учитывается только pending, id={pending.id}"


@pytest.mark.asyncio
async def test_order_detail_reports_proposals_count(client, db, customer, executor, cust_headers, current_user_override):
	order = await make_order(db, customer_id=customer.id)
	await make_proposal(db, order_id=order.id, executor_id=executor.id)

	resp = await client.get(f"/api/v1/orders/{order.id}", headers=cust_headers)
	assert resp.status_code == 200, resp.text

	assert resp.json()["proposals_count"] == 1


@pytest.mark.asyncio
async def test_total_count_header_matches_filtered_results(
		client, db, customer, exec_headers, current_user_override
):
	near = await make_order(db, customer_id=customer.id)
	far = await make_order(db, customer_id=customer.id, lat=59.9343, lon=30.3351)

	resp = await client.get(AVAILABLE_API, params=params(radius_km=10), headers=exec_headers)
	assert resp.status_code == 200, resp.text

	assert resp.headers["X-Total-Count"] == "1"
	assert [item["id"] for item in resp.json()] == [near.id]
	assert far.id not in {item["id"] for item in resp.json()}


@pytest.mark.asyncio
async def test_total_count_ignores_pagination(client, db, customer, exec_headers, current_user_override):
	for _ in range(3):
		await make_order(db, customer_id=customer.id)

	resp = await client.get(AVAILABLE_API, params=params(per_page=1), headers=exec_headers)
	assert resp.status_code == 200, resp.text

	assert resp.headers["X-Total-Count"] == "3"
	assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_total_count_header_is_exposed_to_browsers(client):
	resp = await client.get(
		"/health",
		headers={"Origin": "http://localhost:5173"},
	)
	exposed = resp.headers.get("access-control-expose-headers", "").lower()

	assert "x-total-count" in exposed
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && uv run pytest tests/test_order_counters.py -v`
Expected: FAIL — в ответах нет `proposals_count`, заголовка `X-Total-Count` нет, `access-control-expose-headers` пуст.

- [ ] **Step 3: Добавить поле в схему**

В `backend/api/v1/orders/schemas.py` в `OrderResponse` добавить после `lon`:

```python
	proposals_count: int = 0
```

- [ ] **Step 4: Реализовать подсчёт в сервисе**

В `backend/api/v1/orders/services.py`:

```python
	@staticmethod
	async def _attach_proposals_count(session: AsyncSession, orders: Sequence[Order]) -> None:
		"""Проставляет orders[i].proposals_count — число откликов в статусе pending."""
		order_ids = [order.id for order in orders]
		if not order_ids:
			return
		stmt = (
			select(OrderProposal.order_id, func.count(OrderProposal.id))
			.where(
				OrderProposal.order_id.in_(order_ids),
				OrderProposal.status == ProposalStatus.PENDING,
			)
			.group_by(OrderProposal.order_id)
		)
		counts = dict((await session.execute(stmt)).all())
		for order in orders:
			order.proposals_count = counts.get(order.id, 0)
```

Вынести условия выборки доступных заказов в отдельный метод, чтобы счётчик и список считали одинаково:

```python
	@staticmethod
	def _available_conditions(executor_id: int, filters: OrderFilters) -> list:
		"""Возвращает список условий WHERE для доступных заказов (без order_by и пагинации)."""
```

Внутрь перенести все текущие `where`-условия из `get_available_orders` (статус `OPEN`, дедлайн, исключение своих, исключение уже откликнутых, гео, цена, порода, высота, поиск из задачи 1) и вернуть их списком.

`get_available_orders` переписать на:

```python
		stmt = select(Order).where(*OrderService._available_conditions(executor_id, filters))
		stmt = stmt.order_by(...)  # существующая сортировка
		stmt = stmt.offset((filters.page - 1) * filters.per_page).limit(filters.per_page)
		orders = list((await session.execute(stmt)).scalars().all())
		await OrderService._attach_proposals_count(session, orders)
		return orders
```

Добавить:

```python
	@staticmethod
	async def count_available_orders(session: AsyncSession, executor_id: int, filters: OrderFilters) -> int:
		stmt = select(func.count(Order.id)).where(*OrderService._available_conditions(executor_id, filters))
		return int((await session.execute(stmt)).scalar_one())
```

В `get_orders_by_customer`, `get_order_by_id` и в методах, возвращающих один заказ, вызвать `_attach_proposals_count(session, [order])` перед возвратом.

- [ ] **Step 5: Отдать заголовок из роутера**

В `backend/api/v1/orders/routers.py` у `get_available_orders` добавить параметр `response: Response` (импорт `from fastapi import Response`) и перед возвратом:

```python
		total = await OrderService.count_available_orders(session, current_user.id, filters)
		response.headers["X-Total-Count"] = str(total)
```

- [ ] **Step 6: Разрешить чтение заголовка из браузера**

В `backend/main.py` в `CORSMiddleware` добавить:

```python
		expose_headers=["X-Total-Count"],
```

- [ ] **Step 7: Убедиться, что тесты проходят**

Run: `cd backend && uv run pytest tests/test_order_counters.py -v`
Expected: PASS, 5 тестов.

- [ ] **Step 8: Прогнать весь набор и линтер**

Run: `cd backend && uv run pytest --cov=api --cov=core --cov-report=term-missing && uv run ruff check .`
Expected: PASS, покрытие ≥ 75%, ruff чист.

- [ ] **Step 9: Коммит**

```bash
git add backend/api/v1/orders/schemas.py backend/api/v1/orders/services.py backend/api/v1/orders/routers.py backend/main.py backend/tests/test_order_counters.py
git commit -m "feat(orders): expose proposals count and filtered total"
```

---

## Задача 3: Нормализация породы дерева

**Files:**
- Create: `backend/api/v1/orders/normalization.py`
- Modify: `backend/api/v1/orders/schemas.py` (`OrderBase`, `OrderUpdate`)
- Modify: `backend/api/v1/orders/services.py` (фильтр по `tree_type`)
- Create: `backend/scripts/normalize_tree_types.py`
- Test: `backend/tests/test_tree_type_normalization.py`

**Interfaces:**
- Consumes: `Order.tree_type` (строка), `OrderFilters.tree_type`.
- Produces: `normalize_tree_type(value: str) -> str`; нормализованные значения в БД и в фильтре.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_tree_type_normalization.py`:

```python
import pytest

from api.v1.orders.normalization import normalize_tree_type
from conftest import make_order

AVAILABLE_API = "/api/v1/orders/available"


def test_normalize_tree_type_trims_lowercases_and_collapses_spaces():
	assert normalize_tree_type("  Сосна   Обыкновенная ") == "сосна обыкновенная"


def test_normalize_tree_type_replaces_yo():
	assert normalize_tree_type("Берёза") == "береза"


@pytest.mark.asyncio
async def test_created_order_stores_normalized_tree_type(
		client, db, customer, cust_headers, current_user_override
):
	payload = {
		"title": "Спилить сухую сосну",
		"description": "Дерево во дворе, доступ свободный",
		"min_price": 1000,
		"max_price": 5000,
		"deadline": "2030-01-01T10:00:00Z",
		"address": "Москва, тестовый адрес",
		"tree_type": "  Сосна  ",
		"tree_height": 12,
		"tree_diameter": 35,
		"lat": 55.7558,
		"lon": 37.6173,
	}

	resp = await client.post("/api/v1/orders/", json=payload, headers=cust_headers)
	assert resp.status_code == 201, resp.text

	assert resp.json()["tree_type"] == "сосна"


@pytest.mark.asyncio
async def test_filter_matches_normalized_tree_type(
		client, db, customer, exec_headers, current_user_override
):
	order = await make_order(db, customer_id=customer.id)
	order.tree_type = "береза"
	await db.flush()

	resp = await client.get(
		AVAILABLE_API,
		params={"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10, "tree_type": "Берёза"},
		headers=exec_headers,
	)
	assert resp.status_code == 200, resp.text

	assert [item["id"] for item in resp.json()] == [order.id]
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && uv run pytest tests/test_tree_type_normalization.py -v`
Expected: FAIL на импорте `normalize_tree_type` (ModuleNotFoundError).

- [ ] **Step 3: Создать нормализатор**

`backend/api/v1/orders/normalization.py`:

```python
def normalize_tree_type(value: str) -> str:
	"""Приводит породу к единому виду: без лишних пробелов, в нижнем регистре, ё -> е."""
	return " ".join(value.replace("ё", "е").replace("Ё", "Е").lower().split())
```

- [ ] **Step 4: Применять нормализацию при записи**

В `backend/api/v1/orders/schemas.py` добавить валидатор в `OrderBase` (поле `tree_type`) и такой же в `OrderUpdate`:

```python
	@field_validator("tree_type")
	def normalize_tree_type_value(cls, v: str) -> str:
		return normalize_tree_type(v)
```

(в `OrderUpdate` — с проверкой на `None`, как у остальных полей). Импорт: `from .normalization import normalize_tree_type`.

- [ ] **Step 5: Сравнивать нормализованные значения в фильтре**

В `OrderService._available_conditions` (из задачи 2) заменить условие по породе на добавление ещё одного условия в список:

```python
		if filters.tree_type:
			conditions.append(
				func.lower(func.replace(func.trim(Order.tree_type), "ё", "е"))
				== normalize_tree_type(filters.tree_type)
			)
```

Так фильтр работает и для строк, записанных до нормализации.

- [ ] **Step 6: Написать одноразовый скрипт**

`backend/scripts/normalize_tree_types.py` — асинхронный скрипт: читает все `Order`, пересчитывает `tree_type` через `normalize_tree_type`, пишет только изменённые строки, печатает число обновлённых и коммитит один раз в конце. Подключение к БД — через `core.database.db_helper` (как в `seed_db.py`).

- [ ] **Step 7: Убедиться, что тесты проходят**

Run: `cd backend && uv run pytest tests/test_tree_type_normalization.py -v`
Expected: PASS, 4 теста.

- [ ] **Step 8: Прогнать весь набор и линтер**

Run: `cd backend && uv run pytest --cov=api --cov=core --cov-report=term-missing && uv run ruff check .`
Expected: PASS, покрытие ≥ 75%, ruff чист.

- [ ] **Step 9: Коммит**

```bash
git add backend/api/v1/orders/normalization.py backend/api/v1/orders/schemas.py backend/api/v1/orders/services.py backend/scripts/normalize_tree_types.py backend/tests/test_tree_type_normalization.py
git commit -m "feat(orders): normalize tree type on write and filter"
```

---

## Задача 4: Каркас фронтенда — сборка, токены, Docker

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts`, `frontend/vitest.config.ts`, `frontend/index.html`
- Create: `frontend/src/app/main.tsx`, `frontend/src/app/App.tsx`, `frontend/src/app/styles.css`
- Create: `frontend/src/test/setup.ts`, `frontend/src/test/smoke.test.tsx`
- Create: `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`
- Modify: `docker-compose.prod.yml` (сервис `frontend`)
- Modify: `.gitignore` (`.superpowers/`, `frontend/node_modules`, `frontend/dist`)

**Interfaces:**
- Produces: работающие `npm run dev`, `npm run build`, `npm test`; CSS-токены палитры в `styles.css`; сервис `frontend` на порту 8080.

- [ ] **Step 1: Создать `frontend/package.json`**

```json
{
  "name": "gisorders-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5",
    "date-fns": "^4",
    "react": "^19",
    "react-dom": "^19",
    "react-hook-form": "^7",
    "react-router": "^7",
    "zod": "^4",
    "zustand": "^5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "@testing-library/jest-dom": "^6",
    "@testing-library/react": "^16",
    "@testing-library/user-event": "^14",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^5",
    "jsdom": "^26",
    "msw": "^2",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^7",
    "vite-plugin-pwa": "^1",
    "vitest": "^3"
  }
}
```

(Leaflet и Playwright добавляются в следующих задачах и плане экранов.)

- [ ] **Step 2: Установить зависимости и убедиться, что сборка работает**

Run: `cd frontend && npm install`
Expected: создан `package-lock.json`, ошибок нет.

Run: `cd frontend && npm run build`
Expected: на этом шаге падает — нет `index.html` и точек входа. Это ожидаемо; перейти к шагу 3.

- [ ] **Step 3: Создать конфигурацию и точку входа**

`frontend/vite.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GisOrders',
        short_name: 'GisOrders',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#F7F9F5',
        theme_color: '#2F6B45',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
})
```

`frontend/vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
})
```

`frontend/tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`, `paths: { "@/*": ["./src/*"] }`, `types: ["vitest/globals"]`.

`frontend/index.html`: `<div id="root"></div>`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `lang="ru"`.

`frontend/src/app/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`frontend/src/app/App.tsx` на этом шаге — заглушка `<h1>GisOrders</h1>`.

- [ ] **Step 4: Записать токены палитры**

`frontend/src/app/styles.css`:

```css
@import "tailwindcss";

@theme {
  --color-forest-900: #10241a;
  --color-forest-800: #1f3d2b;
  --color-moss-600: #2f6b45;
  --color-leaf-500: #3f8f5a;
  --color-mint-300: #8fd0a0;
  --color-sage-100: #eaf4ec;
  --color-surface: #f7f9f5;
  --color-card: #ffffff;
  --color-line: #dfe7db;
  --color-muted: #6b7a70;
  --color-amber-500: #d98324;
  --color-terracotta-600: #a8412f;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

html, body, #root { height: 100%; }

body {
  background: var(--color-surface);
  color: var(--color-forest-900);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 5: Написать дымовой тест**

`frontend/src/test/setup.ts`: `import '@testing-library/jest-dom/vitest'`.

`frontend/src/test/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { App } from '@/app/App'

test('renders app title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'GisOrders' })).toBeInTheDocument()
})
```

- [ ] **Step 6: Проверить сборку, типы, тесты и PWA**

Положить в `frontend/public/` иконки `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.svg` (пока простые: зелёный квадрат с листом).

Run: `cd frontend && npm run build && npm run typecheck && npm test`
Expected: сборка в `dist/`, в `dist/` есть `manifest.webmanifest` и `sw.js`, типы без ошибок, 1 тест PASS.

- [ ] **Step 7: Добавить Docker и nginx**

`frontend/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`frontend/nginx.conf`: `listen 80`, `root /usr/share/nginx/html`, `try_files $uri $uri/ /index.html`, `location /api/ { proxy_pass http://backend:8000; }`, `location /media/ { proxy_pass http://backend:8000; }`, gzip для `text/*` и `application/javascript`, `Cache-Control: public, max-age=31536000, immutable` для `/assets/`, CSP `default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'`.

`frontend/.dockerignore`: `node_modules`, `dist`, `.git`.

В `docker-compose.prod.yml` добавить сервис:

```yaml
  frontend:
    build:
      context: ./frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    depends_on:
      - backend
    networks:
      - gis-network
```

- [ ] **Step 8: Проверить конфигурацию compose и образ**

Run: `docker compose -f docker-compose.prod.yml config >/dev/null && docker build -t gisorders-frontend:test ./frontend`
Expected: обе команды без ошибок.

- [ ] **Step 9: Коммит**

```bash
git add frontend docker-compose.prod.yml .gitignore
git commit -m "feat(frontend): scaffold vite app with design tokens and nginx image"
```

---

## Задача 5: UI-кит — кнопки и поля

**Files:**
- Create: `frontend/src/shared/lib/cn.ts`
- Create: `frontend/src/shared/ui/Button.tsx`, `Field.tsx`, `Input.tsx`, `Textarea.tsx`, `Spinner.tsx`
- Test: `frontend/src/shared/ui/Button.test.tsx`, `frontend/src/shared/ui/Field.test.tsx`

**Interfaces:**
- Produces:
  - `cn(...classes: Array<string | false | null | undefined>): string`
  - `<Button variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean>` — рендерит `<button>`, при `loading` ставит `aria-busy` и `disabled`.
  - `<Field label: string; error?: string; hint?: string; htmlFor: string>` — обёртка с `label` и текстом ошибки `role="alert"`.
  - `<Input>`, `<Textarea>` — вперёд пробрасывают пропсы нативного элемента.

- [ ] **Step 1: Написать падающие тесты**

`frontend/src/shared/ui/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

test('primary button calls onClick', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Откликнуться</Button>)
  await userEvent.click(screen.getByRole('button', { name: 'Откликнуться' }))
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('loading button is disabled and busy', () => {
  render(<Button loading>Отправка</Button>)
  const button = screen.getByRole('button', { name: /Отправка/ })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
})

test('danger variant is reachable by name', () => {
  render(<Button variant="danger">Закрыть заказ</Button>)
  expect(screen.getByRole('button', { name: 'Закрыть заказ' })).toBeInTheDocument()
})
```

`frontend/src/shared/ui/Field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Field } from './Field'
import { Input } from './Input'

test('label is linked to input and error is announced', () => {
  render(
    <Field label="Название" htmlFor="title" error="Минимум 5 символов">
      <Input id="title" />
    </Field>,
  )
  expect(screen.getByLabelText('Название')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Минимум 5 символов')
  expect(screen.getByLabelText('Название')).toHaveAttribute('aria-invalid', 'true')
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модули `./Button`, `./Field` не найдены.

- [ ] **Step 3: Реализовать компоненты**

`cn.ts`: склеивает непустые классы через пробел (без сторонних зависимостей).

`Button.tsx`: сигнатура

```tsx
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  loading?: boolean
}
export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }: ButtonProps)
```

Классы по вариантам — из токенов (`bg-moss-600 text-white hover:bg-leaf-500`, `bg-sage-100 text-moss-600`, `border border-line text-moss-600`, `bg-terracotta-50 text-terracotta-600`). Токен `--color-terracotta-50: #fbeceb` добавить в `styles.css` вместе с остальными; hex в компонентах не пишем. Минимальная высота `min-h-11` (44 px), фокус-кольцо `focus-visible:ring-2 ring-leaf-500`.

`Field.tsx`: рендерит `label` c `htmlFor`, children, при `error` — `<p role="alert" className="text-sm text-terracotta-600">`; клонирует единственного ребёнка, добавляя `aria-describedby` и `aria-invalid`.

`Input.tsx` / `Textarea.tsx`: `min-h-11`, `rounded-[10px] border-line bg-card px-3 text-base focus-visible:ring-2 ring-leaf-500`, ошибка через `aria-invalid:border-terracotta-600`.

`Spinner.tsx`: круговой индикатор 16 px с `aria-hidden`.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && npm test`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/shared
git commit -m "feat(frontend): add button and form field primitives"
```

---

## Задача 6: API-клиент с обновлением токенов

**Files:**
- Create: `frontend/src/shared/config/env.ts`
- Create: `frontend/src/shared/lib/storage.ts`
- Create: `frontend/src/api/errors.ts`, `token.ts`, `refresh.ts`, `client.ts`, `types.ts`
- Test: `frontend/src/test/msw.ts`, `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; code?: string }`
  - `apiRequest<T>(path: string, init?: RequestInit): Promise<{ data: T; total: number | null }>` — подставляет `Authorization`, обновляет токен на 401, отдаёт `X-Total-Count`.
  - `setAccessToken(token: string | null)`, `getAccessToken(): string | null`
  - `refreshSession(): Promise<TokenPair>` — единственное обновление на вкладку и на все вкладки сразу.
  - `onSessionExpired(cb: () => void): () => void` — подписка на потерю сессии.
  - Типы `Order`, `OrderStatus`, `Proposal`, `ProposalStatus`, `Chat`, `Message`, `User`, `TokenPair`, `FeedFilters` в `types.ts`.

- [ ] **Step 1: Написать падающие тесты**

`frontend/src/test/msw.ts`:

```ts
import { setupServer } from 'msw/node'
export const server = setupServer()
```

`frontend/src/api/client.test.ts` — четыре теста:

```ts
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { apiRequest } from './client'
import { setAccessToken } from './token'
import { onSessionExpired } from './refresh'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { server.resetHandlers(); setAccessToken(null); localStorage.clear() })
afterAll(() => server.close())

test('sends bearer token', async () => {
  setAccessToken('access-1')
  let seen: string | null = null
  server.use(http.get('/api/v1/orders/1', ({ request }) => {
    seen = request.headers.get('Authorization')
    return HttpResponse.json({ id: 1 })
  }))

  const { data } = await apiRequest<{ id: number }>('/orders/1')

  expect(seen).toBe('Bearer access-1')
  expect(data.id).toBe(1)
})

test('refreshes once for concurrent 401 responses and retries', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  setAccessToken('expired')
  let refreshCalls = 0
  server.use(
    http.get('/api/v1/orders/1', ({ request }) =>
      request.headers.get('Authorization') === 'Bearer fresh'
        ? HttpResponse.json({ id: 1 })
        : HttpResponse.json({ detail: 'expired' }, { status: 401 })),
    http.get('/api/v1/orders/2', ({ request }) =>
      request.headers.get('Authorization') === 'Bearer fresh'
        ? HttpResponse.json({ id: 2 })
        : HttpResponse.json({ detail: 'expired' }, { status: 401 })),
    http.post('/api/v1/users/refresh', () => {
      refreshCalls += 1
      return HttpResponse.json({ access_token: 'fresh', refresh_token: 'refresh-2', token_type: 'bearer', user: { id: 1 } })
    }),
  )

  const [first, second] = await Promise.all([apiRequest('/orders/1'), apiRequest('/orders/2')])

  expect(refreshCalls).toBe(1)
  expect(first.data).toEqual({ id: 1 })
  expect(second.data).toEqual({ id: 2 })
})

test('emits session expired and clears tokens when refresh fails', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  const onExpired = vi.fn()
  const unsubscribe = onSessionExpired(onExpired)
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json({ detail: 'expired' }, { status: 401 })),
    http.post('/api/v1/users/refresh', () => HttpResponse.json({ detail: 'revoked' }, { status: 401 })),
  )

  await expect(apiRequest('/orders/1')).rejects.toMatchObject({ status: 401 })

  expect(onExpired).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('gisorders.refresh')).toBeNull()
  unsubscribe()
})

test('performs refresh inside a cross-tab lock', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  setAccessToken('expired')
  const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb())
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json({ detail: 'expired' }, { status: 401 })),
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json({ access_token: 'fresh', refresh_token: 'refresh-2', token_type: 'bearer', user: { id: 1 } })),
    http.get('/api/v1/orders/1', ({ request: req }) =>
      req.headers.get('Authorization') === 'Bearer fresh' ? HttpResponse.json({ id: 1 }) : HttpResponse.json({}, { status: 401 })),
  )

  await apiRequest('/orders/1')

  expect(request).toHaveBeenCalledWith('gisorders-refresh', expect.any(Function))
})

test('parses X-Total-Count when present', async () => {
  server.use(http.get('/api/v1/orders/available', () => HttpResponse.json([{ id: 1 }], { headers: { 'X-Total-Count': '42' } })))

  const result = await apiRequest('/orders/available')

  expect(result.total).toBe(42)
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модули `./client`, `./token`, `./refresh` не найдены.

- [ ] **Step 3: Реализовать хранилище и ошибки**

`storage.ts`: обёртка над `localStorage` с ключами `gisorders.refresh`, `gisorders.mode`, `gisorders.point`, `gisorders.draft`; при недоступном `localStorage` (приватный режим) работает в памяти.

`env.ts`: `export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'`.

`errors.ts`: `ApiError` с `status`, `code`; `parseError(response: Response): Promise<ApiError>` — читает JSON, берёт `detail` (строка или `{ message, code }`), иначе текст статуса.

- [ ] **Step 4: Реализовать токен и обновление**

`token.ts`: модульная переменная `accessToken`, функции чтения/записи, без хранения в `localStorage`.

`refresh.ts`:

```ts
export async function refreshSession(): Promise<TokenPair> {
  return navigator.locks.request('gisorders-refresh', async () => {
    const stored = storage.getRefreshToken()
    if (!stored) throw new ApiError('Сессия истекла', 401)
    // повторная проверка внутри блокировки: другая вкладка могла уже обновить токен
    const current = getAccessToken()
    if (current && current !== 'expired') return { ... }
    ...
  })
}
```

Точная логика обновления: единственный промис на вкладку (`let inFlight: Promise<TokenPair> | null`), внутри блокировки `navigator.locks`; если `navigator.locks` недоступен — работаем без него; после успеха сохраняем новый refresh и access; при ошибке — очищаем хранилище, зовём подписчиков `onSessionExpired` и пробрасываем ошибку.

- [ ] **Step 5: Реализовать клиент**

`client.ts`: базовая функция

```ts
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<{ data: T; total: number | null }>
```

Поведение: собирает URL `${API_BASE_URL}${path}`; `AbortSignal.timeout(15_000)`; при `401` и наличии refresh-токена — один `await refreshSession()` и повтор исходного запроса; при повторном `401` — выход на `onSessionExpired`; читает `X-Total-Count` в `total`; для `204` возвращает `data: null as T`.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test`
Expected: PASS, все тесты клиента.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/api frontend/src/shared frontend/src/test
git commit -m "feat(frontend): add api client with single-flight token refresh"
```

---

## Задача 7: Сессия, вход, регистрация, защита маршрутов

**Files:**
- Create: `frontend/src/entities/user/model.ts`
- Create: `frontend/src/features/auth/session.ts`, `api.ts`, `LoginForm.tsx`, `RegisterForm.tsx`, `RequireAuth.tsx`
- Create: `frontend/src/pages/login/LoginPage.tsx`, `frontend/src/pages/register/RegisterPage.tsx`
- Create: `frontend/src/test/providers.tsx` — обёртка для тестов
- Modify: `frontend/src/app/App.tsx` — подключить роутер и провайдеры
- Modify: `frontend/src/test/smoke.test.tsx` — после подключения роутера заглушка `<h1>GisOrders</h1>` исчезает; тест должен рендерить `<App/>` и ждать заголовок страницы входа
- Create: `frontend/src/app/providers.tsx`, `frontend/src/app/router.tsx`
- Test: `frontend/src/features/auth/*.test.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `refreshSession`, `setAccessToken`, `onSessionExpired` (задача 6).
- Produces:
  - `useSession` (Zustand): `{ user: User | null; status: 'loading' | 'anonymous' | 'authenticated'; setSession(pair: TokenPair): void; clear(): void }`
  - `useLogin()`, `useRegister()` — мутации TanStack Query.
  - `<RequireAuth>` — защита вложенных маршрутов.
  - Маршруты `/login`, `/register`.

- [ ] **Step 1: Написать падающие тесты**

`frontend/src/features/auth/LoginForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { LoginForm } from './LoginForm'
import { TestProviders } from '@/test/providers'

test('shows validation error for empty email', async () => {
  render(<LoginForm onSubmit={vi.fn()} />, { wrapper: TestProviders })
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
  expect(await screen.findByText('Введите email')).toBeInTheDocument()
})

test('submits credentials and returns user', async () => {
  server.use(http.post('/api/v1/users/login/json', () =>
    HttpResponse.json({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', user: { id: 1, email: 'a@b.c', username: 'anna', phone_number: null, is_admin: false, is_active: true } })))
  const onSuccess = vi.fn()
  render(<LoginForm onSubmit={onSuccess} />, { wrapper: TestProviders })

  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
})
```

`frontend/src/features/auth/RequireAuth.test.tsx` — три теста: при `status: 'loading'` показывает скелетон и не редиректит; при `'anonymous'` редиректит на `/login` с `state.from`; при `'authenticated'` рендерит детей.

`frontend/src/features/auth/session.test.ts` — при старте с сохранённым refresh вызывает `/users/refresh` и `/users/me`; при ошибке refresh переводит в `anonymous` и чистит хранилище.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать сессию и API**

`session.ts`: Zustand-стор; `bootstrap()` — если есть refresh-токен, `refreshSession()` → `GET /users/me` → `authenticated`, иначе `anonymous`; вызывается один раз в `providers.tsx`. Подписка `onSessionExpired(() => useSession.getState().clear())`.

`api.ts`: `login(email, password)` → `POST /users/login/json`; `register(payload)` → `POST /users/register`, затем автоматический вход; `logout()` → `POST /users/logout` с refresh и очистка.

- [ ] **Step 4: Реализовать формы**

`LoginForm.tsx`: react-hook-form + zod (`email` обязателен и валиден, `password` непустой). Ошибки полей — через `Field`. Серверная ошибка `rate_limited` — плашкой над кнопкой с текстом из ответа.

`RegisterForm.tsx`: email, username, phone (необязателен, маска `+7XXXXXXXXXX`), пароль. Под полем пароля — список требований, которые гасятся по мере выполнения: «8 символов», «заглавная буква», «цифра». Схема zod дублирует правила бэкенда.

- [ ] **Step 5: Подключить маршрутизацию и защиту**

`router.tsx`: `createBrowserRouter` с маршрутами `/login`, `/register` и защищённым layout-маршрутом `/` (пока с заглушкой внутри `<Outlet/>`). `RequireAuth` при `loading` показывает скелетон, при `anonymous` — `<Navigate to="/login" replace state={{ from: location }} />`, после входа возврат на `state.from?.pathname ?? '/'`.

`providers.tsx`: `QueryClientProvider` + `ToastProvider` (создаётся здесь минимальный, на `aria-live`) + вызов `bootstrap()` в `useEffect`.

`src/test/providers.tsx`: `TestProviders` — свежий `QueryClient` с `retry: false`, `MemoryRouter` с начальным маршрутом и `ToastProvider`; используется всеми компонентными тестами начиная с этой задачи.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test`
Expected: PASS, все тесты авторизации.

- [ ] **Step 7: Проверить вживую**

Run: `cd backend && uv run uvicorn main:app --reload` в одном терминале и `cd frontend && npm run dev` в другом.
Expected: регистрация создаёт пользователя, вход ведёт на `/`, перезагрузка страницы сохраняет сессию, выход возвращает на `/login`.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add session bootstrap, login and registration"
```

---

## Задача 8: Оболочка приложения и переключатель ролей

**Files:**
- Create: `frontend/src/features/switch-role/model.ts`, `RoleSwitch.tsx`, `frontend/src/features/switch-role/model.test.ts`
- Create: `frontend/src/widgets/app-shell/AppShell.tsx`, `Header.tsx`, `BottomNav.tsx`, `nav-items.ts`
- Create: `frontend/src/shared/ui/Avatar.tsx`, `Badge.tsx`
- Create: `frontend/src/pages/feed/FeedPage.tsx` (заглушка), `frontend/src/pages/profile/ProfilePage.tsx` (заглушка), `frontend/src/pages/not-found/NotFoundPage.tsx`
- Modify: `frontend/src/app/router.tsx` — layout с `AppShell`
- Test: `frontend/src/widgets/app-shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useSession` (задача 7).
- Produces:
  - `type RoleMode = 'customer' | 'executor'`
  - `useRoleMode(): [RoleMode, (mode: RoleMode) => void]` — значение в `localStorage` (`gisorders.mode`), по умолчанию `customer`.
  - `navItems(mode: RoleMode): Array<{ to: string; label: string; icon: IconName }>` — 5 пунктов.
  - `<AppShell>` — шапка + контент + навигация.

- [ ] **Step 1: Написать падающие тесты**

`model.test.ts`:

```ts
import { navItems } from '@/widgets/app-shell/nav-items'

test('executor nav renames orders and proposals', () => {
  expect(navItems('executor').map((item) => item.label)).toEqual([
    'Лента', 'Мои работы', 'Мои отклики', 'Чаты', 'Профиль',
  ])
})

test('customer nav keeps orders and proposals wording', () => {
  expect(navItems('customer').map((item) => item.label)).toEqual([
    'Лента', 'Мои заказы', 'Отклики', 'Чаты', 'Профиль',
  ])
})
```

`AppShell.test.tsx`:

```tsx
test('role switch changes nav labels and persists mode', async () => {
  localStorage.clear()
  render(<AppShell />, { wrapper: TestProviders })
  expect(screen.getByRole('link', { name: 'Мои заказы' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Исполнитель' }))

  expect(screen.getAllByRole('link', { name: 'Мои работы' }).length).toBeGreaterThan(0)
  expect(localStorage.getItem('gisorders.mode')).toBe('executor')
})

test('header and bottom nav are both present in DOM', () => {
  render(<AppShell />, { wrapper: TestProviders })
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализовать режим роли и пункты меню**

`model.ts`: Zustand или `useSyncExternalStore` поверх `storage`; при смене — запись в `localStorage`, без перезагрузки.

`nav-items.ts`: 5 пунктов с путями `/`, `/my/orders`, `/my/proposals`, `/chats`, `/profile`; иконки — инлайновые SVG 20×20 (`list`, `briefcase`, `send`, `chat`, `user`), без сторонних иконок.

`RoleSwitch.tsx`: `role="radiogroup"` с двумя `role="radio"`, компактный на телефоне (текст «Заказчик» / «Исполнитель» ужимается до инициалов через CSS при ширине < 400 px, `aria-label` остаётся полным).

- [ ] **Step 4: Реализовать оболочку**

`AppShell.tsx`: `min-h-dvh flex flex-col`; `Header` (`role="banner"`): логотип, `RoleSwitch`, аватар со ссылкой на профиль. Навигация: на ширине < 1024 px — фиксированная нижняя панель (`role="navigation" aria-label="Основная навигация"`), от 1024 px — строка вкладок под шапкой; в DOM присутствует только один вариант (условный рендер по `matchMedia`). Отступ контента снизу 64 px на телефоне, чтобы панель не перекрывала список. Учесть `env(safe-area-inset-bottom)`.

`Badge.tsx`: варианты `open`, `work`, `closed`, `accepted`, `pending`, `rejected` с текстами «Открыт», «В работе», «Закрыт», «Принят», «Ожидает», «Отклонён».

`Avatar.tsx`: инициалы пользователя, круг 32 px, фон `sage-100`, цвет `moss-600`.

- [ ] **Step 5: Подключить layout**

В `router.tsx` заменить заглушку на `<AppShell/>` с `<Outlet/>`; добавить маршруты `/`, `/my/orders`, `/my/proposals`, `/chats`, `/profile` (страницы-заглушки с заголовком), `*` → `NotFoundPage`.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS, типы без ошибок.

- [ ] **Step 7: Проверить адаптивность вживую**

Run: `cd frontend && npm run dev`
Expected: на 360 px — нижняя панель с пятью пунктами и переключатель ролей в шапке; на 1440 px — вкладки под шапкой; переключение роли меняет подписи и сохраняется после перезагрузки.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add app shell, responsive nav and role switch"
```

---

## Проверка плана

- [ ] `cd backend && uv run pytest --cov=api --cov=core --cov-report=term-missing` — PASS, ≥ 75%.
- [ ] `cd backend && uv run ruff check .` — чисто.
- [ ] `cd backend && uv run alembic check` — миграций не требуется, дрейфа нет.
- [ ] `cd frontend && npm test && npm run typecheck && npm run build` — PASS.
- [ ] `docker compose -f docker-compose.prod.yml config >/dev/null` — валидно.

---

## Дальше

Экраны, карта, отклики, чаты и профиль — в `docs/superpowers/plans/2026-10-28-frontend-screens.md`. Этот план должен быть полностью выполнен до начала следующего: следующий опирается на `apiRequest`, `useSession`, `useRoleMode`, `AppShell`, `Button`, `Field`, `Input`.
