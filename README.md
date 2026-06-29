# Gentree

Веб-приложение для генеалогических исследований: построение и визуализация
родового древа, заявки в архивы, генерация книги по собранным фактам.
Реализовано как модульный монолит с тремя ролями пользователей — `USER`,
`GENEALOGIST`, `ADMIN`.

## Стек

**Backend**
- FastAPI, Pydantic v2
- SQLAlchemy 2.0 (async) + Alembic
- PostgreSQL 15
- JWT-аутентификация (PyJWT, bcrypt)
- pytest

**Frontend**
- React 18 + Vite
- React Router v6
- @xyflow/react (ReactFlow) + @dagrejs/dagre — визуализация и раскладка древа

**Инфраструктура**
- Docker / Docker Compose
- Nginx (раздача статики фронтенда и проксирование `/api`, `/uploads`)

## Структура

```text
gentree/
  backend/
    app/            # код приложения (модули: auth, users, persons, relationships, facts, ...)
    tests/
    alembic/
    pyproject.toml
    Dockerfile
  frontend/
    src/
    Dockerfile
    nginx.conf
  docs/              # ER-модель, структура БД, бэклог
  docker-compose.yml
```

## Быстрый старт

Требуется только Docker и Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

Поднимутся три контейнера: `db` (PostgreSQL), `backend` (FastAPI, миграции
применяются автоматически при старте) и `frontend` (Nginx со собранной
статикой React-приложения).

После запуска:

| Что | Адрес |
|---|---|
| Веб-приложение | http://localhost:8080 |
| API (Swagger) | http://localhost:8000/docs |

Остановить: `docker compose down` (или `docker compose down -v`, чтобы
дополнительно удалить данные БД и загруженные файлы).

### Создание администратора

Самостоятельной регистрации с ролью `ADMIN` через UI нет — это сделано
намеренно. Чтобы создать (или повысить существующего) пользователя до
администратора:

```bash
docker compose exec backend python -m app.scripts.create_admin admin@example.com "пароль"
```

После этого можно войти под этим email/паролем — в приложении откроется
панель администратора.

### Демо-пользователь с заполненным древом

Чтобы сразу увидеть результат работы приложения (без ручного заполнения
данных), можно создать демо-пользователя с готовым семейным древом — три
поколения, родители/дети, брак, один расторгнутый брак (чтобы показать
рендер «бывшие супруги») и несколько фактов:

```bash
docker compose exec backend python -m app.scripts.seed_demo
```

Создаст (или пересоздаст с нуля) пользователя:

```
email:    demo@example.com
password: demo12345
```

Под этим логином сразу открывается профиль «Семья Ивановых» с 10 персонами
и 14 связями — можно сразу перейти на страницу древа.

Скрипт принимает свои email/пароль: `python -m app.scripts.seed_demo my@mail.com mypass`.

## Переменные окружения

Все читаются из `.env` (см. `.env.example`):

| Переменная | Назначение |
|---|---|
| `POSTGRES_*` | подключение к PostgreSQL |
| `SECRET_KEY` | секрет для подписи JWT — обязательно сменить для боевого окружения |
| `UPLOAD_DIR` | каталог для загруженных файлов внутри контейнера backend |
| `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`, `YANDEX_MODEL`, `YANDEX_MODEL_VERSION` | доступ к Yandex AI Studio для генерации книги (опционально) |

## AI-генерация книги

Для нейросетевого повествования укажите в `.env`:

```env
YANDEX_API_KEY=AQVN...
YANDEX_FOLDER_ID=b1g...
YANDEX_MODEL=yandexgpt
YANDEX_MODEL_VERSION=rc
```

Если ключ не указан, книга всё равно формируется, но используется
детерминированный текстовый шаблон без AI. Внешней модели передаются только
данные выбранного генеалогического исследования: персоны, связи и текстовые
факты.

Версия `rc` используется, потому что для неё YandexGPT поддерживает строгий
ответ по JSON Schema, необходимый для безопасной сборки глав книги.

## Разработка без Docker

Если нужно запускать backend и frontend с hot-reload (Python 3.12+, Node 20+,
локальный PostgreSQL):

```bash
# БД
docker compose up -d db

# backend (порт 8001, его ждёт vite proxy)
cd backend
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8001

# frontend
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Тесты

```bash
# backend
cd backend && pytest

# frontend (раскладка древа)
cd frontend && npm test
```

## Документация

Подробное описание модели данных и архитектуры — в [docs/](docs):
- [er-model-3nf.md](docs/er-model-3nf.md) — ER-модель в 3НФ
- [database-physical-structure.md](docs/database-physical-structure.md) — физическая структура БД
- [backend-backlog.md](docs/backend-backlog.md) — бэклог разработки
