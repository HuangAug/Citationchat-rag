from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "api/.env"), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CitationChat"
    app_env: str = "dev"
    api_prefix: str = "/api"
    database_url: str = "postgresql+asyncpg://citationchat:citationchat@localhost:5432/citationchat"
    jwt_secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expires_minutes: int = 60 * 24
    admin_email: str = "admin@local"
    admin_password: str = "123456"
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_api_key: str = ""
    llm_model: str = "qwen3.5-plus-2026-04-20"
    embedding_model: str = "text-embedding-v4"
    embedding_dimensions: int = 1536
    storage_dir: str = "storage"
    max_upload_size_mb: int = 20
    rag_chunk_size: int = 1000
    rag_chunk_overlap: int = 200
    rag_embedding_batch_size: int = 32
    rag_top_k: int = 5


settings = Settings()
