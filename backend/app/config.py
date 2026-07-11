from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    database_url: str = "sqlite:///./golf.db"
    admin_email: str = "admin@example.com"
    admin_password: str = "changeme"


settings = Settings()
