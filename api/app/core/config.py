from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CitationChat"
    app_env: str = "dev"
    api_prefix: str = "/api"
    database_url: str = "postgresql+asyncpg://citationchat:citationchat@localhost:5432/citationchat"


settings = Settings()
