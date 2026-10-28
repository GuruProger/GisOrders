from datetime import datetime, timezone


def utcnow() -> datetime:
	"""Текущее время в UTC с таймзоной."""
	return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
	"""
	Приводит datetime к UTC.

	Naive-значения считаются UTC, а не локальным временем сервера.
	"""
	if value.tzinfo is None:
		return value.replace(tzinfo=timezone.utc)
	return value.astimezone(timezone.utc)
