import pytest
from pydantic import ValidationError

from core.config import Settings

DB_URL = "postgresql+asyncpg://user:password@localhost:5432/test"


@pytest.mark.parametrize("secret", [
	"",
	"key",
	"secret",
	"changeme",
	"short-secret",
	"change-me-use-a-random-64-character-secret-value",
])
def test_insecure_jwt_secret_is_rejected(secret):
	"""Слабый или дефолтный ключ подписи не должен проходить валидацию настроек."""
	with pytest.raises(ValidationError):
		Settings(DB_URL=DB_URL, JWT_SECRET_KEY=secret)


def test_long_jwt_secret_is_accepted():
	secret = "x" * 32
	assert Settings(DB_URL=DB_URL, JWT_SECRET_KEY=secret).jwt_secret_key == secret
