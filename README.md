# Gentree

Базовый backend-каркас для веб-приложения генеалогических исследований на FastAPI в формате модульного монолита.

## Стек

- FastAPI
- SQLAlchemy 2.0
- Alembic
- PostgreSQL 15
- Pydantic v2
- pytest
- Docker / Docker Compose

## Структура

```text
gentree/
  backend/
    app/
    tests/
    alembic/
    pyproject.toml
    Dockerfile
  frontend/
  docs/
  docker-compose.yml
```

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```
docker compose down
docker compose up -d --build

Документация будет доступна по адресу `http://localhost:8000/docs`.

## AI-генерация книги

Для нейросетевого повествования укажите в `.env`:

```env
YANDEX_API_KEY=AQVN...
YANDEX_FOLDER_ID=b1g...
YANDEX_MODEL=yandexgpt
YANDEX_MODEL_VERSION=rc
```

Если ключ не указан, книга всё равно формируется, но используется детерминированный
текстовый шаблон без AI. Внешней модели передаются только данные выбранного
генеалогического исследования: персоны, связи и текстовые факты.

Версия `rc` используется, потому что для неё YandexGPT поддерживает строгий ответ
по JSON Schema, необходимый для безопасной сборки глав книги.
