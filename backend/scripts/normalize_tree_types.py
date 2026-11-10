#!/usr/bin/env python
"""
Приводит породу дерева в существующих заказах к единому виду.

Одноразовый скрипт: исправляет строки, записанные до появления нормализации
(лишние пробелы, верхний регистр, «ё» вместо «е»). Повторный запуск безопасен.
"""

import asyncio

from sqlalchemy import select

from api.v1.orders.models import Order
from api.v1.orders.normalization import normalize_tree_type
from core.database import db_helper


async def main() -> None:
	updated = 0

	async with db_helper.session_factory() as session:
		orders = (await session.execute(select(Order))).scalars().all()

		for order in orders:
			normalized = normalize_tree_type(order.tree_type)
			if normalized != order.tree_type:
				order.tree_type = normalized
				updated += 1

		# Коммитим один раз в конце: изменённые строки уходят одним пакетом
		await session.commit()

	await db_helper.dispose()

	print(f"Обновлено заказов: {updated}")


if __name__ == "__main__":
	asyncio.run(main())
