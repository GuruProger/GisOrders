#!/usr/bin/env python
"""
Удаляет изображения из MEDIA_ROOT, на которые не ссылается ни один заказ.

Запускать по cron. Свежие файлы (по умолчанию младше 24 часов) не удаляются:
загрузка могла произойти до того, как URL попал в заказ.
"""

import argparse
import asyncio
from pathlib import Path

from api.v1.uploads.cleanup import MediaCleanupService
from core.database import db_helper


async def main() -> None:
	parser = argparse.ArgumentParser(description="Очистка неиспользуемых изображений")
	parser.add_argument(
		"--min-age-hours",
		type=float,
		default=24,
		help="Не удалять файлы младше N часов (по умолчанию 24)",
	)
	parser.add_argument(
		"--dry-run",
		action="store_true",
		help="Только показать файлы, ничего не удалять",
	)
	parser.add_argument(
		"--media-root",
		type=Path,
		default=None,
		help="Каталог медиа (по умолчанию MEDIA_ROOT)",
	)
	args = parser.parse_args()
	
	async with db_helper.session_factory() as session:
		removed = await MediaCleanupService.cleanup_orphans(
			session,
			media_root=args.media_root,
			min_age_seconds=int(args.min_age_hours * 3600),
			dry_run=args.dry_run,
		)
	
	await db_helper.dispose()
	
	action = "Будет удалено" if args.dry_run else "Удалено"
	print(f"{action} файлов: {len(removed)}")
	for path in removed:
		print(path)


if __name__ == "__main__":
	asyncio.run(main())
