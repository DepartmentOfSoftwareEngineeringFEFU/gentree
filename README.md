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
