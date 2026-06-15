from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],  # works from both backend/ and project root
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    project_name: str = "Gentree API"
    environment: str = "local"
    api_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"

    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "gentree"
    postgres_user: str = "gentree"
    postgres_password: str = "gentree"
    database_echo: bool = False

    secret_key: str = "change-me-in-production-use-a-long-random-string"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    upload_dir: str = "./uploads"

    yandex_api_key: str | None = None
    yandex_folder_id: str | None = None
    yandex_model: str = "yandexgpt"
    yandex_model_version: str = "rc"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        return (
            "postgresql+psycopg://"
            f"{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
