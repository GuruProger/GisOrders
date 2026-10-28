import os
import time
from datetime import timedelta

import pytest
from sqlalchemy import select

from api.v1.uploads.cleanup import MediaCleanupService
from api.v1.users.models import RefreshToken
from api.v1.users.services import RefreshTokenService
from core.config import settings
from core.time import utcnow

LOGIN_API = "/api/v1/users/login/json"


async def test_purge_expired_refresh_tokens_removes_only_expired(client, db, customer):
	login = await client.post(
		LOGIN_API,
		json={"email": customer.email, "password": "test1234"},
	)
	assert login.status_code == 200, login.text

	expired = RefreshToken(
		token_hash="a" * 64,
		user_id=customer.id,
		expires_at=utcnow() - timedelta(days=1),
	)
	revoked_but_valid = RefreshToken(
		token_hash="b" * 64,
		user_id=customer.id,
		expires_at=utcnow() + timedelta(days=1),
		revoked_at=utcnow(),
	)
	db.add_all([expired, revoked_but_valid])
	await db.flush()

	removed = await RefreshTokenService.purge_expired(db)

	assert removed == 1
	hashes = set(
		(await db.execute(select(RefreshToken.token_hash))).scalars().all()
	)
	assert "a" * 64 not in hashes
	assert "b" * 64 in hashes


@pytest.mark.asyncio
async def test_media_cleanup_deletes_only_old_orphans(db, tmp_path, customer, order):
	images = tmp_path / "images"
	images.mkdir()

	referenced = images / "referenced.webp"
	orphan = images / "orphan.webp"
	fresh_orphan = images / "fresh.webp"
	for path in (referenced, orphan, fresh_orphan):
		path.write_bytes(b"RIFF-test")

	order.photos = [f"{settings.media_url}/images/{referenced.name}"]
	await db.flush()

	now = time.time()
	old = now - 3 * 3600
	os.utime(referenced, (old, old))
	os.utime(orphan, (old, old))
	os.utime(fresh_orphan, (now, now))

	removed = await MediaCleanupService.cleanup_orphans(
		db,
		media_root=tmp_path,
		min_age_seconds=3600,
		now=now,
	)

	assert removed == [orphan]
	assert referenced.is_file()
	assert fresh_orphan.is_file()
	assert not orphan.exists()


@pytest.mark.asyncio
async def test_media_cleanup_dry_run_keeps_files(db, tmp_path, order):
	images = tmp_path / "images"
	images.mkdir()
	orphan = images / "orphan.webp"
	orphan.write_bytes(b"RIFF-test")

	old = time.time() - 3 * 3600
	os.utime(orphan, (old, old))

	removed = await MediaCleanupService.cleanup_orphans(
		db,
		media_root=tmp_path,
		min_age_seconds=3600,
		dry_run=True,
	)

	assert removed == [orphan]
	assert orphan.is_file()
