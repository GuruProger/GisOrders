from pathlib import Path
from functools import lru_cache

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
	# Сервер
	app_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
	app_port: int = Field(default=8000, alias="BACKEND_PORT")
	
	# База данных
	db_url: PostgresDsn = Field(alias="DB_URL")
	db_echo: bool = False
	db_echo_pool: bool = False
	db_max_overflow: int = 20
	db_pool_size: int = 10
	
	# JWT
	jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
	jwt_algorithm: str = "HS256"
	access_token_expire_minutes: int = 30
	
	# Бизнес-логика
	max_chats_per_day: int = 3
	
	# CORS
	cors_origins: list[str] = [
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"*"
	]
	
	# Настройки чтения переменных окружения
	model_config = SettingsConfigDict(
		env_file=PROJECT_ROOT / ".env",
		env_file_encoding="utf-8",
		case_sensitive=False,
		extra="ignore",
	)
	
	@property
	def db_naming_convention(self) -> dict[str, str]:
		return {
			"ix": "ix_%(column_0_label)s",
			"uq": "uq_%(table_name)s_%(column_0_N_name)s",
			"ck": "ck_%(table_name)s_%(constraint_name)s",
			"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
			"pk": "pk_%(table_name)s",
		}


@lru_cache
def get_settings() -> Settings:
	return Settings()


settings = get_settings()