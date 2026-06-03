from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CitationChat"
    app_env: str = "dev"
    api_prefix: str = "/api"
    database_url: str = "postgresql+asyncpg://citationchat:citationchat@localhost:5432/citationchat"
    jwt_secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expires_minutes: int = 60 * 24


settings = Settings()
