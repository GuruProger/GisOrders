# GisOrders — фронтенд

SPA на React 19, Vite и TypeScript. Приложение работает с API бэкенда через
`/api/v1`; в dev-режиме Vite проксирует `/api` и `/media` на
`http://127.0.0.1:8000` (см. `vite.config.ts`).

## Требования

- Node.js 20+ и npm
- запущенный бэкенд на `http://127.0.0.1:8000` (подробности — в корневом
  `README.md`)
- для e2e — браузеры Playwright (ставятся отдельной командой, см. ниже)

## Установка

```bash
cd frontend
npm install
cp .env.example .env   # при необходимости: VITE_API_BASE_URL, VITE_FEATURE_SEARCH, VITE_WS_URL
```

## Разработка

```bash
npm run dev
```

Приложение откроется на `http://127.0.0.1:5173`. Бэкенд должен быть запущен
отдельно; Vite сам проксирует API и WebSocket-соединения чата.

## Тесты и проверки

```bash
npm test          # unit/component-тесты (Vitest + MSW)
npm run typecheck # проверка типов (tsc -b)
npm run build     # production-сборка в dist/
```

`npm test` намеренно исключает каталог `e2e/`: сценарии Playwright запускаются
отдельной командой и не должны попадать в jsdom-окружение Vitest.

## E2E-тесты

```bash
# один раз: скачать браузеры
npx playwright install chromium webkit
# если системе не хватает библиотек (Linux): npx playwright install-deps

npm run e2e
```

Конфигурация — `playwright.config.ts`. Сценарии лежат в `e2e/`:

| Файл | Что проверяет |
|---|---|
| `auth-feed-proposal.spec.ts` | вход исполнителя, поиск заказа в ленте, отправка отклика |
| `create-order.spec.ts` | создание заказа через форму и его удаление |
| `accept-and-chat.spec.ts` | принятие отклика, открытие чата и доставка сообщения исполнителю |

Тесты запускаются в двух проектах: `desktop-chrome` (Chromium) и
`mobile-safari` (эмуляция iPhone 13 в WebKit). Один worker выбран специально:
это не превышает лимит попыток входа и дневной лимит откликов на бэкенде.

Playwright сам запускает `npm run dev`, если сервер ещё не работает, и
переиспользует уже запущенный (`reuseExistingServer`). Перед запуском должны
быть подняты бэкенд и база данных.

### Переменные окружения

| Переменная | По умолчанию |
|---|---|
| `E2E_BASE_URL` | `http://127.0.0.1:5173` |
| `E2E_CUSTOMER_EMAIL` | `customer_test@example.com` |
| `E2E_EXECUTOR_EMAIL` | `executor_test@example.com` |
| `E2E_PASSWORD` | `Testpass123` |

### Демо-данные

Сид-скрипт создаёт заказчика `customer_test@example.com` (username
`test_user`), исполнителя `executor_test@example.com` (username
`test_executor`), 50 открытых заказов и несколько чатов. Пароль обоих
аккаунтов — `Testpass123`.

```bash
cd backend
uv run python seed_db.py
```

Скрипт идемпотентен для пользователей и чатов: повторный запуск не создаёт
дубликаты аккаунтов, но добавляет новую партию заказов. Файл `seed_db.py`
является локальным инструментом и не входит в коммиты.

E2E-тесты создают собственные заказы с уникальными названиями (метка времени)
и удаляют их после проверки, поэтому повторные прогоны не засоряют ленту.
Исключение — неудачный прогон: созданные данные могут остаться, их можно
удалить через «Мои заказы» или API.

Артефакты Playwright (`test-results/`, `playwright-report/`) не коммитятся.
