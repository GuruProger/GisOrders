import asyncio
import uuid

import pytest
from conftest import engine, make_order, make_proposal, make_user
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from api.v1.orders.models import Order, OrderProposal, OrderStatus, ProposalStatus
from api.v1.orders.schemas import OrderProposalCreate
from api.v1.orders.services import OrderProposalService, OrderService
from api.v1.users.models import User
from core.config import settings
from core.errors import ConflictError, ProposalLimitError

Session = async_sessionmaker(engine, expire_on_commit=False)


async def _cleanup(user_ids: list[int]) -> None:
	async with Session() as session:
		await session.execute(delete(User).where(User.id.in_(user_ids)))
		await session.commit()


@pytest.mark.asyncio
async def test_parallel_proposals_cannot_exceed_daily_limit(setup_database):
	"""Параллельные отклики одного исполнителя сериализуются advisory-lock'ом."""
	limit = settings.max_proposals_per_day
	suffix = uuid.uuid4().hex

	async with Session() as session:
		customer = await make_user(
			session,
			email=f"conc-customer-{suffix}@test.com",
			username=f"conc-customer-{suffix}",
		)
		executor = await make_user(
			session,
			email=f"conc-executor-{suffix}@test.com",
			username=f"conc-executor-{suffix}",
		)
		orders = [
			await make_order(
				session,
				customer_id=customer.id,
				title=f"Concurrency order {index}",
				lat=55.7558 + index * 0.001,
			)
			for index in range(limit + 3)
		]
		await session.commit()
		customer_id = customer.id
		executor_id = executor.id
		order_ids = [order.id for order in orders]

	async def create(order_id: int) -> str:
		async with Session() as session:
			try:
				await OrderProposalService.create_proposal(
					session,
					OrderProposalCreate(
						proposed_price=5000.0,
						message="Готов выполнить",
					),
					order_id,
					executor_id,
				)
				await session.commit()
				return "created"
			except ProposalLimitError:
				await session.rollback()
				return "limited"

	try:
		results = await asyncio.gather(*(create(order_id) for order_id in order_ids))

		assert results.count("created") == limit, results
		assert results.count("limited") == len(order_ids) - limit, results

		async with Session() as session:
			total = (
				await session.execute(
					select(OrderProposal).where(
						OrderProposal.executor_id == executor_id
					)
				)
			).scalars().all()
			assert len(total) == limit
	finally:
		await _cleanup([customer_id, executor_id])


@pytest.mark.asyncio
async def test_parallel_accepts_choose_exactly_one_executor(setup_database):
	"""Два одновременных accept не могут назначить двух исполнителей."""
	suffix = uuid.uuid4().hex
	async with Session() as session:
		customer = await make_user(
			session,
			email=f"accept-customer-{suffix}@test.com",
			username=f"accept-customer-{suffix}",
		)
		executors = [
			await make_user(
				session,
				email=f"accept-executor{index}-{suffix}@test.com",
				username=f"accept-executor{index}-{suffix}",
			)
			for index in range(2)
		]
		order = await make_order(session, customer_id=customer.id)
		proposals = [
			await make_proposal(
				session,
				order_id=order.id,
				executor_id=executor.id,
			)
			for executor in executors
		]
		await session.commit()
		customer_id = customer.id
		order_id = order.id
		proposal_ids = [proposal.id for proposal in proposals]

	async def accept(proposal_id: int) -> str:
		async with Session() as session:
			try:
				await OrderService.accept_proposal(
					session,
					order_id,
					proposal_id,
					customer_id,
				)
				await session.commit()
				return "accepted"
			except ConflictError as exc:
				await session.rollback()
				return exc.code

	try:
		results = await asyncio.gather(
			accept(proposal_ids[0]),
			accept(proposal_ids[1]),
		)

		assert sorted(results) == ["accepted", "order_not_open"], results

		async with Session() as session:
			stored_order = (
				await session.execute(select(Order).where(Order.id == order_id))
			).scalar_one()
			stored_proposals = (
				await session.execute(
					select(OrderProposal).where(OrderProposal.order_id == order_id)
				)
			).scalars().all()

			assert stored_order.status == OrderStatus.ASSIGNED
			assert sum(
				proposal.status == ProposalStatus.ACCEPTED
				for proposal in stored_proposals
			) == 1
			assert sum(
				proposal.status == ProposalStatus.REJECTED
				for proposal in stored_proposals
			) == 1
	finally:
		await _cleanup([customer_id, *(executor.id for executor in executors)])
