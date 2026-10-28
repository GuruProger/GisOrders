import io
import uuid

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from core.config import settings
from core.errors import BadRequestError, PayloadTooLargeError

# Форматы, которые принимаем на вход. Всё остальное - 400.
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
CHUNK_SIZE = 64 * 1024


class ImageUploadService:
	"""Сохраняет загруженные изображения в MEDIA_ROOT как WebP."""
	
	@staticmethod
	async def save(file: UploadFile) -> dict:
		data = await ImageUploadService._read_limited(file)
		return await run_in_threadpool(ImageUploadService._process_and_store, data)
	
	@staticmethod
	async def _read_limited(file: UploadFile) -> bytes:
		"""Читает файл кусками и обрывает загрузку при превышении лимита."""
		limit = settings.max_upload_size_mb * 1024 * 1024
		chunks: list[bytes] = []
		total = 0
		
		while chunk := await file.read(CHUNK_SIZE):
			total += len(chunk)
			if total > limit:
				raise PayloadTooLargeError(
					f"Файл больше {settings.max_upload_size_mb} МБ",
					code="file_too_large",
					field="file",
				)
			chunks.append(chunk)
		
		if total == 0:
			raise BadRequestError(
				"Файл пуст",
				code="empty_file",
				field="file",
			)
		
		return b"".join(chunks)
	
	@staticmethod
	def _process_and_store(data: bytes) -> dict:
		image = ImageUploadService._decode(data)
		
		try:
			image.thumbnail(
				(settings.max_image_dimension, settings.max_image_dimension),
				Image.Resampling.LANCZOS,
			)
			
			# WebP поддерживает прозрачность, поэтому RGBA сохраняем как есть
			if image.mode in ("RGBA", "LA") or (
					image.mode == "P" and "transparency" in image.info
			):
				image = image.convert("RGBA")
			else:
				image = image.convert("RGB")
			
			directory = settings.media_root / "images"
			directory.mkdir(parents=True, exist_ok=True)
			
			filename = f"{uuid.uuid4().hex}.webp"
			path = directory / filename
			width, height = image.size
			image.save(path, format="WEBP", quality=85, method=6)
		finally:
			image.close()
		
		return {
			"url": f"{settings.media_url}/images/{filename}",
			"width": width,
			"height": height,
			"size": path.stat().st_size,
			"content_type": "image/webp",
		}
	
	@staticmethod
	def _decode(data: bytes) -> Image.Image:
		"""Проверяет, что данные - поддерживаемое изображение, и отдаёт его."""
		try:
			with Image.open(io.BytesIO(data)) as probe:
				image_format = probe.format
				if image_format not in ALLOWED_FORMATS:
					raise BadRequestError(
						"Поддерживаются только JPEG, PNG и WebP",
						code="invalid_image",
						field="file",
					)
				# verify() ловит повреждённые файлы, но делает объект непригодным
				probe.verify()
			
			with Image.open(io.BytesIO(data)) as source:
				# Учитываем EXIF-ориентацию, иначе фото с телефона ляжет боком
				image = ImageOps.exif_transpose(source)
				image.load()
				return image
		except BadRequestError:
			raise
		except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
			raise BadRequestError(
				"Не удалось прочитать изображение",
				code="invalid_image",
				field="file",
			)
