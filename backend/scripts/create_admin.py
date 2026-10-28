#!/usr/bin/env python3
"""
Выдаёт права администратора.

Существующий пользователь находится по email; если его нет - создаётся новый.
Запускать из каталога backend:

    uv run python scripts/create_admin.py --email admin@example.com
    uv run python scripts/create_admin.py --email admin@example.com \
        --username admin --password 'StrongPass123'
"""
import argparse
import asyncio
import getpass
import sys
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select

# При запуске файлом sys.path содержит scripts/, а не backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.v1.users.models import User  # noqa: E402
from api.v1.users.schemas import UserCreate  # noqa: E402
from core.auth import get_password_hash  # noqa: E402
from core.database import db_helper  # noqa: E402


async def create_or_promote(email: str, username: str | None, password: str | None) -> str:
	async with db_helper.session_factory() as session:
		stmt = select(User).where(User.email == email)
		user = (await session.execute(stmt)).scalar_one_or_none()
		
		if user:
			user.is_admin = True
			user.is_active = True
			await session.commit()
			return f"Пользователь {email} назначен администратором"
		
		if not username:
			raise SystemExit("Для создания нового пользователя нужен --username")
		
		if not password:
			password = getpass.getpass("Пароль нового администратора: ")
		
		try:
			payload = UserCreate(email=email, username=username, password=password)
		except ValidationError as exc:
			raise SystemExit(f"Некорректные данные пользователя:\n{exc}")
		
		user = User(
			email=str(payload.email),
			username=payload.username,
			hashed_password=get_password_hash(payload.password),
			is_admin=True,
			is_active=True,
		)
		session.add(user)
		await session.commit()
		return f"Создан администратор {email} (id={user.id})"


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--email", required=True, help="email пользователя")
	parser.add_argument("--username", help="username (только для нового пользователя)")
	parser.add_argument("--password", help="пароль (только для нового пользователя)")
	return parser.parse_args()


async def async_main(args: argparse.Namespace) -> None:
	try:
		message = await create_or_promote(args.email, args.username, args.password)
	finally:
		await db_helper.dispose()
	print(message)


if __name__ == "__main__":
	asyncio.run(async_main(parse_args()))
