import io

import pytest
from PIL import Image

from core.config import settings

UPLOAD_API = "/api/v1/uploads/images"
MEDIA_API = "/media"


def make_image(
		fmt: str = "PNG",
		size: tuple[int, int] = (800, 600),
		color: tuple[int, int, int] = (200, 30, 30),
) -> bytes:
	buffer = io.BytesIO()
	Image.new("RGB", size, color).save(buffer, format=fmt)
	return buffer.getvalue()


@pytest.fixture
def media_root(tmp_path, monkeypatch):
	"""Изолирует файлы теста: загрузки пишутся во временный каталог."""
	monkeypatch.setattr(settings, "media_root", tmp_path)
	return tmp_path


async def upload(client, payload: bytes, filename: str = "photo.png", headers=None):
	return await client.post(
		UPLOAD_API,
		files={"file": (filename, payload, "image/png")},
		headers=headers or {},
	)


@pytest.mark.asyncio
async def test_upload_converts_image_to_webp(
		client, media_root, customer, current_user_override
):
	"""Валидное изображение сохраняется как WebP, ответ содержит URL и размеры."""
	from conftest import auth_headers

	current_user_override.switch_to(customer)

	resp = await upload(client, make_image(), headers=auth_headers(customer.id))

	assert resp.status_code == 200, resp.text
	body = resp.json()
	assert body["url"].startswith(f"{MEDIA_API}/images/")
	assert body["url"].endswith(".webp")
	assert body["width"] == 800
	assert body["height"] == 600

	stored = media_root / body["url"].removeprefix(f"{MEDIA_API}/")
	assert stored.is_file(), "Файл должен быть записан в MEDIA_ROOT"

	with Image.open(stored) as image:
		assert image.format == "WEBP"
		assert image.size == (800, 600)


@pytest.mark.asyncio
async def test_upload_resizes_large_image(
		client, media_root, customer, current_user_override
):
	"""Сторона больше 1920 px уменьшается с сохранением пропорций."""
	from conftest import auth_headers

	current_user_override.switch_to(customer)

	resp = await upload(
		client,
		make_image(size=(3000, 1500)),
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 200, resp.text
	body = resp.json()
	assert max(body["width"], body["height"]) == settings.max_image_dimension
	assert (body["width"], body["height"]) == (1920, 960)


@pytest.mark.asyncio
async def test_upload_rejects_non_image(
		client, media_root, customer, current_user_override
):
	"""Файл, который не декодируется как изображение, отклоняется."""
	from conftest import auth_headers

	current_user_override.switch_to(customer)

	resp = await upload(
		client,
		b"this is definitely not an image",
		filename="fake.png",
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 400, resp.text
	assert resp.json()["error_code"] == "invalid_image"
	assert not (media_root / "images").exists() or not any(
		(media_root / "images").iterdir()
	)


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_format(
		client, media_root, customer, current_user_override
):
	"""GIF и прочие форматы не принимаются, даже если Pillow их понимает."""
	from conftest import auth_headers

	current_user_override.switch_to(customer)

	resp = await upload(
		client,
		make_image(fmt="GIF"),
		filename="animation.gif",
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 400, resp.text
	assert resp.json()["error_code"] == "invalid_image"


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(
		client, media_root, customer, current_user_override, monkeypatch
):
	"""Файл больше MEDIA_MAX_UPLOAD_SIZE_MB не читается целиком в память."""
	from conftest import auth_headers

	monkeypatch.setattr(settings, "max_upload_size_mb", 1)
	current_user_override.switch_to(customer)

	resp = await upload(
		client,
		b"\x00" * (2 * 1024 * 1024),
		filename="huge.png",
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 413, resp.text
	assert resp.json()["error_code"] == "file_too_large"


@pytest.mark.asyncio
async def test_upload_requires_authentication(client, media_root):
	resp = await upload(client, make_image())

	assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_uploaded_image_is_served_from_media(client, customer, current_user_override):
	"""Смонтированный /media отдаёт сохранённый файл."""
	from conftest import auth_headers

	current_user_override.switch_to(customer)
	resp = await upload(client, make_image(), headers=auth_headers(customer.id))
	assert resp.status_code == 200, resp.text
	url = resp.json()["url"]

	served = await client.get(url)

	assert served.status_code == 200, served.text
	assert served.headers["content-type"] == "image/webp"
	assert served.content[:4] == b"RIFF"

	# Убираем файл из рабочего MEDIA_ROOT, чтобы не мусорить между прогонами
	stored = settings.media_root / url.removeprefix(f"{MEDIA_API}/")
	stored.unlink(missing_ok=True)
