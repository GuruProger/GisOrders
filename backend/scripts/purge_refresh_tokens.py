#!/usr/bin/env python
"""Удаляет истёкшие refresh-токены. Запускать по cron, например раз в сутки."""

import asyncio

from api.v1.users.services import RefreshTokenService
from core.database import db_helper


async def main() -> None:
	async with db_helper.session_factory() as session:
		removed = await RefreshTokenService.purge_expired(session)
		await session.commit()
	
	await db_helper.dispose()
	print(f"Удалено истёкших refresh-токенов: {removed}")


if __name__ == "__main__":
	asyncio.run(main())
