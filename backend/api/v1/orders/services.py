import logging
from geoalchemy2 import Geography
from sqlalchemy import select, and_, or_, func, update, text
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_DWithin, ST_Point, ST_SetSRID
from geoalchemy2.elements import WKTElement
from core.config import settings
from core.errors import (
	NotFoundError, ForbiddenError, ConflictError,
	BusinessRuleError, ProposalLimitError
)
from core.time import utcnow
from .models import Order, OrderProposal, OrderStatus, ProposalStatus
from .schemas import OrderCreate, OrderUpdate, OrderProposalCreate, OrderProposalUpdate, OrderFilters
from typing import Optional, Sequence
from datetime import timedelta

logger = logging.getLogger(__name__)


class OrderService:
	@staticmethod
	async def create_order(session: AsyncSession, order_data: OrderCreate, customer_id: int) -> Order:
		# Создаем гео-объект из координат
		location = WKTElement(f'POINT({order_data.lon} {order_data.lat})', srid=4326)
		
		order = Order(
			title=order_data.title,
			description=order_data.description,
			min_price=order_data.min_price,
			max_price=order_data.max_price,
			deadline=order_data.deadline,
			location=location,
			address=order_data.address,
			tree_type=order_data.tree_type,
			tree_height=order_data.tree_height,
			tree_diameter=order_data.tree_diameter,
			photos=order_data.photos,
			customer_id=customer_id,
			status=OrderStatus.OPEN
		)
		session.add(order)
		
		try:
			await session.flush()
			await session.refresh(order)
			return order
		except IntegrityError as e:
			logger.error("IntegrityError in create_order", exc_info=e)
			raise ConflictError(
				"Не удалось создать заказ",
				code="order_creation_failed",
				resource="order",
			)
	
	@staticmethod
	async def get_orders_by_customer(
			session: AsyncSession,
			customer_id: int,
			status: Optional[OrderStatus] = None
	) -> Sequence[Order]:
		stmt = select(Order).where(Order.customer_id == customer_id)
		if status:
			stmt = stmt.where(Order.status == status)
		stmt = stmt.order_by(Order.created_at.desc())
		result = await session.execute(stmt)
		return result.scalars().all()
	
	@staticmethod
	async def get_available_orders(
			session: AsyncSession,
			executor_id: int,
			filters: OrderFilters
	) -> Sequence[Order]:
		# Базовый запрос - только OPEN заказы
		stmt = select(Order).where(Order.status == OrderStatus.OPEN)
		
		# Исключаем заказы, у которых дедлайн уже прошел
		stmt = stmt.where(Order.deadline >= utcnow())
		
		# Исключить собственные заказы
		stmt = stmt.where(Order.customer_id != executor_id)
		
		# Исключить заказы, к которым уже есть предложение от этого исполнителя
		subquery = select(OrderProposal.order_id).where(
			OrderProposal.executor_id == executor_id
		)
		stmt = stmt.where(Order.id.not_in(subquery))
		
		# Гео-фильтрация: координаты обязательны, поэтому фильтр применяется всегда
		user_point = ST_SetSRID(ST_Point(filters.user_lon, filters.user_lat), 4326)
		# Конвертируем geometry в geography для работы в метрах
		# И используем радиус в метрах (km * 1000)
		stmt = stmt.where(
			ST_DWithin(
				Order.location.cast(Geography),
				user_point.cast(Geography),
				filters.radius_km * 1000,
			)
		)
		
		# Фильтрация по цене: сравниваем нижнюю границу бюджета заказа с min_price,
		# а верхнюю - с max_price. NULL означает отсутствие ограничения.
		if filters.min_price is not None:
			stmt = stmt.where(
				or_(
					Order.min_price >= filters.min_price,
					Order.min_price.is_(None)
				)
			)
		if filters.max_price is not None:
			stmt = stmt.where(
				or_(
					Order.max_price <= filters.max_price,
					Order.max_price.is_(None)
				)
			)
		
		# Фильтрация по типу дерева
		if filters.tree_type:
			stmt = stmt.where(Order.tree_type.ilike(f"%{filters.tree_type}%"))
		
		# Фильтрация по высоте дерева
		if filters.max_height:
			stmt = stmt.where(Order.tree_height <= filters.max_height)
		
		# Сортировка
		if filters.sort_by == "deadline":
			order_by = Order.deadline
		elif filters.sort_by == "min_price":
			order_by = Order.min_price
		else:
			order_by = Order.created_at
		
		if filters.sort_order == "asc":
			stmt = stmt.order_by(order_by.asc())
		else:
			stmt = stmt.order_by(order_by.desc())
		
		# Пагинация
		stmt = stmt.offset((filters.page - 1) * filters.per_page)
		stmt = stmt.limit(filters.per_page)
		
		result = await session.execute(stmt)
		orders = result.scalars().all()
		return orders
	
	@staticmethod
	async def get_order_by_id(session: AsyncSession, order_id: int) -> Optional[Order]:
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def update_order(
			session: AsyncSession,
			order_id: int,
			update_data: dict,
			customer_id: int,
			is_admin: bool = False
	) -> Order:
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что пользователь является владельцем заказа или админом
		if order.customer_id != customer_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для редактирования заказа",
				code="order_access_denied",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что заказ еще открыт
		if order.status != OrderStatus.OPEN:
			raise ConflictError(
				"Нельзя редактировать заказ после выбора исполнителя или закрытия",
				code="order_not_open",
				resource="order",
				resource_id=order_id,
			)
		
		# Обновляем только переданные поля
		lat = update_data.pop("lat", None)
		lon = update_data.pop("lon", None)
		if lat is not None and lon is not None:
			order.location = WKTElement(f'POINT({lon} {lat})', srid=4326)
		
		for field, value in update_data.items():
			if hasattr(order, field):
				setattr(order, field, value)
		
		try:
			await session.flush()
			await session.refresh(order)
			return order
		except IntegrityError as e:
			logger.error("IntegrityError in update_order", exc_info=e)
			raise ConflictError(
				"Не удалось обновить заказ",
				code="order_update_failed",
				resource="order",
				resource_id=order_id,
			)
	
	@staticmethod
	async def close_order(session: AsyncSession, order_id: int, customer_id: int, is_admin: bool = False) -> Order:
		stmt = select(Order).where(Order.id == order_id).with_for_update()
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что пользователь является владельцем заказа или админом
		if order.customer_id != customer_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для закрытия заказа",
				code="order_access_denied",
				resource="order",
				resource_id=order_id,
			)
		
		if order.status == OrderStatus.CLOSED:
			raise ConflictError(
				"Заказ уже закрыт",
				code="order_already_closed",
				resource="order",
				resource_id=order_id,
			)
		
		order.status = OrderStatus.CLOSED
		order.closed_at = utcnow()
		
		# Закрываем все чаты заказа и отклоняем отклики, по которым не было решения
		await OrderService._close_order_chats(session, order_id)
		await OrderService._reject_pending_proposals(session, order_id)
		
		try:
			await session.flush()
			await session.refresh(order)
			return order
		except IntegrityError as e:
			logger.error("IntegrityError in close_order", exc_info=e)
			raise ConflictError(
				"Не удалось закрыть заказ",
				code="order_close_failed",
				resource="order",
				resource_id=order_id,
			)
	
	@staticmethod
	async def _close_order_chats(session: AsyncSession, order_id: int) -> None:
		from ..chat.models import Chat
		
		await session.execute(
			update(Chat)
			.where(and_(Chat.order_id == order_id, Chat.is_active.is_(True)))
			.values(is_active=False)
		)
	
	@staticmethod
	async def _reject_pending_proposals(session: AsyncSession, order_id: int) -> None:
		await session.execute(
			update(OrderProposal)
			.where(
				and_(
					OrderProposal.order_id == order_id,
					OrderProposal.status == ProposalStatus.PENDING,
				)
			)
			.values(status=ProposalStatus.REJECTED)
		)
	
	@staticmethod
	async def accept_proposal(
			session: AsyncSession,
			order_id: int,
			proposal_id: int,
			customer_id: int,
			is_admin: bool = False,
	) -> OrderProposal:
		"""
		Заказчик выбирает исполнителя.
		
		Заказ блокируется на время транзакции, чтобы два одновременных accept
		не выбрали двух исполнителей. Принятый отклик фиксируется в заказе,
		остальные отклики отклоняются, их чаты закрываются.
		"""
		from ..chat.models import Chat
		
		stmt = select(Order).where(Order.id == order_id).with_for_update()
		order = (await session.execute(stmt)).scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		if order.customer_id != customer_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для выбора исполнителя",
				code="order_access_denied",
				resource="order",
				resource_id=order_id,
			)
		
		if order.status != OrderStatus.OPEN:
			raise ConflictError(
				"Исполнитель уже выбран или заказ закрыт",
				code="order_not_open",
				resource="order",
				resource_id=order_id,
			)
		
		proposal_stmt = select(OrderProposal).where(
			and_(
				OrderProposal.id == proposal_id,
				OrderProposal.order_id == order_id,
			)
		)
		proposal = (await session.execute(proposal_stmt)).scalar_one_or_none()
		
		if not proposal:
			raise NotFoundError(
				"Предложение не найдено",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		if proposal.status != ProposalStatus.PENDING:
			raise ConflictError(
				"По этому предложению уже принято решение",
				code="proposal_not_pending",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		order.accepted_proposal_id = proposal.id
		order.status = OrderStatus.ASSIGNED
		proposal.status = ProposalStatus.ACCEPTED
		
		await session.execute(
			update(OrderProposal)
			.where(
				and_(
					OrderProposal.order_id == order_id,
					OrderProposal.id != proposal.id,
					OrderProposal.status == ProposalStatus.PENDING,
				)
			)
			.values(status=ProposalStatus.REJECTED)
		)
		
		# Чат выбранного исполнителя остаётся открытым, остальные закрываются
		await session.execute(
			update(Chat)
			.where(
				and_(
					Chat.order_id == order_id,
					(Chat.proposal_id.is_(None)) | (Chat.proposal_id != proposal.id),
					Chat.is_active.is_(True),
				)
			)
			.values(is_active=False)
		)
		
		try:
			await session.flush()
			await session.refresh(proposal)
			return proposal
		except IntegrityError as e:
			logger.error("IntegrityError in accept_proposal", exc_info=e)
			raise ConflictError(
				"Не удалось выбрать исполнителя",
				code="proposal_accept_failed",
				resource="proposal",
				resource_id=proposal_id,
			)
	
	@staticmethod
	async def delete_order(
			session: AsyncSession,
			order_id: int,
			user_id: int,
			is_admin: bool = False
	) -> None:
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем права
		if order.customer_id != user_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для удаления заказа",
				code="order_access_denied",
				resource="order",
				resource_id=order_id,
			)
		
		# Заказ с выбранным исполнителем нельзя удалить: сначала его нужно закрыть
		if order.status == OrderStatus.ASSIGNED:
			raise ConflictError(
				"Нельзя удалить заказ, пока исполнитель выбран. Сначала закройте заказ",
				code="order_assigned",
				resource="order",
				resource_id=order_id,
			)
		
		await session.delete(order)
		await session.flush()


class OrderProposalService:
	@staticmethod
	async def create_proposal(
			session: AsyncSession,
			proposal_data: OrderProposalCreate,
			order_id: int,
			executor_id: int
	) -> OrderProposal:
		# Проверяем существование заказа
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что заказ открыт
		if order.status != OrderStatus.OPEN:
			raise ConflictError(
				"Нельзя отправить предложение к закрытому заказу",
				code="order_closed",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что исполнитель не является владельцем заказа
		if order.customer_id == executor_id:
			raise BusinessRuleError(
				"Нельзя отправить предложение к собственному заказу",
				code="own_order_proposal",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем, что исполнитель еще не отправлял предложение к этому заказу
		existing_proposal_stmt = select(OrderProposal).where(
			and_(
				OrderProposal.order_id == order_id,
				OrderProposal.executor_id == executor_id
			)
		)
		existing_result = await session.execute(existing_proposal_stmt)
		if existing_result.scalar_one_or_none():
			raise ConflictError(
				"Вы уже отправили предложение к этому заказу",
				code="proposal_already_exists",
				resource="order",
				resource_id=order_id,
			)
		
		# Проверяем лимит откликов за день.
		# Advisory lock сериализует создание откликов одним исполнителем:
		# без него параллельные запросы проходят проверку COUNT одновременно.
		await session.execute(
			text("SELECT pg_advisory_xact_lock(:executor_id)"),
			{"executor_id": executor_id},
		)
		
		day_ago = utcnow() - timedelta(days=1)
		daily_count_stmt = select(func.count(OrderProposal.id)).where(
			and_(
				OrderProposal.executor_id == executor_id,
				OrderProposal.created_at >= day_ago
			)
		)
		daily_count_result = await session.execute(daily_count_stmt)
		daily_count = daily_count_result.scalar()
		
		if daily_count >= settings.max_proposals_per_day:
			raise ProposalLimitError(
				f"Превышен лимит откликов за день. Максимум {settings.max_proposals_per_day} откликов в сутки",
				code="daily_proposal_limit",
				resource="proposal",
			)
		
		# Создаем отклик
		proposal = OrderProposal(
			proposed_price=proposal_data.proposed_price,
			message=proposal_data.message,
			order_id=order_id,
			executor_id=executor_id
		)
		session.add(proposal)
		await session.flush()
		
		# Создаем чат между заказчиком и исполнителем
		from ..chat.models import Chat, Message
		chat = Chat(
			order_id=order_id,
			customer_id=order.customer_id,
			executor_id=executor_id,
			proposal_id=proposal.id,
			is_active=True
		)
		session.add(chat)
		await session.flush()
		
		# Если есть сообщение в предложении, добавляем его как первое сообщение в чат
		if proposal_data.message:
			first_message = Message(
				text=proposal_data.message,
				chat_id=chat.id,
				sender_id=executor_id,
				is_read=False
			)
			session.add(first_message)
		
		try:
			await session.flush()
			await session.refresh(proposal)
			return proposal
		except IntegrityError as e:
			logger.error("IntegrityError in create_proposal", exc_info=e)
			raise ConflictError(
				"Не удалось создать предложение",
				code="proposal_creation_failed",
				resource="proposal",
			)
	
	@staticmethod
	async def get_proposals_by_order(
			session: AsyncSession,
			order_id: int,
			customer_id: int,
			is_admin: bool = False
	) -> Sequence[OrderProposal]:
		# Сначала проверяем, что заказ существует и пользователь - его владелец или админ
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise NotFoundError(
				"Заказ не найден",
				resource="order",
				resource_id=order_id,
			)
		
		if order.customer_id != customer_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для просмотра предложений",
				code="order_access_denied",
				resource="order",
				resource_id=order_id,
			)
		
		# Получаем предложения к заказу
		stmt = select(OrderProposal).where(OrderProposal.order_id == order_id)
		stmt = stmt.order_by(OrderProposal.created_at.desc())
		result = await session.execute(stmt)
		return result.scalars().all()
	
	@staticmethod
	async def get_proposals_by_executor(
			session: AsyncSession,
			executor_id: int
	) -> Sequence[OrderProposal]:
		stmt = (
			select(OrderProposal)
			.where(OrderProposal.executor_id == executor_id)
			.options(selectinload(OrderProposal.order))
			.order_by(OrderProposal.created_at.desc())
		)
		result = await session.execute(stmt)
		return result.scalars().all()
	
	@staticmethod
	async def get_proposal_by_id(session: AsyncSession, proposal_id: int) -> Optional[OrderProposal]:
		stmt = (
			select(OrderProposal)
			.where(OrderProposal.id == proposal_id)
			.options(selectinload(OrderProposal.order))
		)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def update_proposal(
			session: AsyncSession,
			proposal_id: int,
			update_data: dict,
			executor_id: int,
			is_admin: bool = False
	) -> OrderProposal:
		stmt = select(OrderProposal).where(OrderProposal.id == proposal_id).options(selectinload(OrderProposal.order))
		result = await session.execute(stmt)
		proposal = result.scalar_one_or_none()
		
		if not proposal:
			raise NotFoundError(
				"Предложение не найдено",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		# Проверяем, что пользователь является автором предложения или админом
		if proposal.executor_id != executor_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для редактирования предложения",
				code="proposal_access_denied",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		# Проверяем, что заказ еще открыт
		if proposal.order.status != OrderStatus.OPEN:
			raise ConflictError(
				"Нельзя редактировать предложение к закрытому заказу",
				code="order_closed",
				resource="order",
				resource_id=proposal.order_id,
			)
		
		if proposal.status != ProposalStatus.PENDING:
			raise ConflictError(
				"Нельзя редактировать предложение после решения по нему",
				code="proposal_not_pending",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		# Обновляем только переданные поля
		for field, value in update_data.items():
			if hasattr(proposal, field):
				setattr(proposal, field, value)
		
		try:
			await session.flush()
			await session.refresh(proposal)
			return proposal
		except IntegrityError as e:
			logger.error("IntegrityError in update_proposal", exc_info=e)
			raise ConflictError(
				"Не удалось обновить предложение",
				code="proposal_update_failed",
				resource="proposal",
				resource_id=proposal_id,
			)
	
	@staticmethod
	async def delete_proposal(
			session: AsyncSession,
			proposal_id: int,
			user_id: int,
			is_admin: bool = False
	) -> None:
		# Добавляем selectinload для связи chat, чтобы не делать лишний запрос
		stmt = select(OrderProposal).where(OrderProposal.id == proposal_id).options(
			selectinload(OrderProposal.chat)
		)
		result = await session.execute(stmt)
		proposal = result.scalar_one_or_none()
		
		if not proposal:
			raise NotFoundError(
				"Предложение не найдено",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		# Проверяем права: либо автор предложения, либо администратор
		if proposal.executor_id != user_id and not is_admin:
			raise ForbiddenError(
				"Недостаточно прав для удаления предложения",
				code="proposal_access_denied",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		if proposal.status != ProposalStatus.PENDING:
			raise ConflictError(
				"Нельзя отозвать предложение после решения по нему",
				code="proposal_not_pending",
				resource="proposal",
				resource_id=proposal_id,
			)
		
		# Закрываем связанный чат, если он существует и активен
		if proposal.chat and proposal.chat.is_active:
			proposal.chat.is_active = False
		
		await session.delete(proposal)
		await session.flush()
