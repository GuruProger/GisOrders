import pytest

from api.v1.users.services import UserService


@pytest.mark.asyncio
async def test_set_admin_promotes_user(db, customer):
	"""Сервис, которым пользуется CLI, выдаёт и снимает права админа."""
	promoted = await UserService.set_admin(db, customer.id, True)
	assert promoted.is_admin is True
	
	demoted = await UserService.set_admin(db, customer.id, False)
	assert demoted.is_admin is False


@pytest.mark.asyncio
async def test_set_admin_unknown_user_returns_404(db):
	from core.errors import NotFoundError
	
	with pytest.raises(NotFoundError):
		await UserService.set_admin(db, 999_999, True)
