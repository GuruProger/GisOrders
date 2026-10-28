import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class SlidingWindowLimiter:
	"""
	Скользящее окно попыток в памяти процесса.

	Подходит для одного воркера uvicorn. При горизонтальном масштабировании
	нужен общий счётчик (Redis), иначе лимит умножается на число процессов.
	"""
	
	limit: int
	window_seconds: int
	_events: dict[str, deque[float]] = field(default_factory=dict)
	
	def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
		"""Возвращает (разрешено, через сколько секунд повторить)."""
		current = time.monotonic() if now is None else now
		events = self._events.setdefault(key, deque())
		threshold = current - self.window_seconds
		
		while events and events[0] <= threshold:
			events.popleft()
		
		if len(events) >= self.limit:
			retry_after = max(1, int(events[0] + self.window_seconds - current) + 1)
			return False, retry_after
		
		events.append(current)
		return True, 0
	
	def reset(self) -> None:
		self._events.clear()
