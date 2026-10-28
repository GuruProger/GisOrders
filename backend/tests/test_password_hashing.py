
from core.auth import get_password_hash, verify_password


def test_password_hash_roundtrip():
	"""Хеш совместим с bcrypt и проверяется без passlib."""
	hashed = get_password_hash("Password123")
	
	assert hashed.startswith("$2")
	assert hashed != "Password123"
	assert verify_password("Password123", hashed) is True
	assert verify_password("WrongPassword1", hashed) is False


def test_invalid_hash_does_not_raise():
	"""Повреждённый хеш в БД не должен ронять проверку пароля."""
	assert verify_password("Password123", "not-a-bcrypt-hash") is False
