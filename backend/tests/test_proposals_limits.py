from datetime import datetime, timedelta

import pytest
from sqlalchemy import select, func

from api.v1.orders.models import Order, OrderProposal
from core.config import settings
from conftest import make_user, make_order, make_proposal, auth_headers


PROPOSAL_BODY = {"proposed_price": 5000.0, "message": "Готов выполнить работу"}

PROPOSALS_API = "/api/v1/orders/{order_id}/proposals"
DELETE_PROPOSAL_API = "/api/v1/orders/proposals/{proposal_id}"

# Дневной лимит откликов для исполнителя (берём из конфига)
DAILY_LIMIT = settings.max_chats_per_day


async def create_multiple_orders(db, customer, count: int) -> list[Order]:
    """Несколько заказов от одного заказчика — нужно, т.к. на один заказ можно отправить только один отклик."""
    orders = []
    for i in range(count):
        order = await make_order(
            db,
            customer_id=customer.id,
            title=f"Заказ #{i + 1}",
            lat=55.7558 + i * 0.001,
            lon=37.6173,
        )
        orders.append(order)
    return orders


@pytest.mark.asyncio
async def test_executor_can_create_proposals_up_to_limit(
    client, db, customer, exec_headers, current_user_override
):
    """Исполнитель может свободно создать отклики в пределах дневного лимита."""
    orders = await create_multiple_orders(db, customer, DAILY_LIMIT)

    for i, order in enumerate(orders):
        resp = await client.post(
            PROPOSALS_API.format(order_id=order.id),
            json=PROPOSAL_BODY,
            headers=exec_headers,
        )
        assert resp.status_code in (200, 201), (
            f"Предложение #{i + 1} должно создаться, "
            f"получено {resp.status_code}: {resp.text}"
        )

    stmt = select(func.count(OrderProposal.id))
    total = (await db.execute(stmt)).scalar()
    assert total == DAILY_LIMIT


@pytest.mark.asyncio
async def test_executor_cannot_exceed_daily_limit(
    client, db, customer, exec_headers, current_user_override
):
    """Отклик сверх дневного лимита должен быть отклонён."""
    orders = await create_multiple_orders(db, customer, DAILY_LIMIT + 1)

    for i in range(DAILY_LIMIT):
        resp = await client.post(
            PROPOSALS_API.format(order_id=orders[i].id),
            json=PROPOSAL_BODY,
            headers=exec_headers,
        )
        assert resp.status_code in (200, 201), resp.text

    resp = await client.post(
        PROPOSALS_API.format(order_id=orders[DAILY_LIMIT].id),
        json=PROPOSAL_BODY,
        headers=exec_headers,
    )
    assert resp.status_code in (400, 403, 429), (
        f"Отклик сверх лимита должен быть заблокирован, "
        f"получено {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_deleting_today_proposal_frees_limit(
    client, db, customer, exec_headers, current_user_override
):
    """Удаление свежего отклика освобождает слот в лимите."""
    orders = await create_multiple_orders(db, customer, DAILY_LIMIT + 1)
    proposal_ids: list[int] = []

    for i in range(DAILY_LIMIT):
        resp = await client.post(
            PROPOSALS_API.format(order_id=orders[i].id),
            json=PROPOSAL_BODY,
            headers=exec_headers,
        )
        assert resp.status_code in (200, 201), resp.text
        proposal_ids.append(resp.json()["id"])

    # Отменяем первый отклик
    del_resp = await client.delete(
        DELETE_PROPOSAL_API.format(proposal_id=proposal_ids[0]),
        headers=exec_headers,
    )
    assert del_resp.status_code in (200, 204), del_resp.text

    # Должен появиться свободный слот
    resp = await client.post(
        PROPOSALS_API.format(order_id=orders[DAILY_LIMIT].id),
        json=PROPOSAL_BODY,
        headers=exec_headers,
    )
    assert resp.status_code in (200, 201), (
        f"После удаления свежего отклика слот должен освободиться. "
        f"Получено {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_old_proposals_dont_affect_daily_limit(
    client, db, customer, executor, exec_headers, current_user_override
):
    """
    Скользящее окно: старые отклики (старше 24ч) не учитываются в лимите,
    и их удаление ничего не меняет.
    """
    # 1 старый + лимит свежих + 1 для финальной проверки
    orders = await create_multiple_orders(db, customer, DAILY_LIMIT + 2)

    # Старый отклик — вне окна 24ч, в лимит не попадает
    yesterday = datetime.now() - timedelta(hours=25)
    old_proposal = await make_proposal(
        db,
        order_id=orders[0].id,
        executor_id=executor.id,
        created_at=yesterday,
    )

    # Свежие отклики должны пройти полностью
    for i in range(1, DAILY_LIMIT + 1):
        resp = await client.post(
            PROPOSALS_API.format(order_id=orders[i].id),
            json=PROPOSAL_BODY,
            headers=exec_headers,
        )
        assert resp.status_code in (200, 201), (
            f"Свежий отклик #{i} должен пройти. "
            f"Получено {resp.status_code}: {resp.text}"
        )

    # Удаляем старый — на лимит это не влияет
    del_resp = await client.delete(
        DELETE_PROPOSAL_API.format(proposal_id=old_proposal.id),
        headers=exec_headers,
    )
    assert del_resp.status_code in (200, 204), del_resp.text

    # Лимит забит свежими, новый отклик не пройдёт
    resp = await client.post(
        PROPOSALS_API.format(order_id=orders[DAILY_LIMIT + 1].id),
        json=PROPOSAL_BODY,
        headers=exec_headers,
    )
    assert resp.status_code in (400, 429), (
        f"Отклик сверх лимита должен быть отклонён. "
        f"Получено {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_customer_can_receive_unlimited_proposals(
    client, db, order, current_user_override
):
    """На заказчика лимит не распространяется — он может получать любое количество откликов."""
    # Берём заведомо больше лимита, чтобы проверить отсутствие ограничений
    executors_count = DAILY_LIMIT + 2

    for i in range(executors_count):
        user = await make_user(
            db, email=f"worker{i}@test.com", username=f"worker{i}"
        )
        current_user_override.switch_to(user)

        resp = await client.post(
            PROPOSALS_API.format(order_id=order.id),
            json=PROPOSAL_BODY,
            headers=auth_headers(user.id),
        )
        assert resp.status_code in (200, 201), (
            f"Исполнитель #{i + 1} должен смочь откликнуться. "
            f"Получено {resp.status_code}: {resp.text}"
        )

    stmt = select(func.count(OrderProposal.id)).where(
        OrderProposal.order_id == order.id
    )
    total = (await db.execute(stmt)).scalar()
    assert total == executors_count