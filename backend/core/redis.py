from redis.asyncio import Redis


def create_redis_client(url: str | None) -> Redis | None:
	"""Создаёт клиент Redis; соединение устанавливается лениво."""
	if not url:
		return None
	
	return Redis.from_url(
		url,
		decode_responses=True,
		socket_connect_timeout=0.5,
		socket_timeout=0.5,
	)
