import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings

from ..orders.models import Order


class MediaCleanupService:
	"""
	Удаляет файлы в MEDIA_ROOT, на которые не ссылается ни один заказ.

	Ссылки хранятся в Order.photos как URL вида /media/images/<uuid>.webp.
	Свежие файлы не трогаем: загрузка могла произойти до сохранения заказа.
	"""
	
	@staticmethod
	async def cleanup_orphans(
			session: AsyncSession,
			*,
			media_root: Path | None = None,
			min_age_seconds: int = 24 * 3600,
			now: float | None = None,
			dry_run: bool = False,
	) -> list[Path]:
		root = Path(media_root or settings.media_root).resolve()
		current = time.time() if now is None else now
		referenced = await MediaCleanupService._collect_references(session, root)
		
		images_dir = root / "images"
		if not images_dir.is_dir():
			return []
		
		removed: list[Path] = []
		for path in sorted(images_dir.rglob("*")):
			if not path.is_file():
				continue
			
			try:
				modified_at = path.stat().st_mtime
			except OSError:
				continue
			
			if current - modified_at < min_age_seconds:
				continue
			if path.resolve() in referenced:
				continue
			
			removed.append(path)
			if not dry_run:
				path.unlink(missing_ok=True)
		
		return removed
	
	@staticmethod
	async def _collect_references(
			session: AsyncSession,
			media_root: Path,
	) -> set[Path]:
		rows = await session.execute(
			select(Order.photos).where(Order.photos.is_not(None))
		)
		
		prefix = f"{settings.media_url.rstrip('/')}/"
		referenced: set[Path] = set()
		
		for photos in rows.scalars():
			for url in photos or ():
				if not isinstance(url, str):
					continue
				
				# Отбрасываем query/fragment, если URL когда-нибудь начнут кэшировать
				clean_url = url.split("?", 1)[0].split("#", 1)[0]
				if not clean_url.startswith(prefix):
					continue
				
				relative = clean_url[len(prefix):]
				candidate = (media_root / relative).resolve()
				if candidate == media_root or media_root in candidate.parents:
					referenced.add(candidate)
		
		return referenced
