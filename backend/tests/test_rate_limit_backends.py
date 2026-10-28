import fakeredis.aioredis
import pytest

from core.rate_limit import RateLimiter


def make_redis() -> fakeredis.aioredis.FakeRedis:
	return fakeredis.aioredis.FakeRedis(decode_responses=True)


class BrokenRedis:
	"""Имитирует недоступный Redis: и подписка, и команды падают."""

	def pubsub(self):
		raise ConnectionError("redis is down")

	async def eval(self, *args, **kwargs):
		raise ConnectionError("redis is down")


@pytest.mark.asyncio
async def test_in_memory_limiter_allows_up_to_limit():
	limiter = RateLimiter(limit=3, window_seconds=60)

	for _ in range(3):
		assert await limiter.allow("login:1.2.3.4:a@test.com", now=1000.0) == (True, 0)

	allowed, retry_after = await limiter.allow("login:1.2.3.4:a@test.com", now=1000.0)

	assert allowed is False
	assert retry_after >= 1


@pytest.mark.asyncio
async def test_in_memory_limiter_frees_slot_after_window():
	limiter = RateLimiter(limit=1, window_seconds=60)

	assert (await limiter.allow("key", now=1000.0))[0] is True
	assert (await limiter.allow("key", now=1030.0))[0] is False
	assert (await limiter.allow("key", now=1061.0))[0] is True


@pytest.mark.asyncio
async def test_in_memory_limiter_scopes_keys():
	limiter = RateLimiter(limit=1, window_seconds=60)

	assert (await limiter.allow("first", now=1000.0))[0] is True
	assert (await limiter.allow("second", now=1000.0))[0] is True
	assert (await limiter.allow("first", now=1000.0))[0] is False


@pytest.mark.asyncio
async def test_redis_limiter_is_shared_between_workers():
	"""Два экземпляра лимитера с одним Redis делят общий счётчик."""
	redis = make_redis()
	first = RateLimiter(limit=3, window_seconds=60, redis_client=redis)
	second = RateLimiter(limit=3, window_seconds=60, redis_client=redis)

	assert (await first.allow("shared", now=1000.0))[0] is True
	assert (await second.allow("shared", now=1000.0))[0] is True
	assert (await first.allow("shared", now=1000.0))[0] is True

	allowed, retry_after = await second.allow("shared", now=1000.0)

	assert allowed is False
	assert retry_after >= 1


@pytest.mark.asyncio
async def test_redis_limiter_reports_retry_after_and_expires_window():
	redis = make_redis()
	limiter = RateLimiter(limit=1, window_seconds=60, redis_client=redis)

	assert (await limiter.allow("key", now=1000.0))[0] is True
	allowed, retry_after = await limiter.allow("key", now=1010.0)

	assert allowed is False
	assert retry_after == 51
	assert (await limiter.allow("key", now=1061.0))[0] is True

	await redis.aclose()


@pytest.mark.asyncio
async def test_limiter_falls_back_to_memory_when_redis_is_unavailable():
	limiter = RateLimiter(
		limit=2,
		window_seconds=60,
		redis_client=BrokenRedis(),
	)

	assert (await limiter.allow("key", now=1000.0))[0] is True
	assert (await limiter.allow("key", now=1000.0))[0] is True
	assert (await limiter.allow("key", now=1000.0))[0] is False
