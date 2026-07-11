import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, PostgresDsn, Field

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

env_path = PROJECT_ROOT / ".env"

if env_path.is_file():
	load_dotenv(env_path)
	

# .env файла нет, падаем с ошибкой
if not os.getenv("DB_URL") and not env_path.is_file():
	raise FileNotFoundError(
		f"Critical Error: .env file not found at {env_path}\n"
	)


class Settings(BaseModel):
	# Настройки из backend/.env
	
	app_host: str = "0.0.0.0"
	app_port: int = int(os.getenv("BACKEND_PORT", "8000"))
	
	db_url: PostgresDsn = os.getenv("DB_URL")
	db_echo: bool = False
	db_echo_pool: bool = False
	db_max_overflow: int = 20
	db_pool_size: int = 10
	db_naming_convention: dict[str, str] = (
		{  # Шаблоны для миграций алембика
			"ix": "ix_%(column_0_label)s",
			"uq": "uq_%(table_name)s_%(column_0_N_name)s",
			"ck": "ck_%(table_name)s_%(constraint_name)s",
			"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
			"pk": "pk_%(table_name)s",
		}
	)
	
	SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
	ALGORITHM: str = "HS256"
	ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
	
	cors_origins: list[str] = [
		"http://localhost:3000",
		"http://127.0.0.1:3000"
	]
	
	class Config:
		env_file = ".env"
		env_file_encoding = "utf-8"
		case_sensitive = False


settings = Settings()
