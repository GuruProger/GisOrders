from datetime import datetime, timedelta
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from geoalchemy2.elements import WKTElement

from core.database import Base, db_helper
from core.config import settings
from core.auth import get_password_hash, create_access_token
from core.security import get_current_user

# Импортируем все модели, чтобы Base.metadata знал о них при create_all
from api.v1.users.models import User
from api.v1.orders.models import Order, OrderStatus, OrderProposal
from api.v1.chat.models import Chat, Message
from main import app

_db_url = str(settings.db_url)
TEST_DATABASE_URL = _db_url.rsplit("/", 1)[0] + "/gisorders_test"

# NullPool: каждое соединение создаётся заново, чтобы избежать "грязных" соединений между тестами
engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, echo=False)


@pytest_asyncio.fixture(scope="session")
async def setup_database():
    """Создаёт схему тестовой БД один раз на всю сессию."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        # drop_all на случай, если осталась старая схема от прошлых прогонов
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db(setup_database) -> AsyncGenerator[AsyncSession, None]:
    """
    Каждый тест работает в отдельной транзакции, которая откатывается в конце.
    Так данные не накапливаются между тестами, но FastAPI-эндпоинты видят те же
    объекты, что и сам тест - через переопределённые session_getter'ы.
    """
    connection = await engine.connect()
    transaction = await connection.begin()

    async def _override_session():
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()

    # В проекте сессия берётся двумя способами - переопределяем оба
    app.dependency_overrides[db_helper] = _override_session
    app.dependency_overrides[db_helper.session_getter] = _override_session

    session = AsyncSession(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        app.dependency_overrides.clear()
        await connection.close()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def current_user_override(executor: User):
    """
    Мок get_current_user: возвращает executor по умолчанию.
    Через switch_to можно подменить текущего пользователя прямо во время теста.
    """
    _current = executor

    async def _mock() -> User:
        return _current

    app.dependency_overrides[get_current_user] = _mock

    class Switcher:
        def switch_to(self, user: User):
            nonlocal _current
            _current = user

            async def _new_mock() -> User:
                return user

            app.dependency_overrides[get_current_user] = _new_mock

    yield Switcher()


async def make_user(
    db: AsyncSession,
    *,
    email: str,
    username: str,
    password: str = "test1234",
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=get_password_hash(password),
    )
    db.add(user)
    # flush вместо commit - чтобы не ломать внешнюю транзакцию теста
    await db.flush()
    await db.refresh(user)
    return user


async def make_order(
    db: AsyncSession,
    *,
    customer_id: int,
    title: str = "Спилить берёзу",
    lat: float = 55.7558,
    lon: float = 37.6173,
    status: OrderStatus = OrderStatus.OPEN,
) -> Order:
    order = Order(
        title=title,
        description="Тестовое описание",
        status=status,
        min_price=1000.0,
        max_price=5000.0,
        deadline=datetime.now() + timedelta(days=7),
        # PostGIS: порядок координат POINT(lon lat)
        location=WKTElement(f"POINT({lon} {lat})", srid=4326),
        address="Москва, тестовый адрес",
        tree_type="Берёза",
        tree_height=12.0,
        tree_diameter=35.0,
        customer_id=customer_id,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


async def make_proposal(
    db: AsyncSession,
    *,
    order_id: int,
    executor_id: int,
    price: float = 5000.0,
    message: str = "Готов выполнить",
    created_at: datetime | None = None,
) -> OrderProposal:
    proposal = OrderProposal(
        proposed_price=price,
        message=message,
        order_id=order_id,
        executor_id=executor_id,
    )
    # Позволяет создавать "старые" отклики для тестов лимитов
    if created_at is not None:
        proposal.created_at = created_at

    db.add(proposal)
    await db.flush()
    await db.refresh(proposal)
    return proposal


def auth_headers(user_id: int) -> dict[str, str]:
    token = create_access_token(data={"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def customer(db: AsyncSession) -> User:
    return await make_user(db, email="cust@test.com", username="customer")


@pytest_asyncio.fixture
async def executor(db: AsyncSession) -> User:
    return await make_user(db, email="exec@test.com", username="executor")


@pytest_asyncio.fixture
async def order(db: AsyncSession, customer: User) -> Order:
    return await make_order(db, customer_id=customer.id)


@pytest_asyncio.fixture
def cust_headers(customer: User) -> dict[str, str]:
    return auth_headers(customer.id)


@pytest_asyncio.fixture
def exec_headers(executor: User) -> dict[str, str]:
    return auth_headers(executor.id)