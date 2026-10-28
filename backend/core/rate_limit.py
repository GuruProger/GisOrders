import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from redis.asyncio import Redis

from core.config import settings
from core.redis import create_redis_client

logger = logging.getLogger(__name__)

# Атомарно проверяет и обновляет скользящее окно в Redis.
# KEYS[1] - ключ счётчика, ARGV - now, window_seconds, limit, member.
RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local count = redis.call('ZCARD', key)
if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry = math.floor(oldest[2] + window - now) + 1
    if retry < 1 then
        retry = 1
    end
    return {0, retry}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, math.ceil(window * 1000))
return {1, 0}
"""


@dataclass
class SlidingWindowLimiter:
	"""
	Скользящее окно попыток в памяти процесса.

	Используется как fallback, когда Redis не настроен или недоступен.
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


class RateLimiter:
	"""
	Rate limiter с общим счётчиком в Redis и fallback в память процесса.

	Redis хранит события каждого ключа в sorted set и обновляет его атомарным
	Lua-скриптом, поэтому лимит не умножается на число воркеров uvicorn.
	Если Redis недоступен, запросы продолжают обслуживаться локальным
	скользящим окном: деградация не должна ронять вход и регистрацию.
	"""
	
	def __init__(
			self,
			limit: int,
			window_seconds: int,
			redis_client: Optional[Redis] = None,
	) -> None:
		self.limit = limit
		self.window_seconds = window_seconds
		self._redis = redis_client
		self._memory = SlidingWindowLimiter(limit, window_seconds)
	
	async def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
		"""Возвращает (разрешено, через сколько секунд повторить)."""
		if self._redis is not None:
			try:
				return await self._allow_redis(key, now)
			except Exception:
				logger.warning(
					"Redis rate limiter unavailable, using in-memory fallback",
					exc_info=True,
				)
		
		return self._memory.allow(key, now=now)
	
	async def _allow_redis(self, key: str, now: float | None) -> tuple[bool, int]:
		current = time.time() if now is None else now
		allowed, retry_after = await self._redis.eval(
			RATE_LIMIT_SCRIPT,
			1,
			f"gisorders:ratelimit:{key}",
			current,
			self.window_seconds,
			self.limit,
			f"{current}:{uuid.uuid4().hex}",
		)
		return bool(int(allowed)), int(retry_after)
	
	def reset(self) -> None:
		"""Сбрасывает локальное состояние (используется в тестах)."""
		self._memory.reset()


def build_rate_limiter(limit: int, window_seconds: int) -> RateLimiter:
	return RateLimiter(
		limit=limit,
		window_seconds=window_seconds,
		redis_client=create_redis_client(settings.redis_url),
	)
