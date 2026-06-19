from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./golf.db"
    secret_key: str = "changeme"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30


settings = Settings()
