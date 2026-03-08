from geoalchemy2 import Geography
from sqlalchemy import select, and_, or_, Row, RowMapping
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_DWithin, ST_Point, ST_SetSRID
from geoalchemy2.elements import WKTElement

from .models import Order, OrderProposal, OrderStatus
from .schemas import OrderCreate, OrderUpdate, OrderProposalCreate, OrderProposalUpdate, OrderFilters
from typing import Optional, Sequence


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
			await session.commit()
			await session.refresh(order)
			return order
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при создании заказа")
	
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
		
		# Исключить собственные заказы
		stmt = stmt.where(Order.customer_id != executor_id)
		
		# Исключить заказы, к которым уже есть предложение от этого исполнителя
		subquery = select(OrderProposal.order_id).where(
			OrderProposal.executor_id == executor_id
		)
		stmt = stmt.where(Order.id.not_in(subquery))
		
		# Гео-фильтрация (если указаны координаты и радиус)
		if filters.user_lat and filters.user_lon and filters.radius_km:
			# Создаем точку с правильным SRID 4326
			user_point = ST_SetSRID(ST_Point(filters.user_lon, filters.user_lat), 4326)
			
			# Конвертируем geometry в geography для работы в метрах
			# И используем радиус в метрах (km * 1000)
			stmt = stmt.where(
				ST_DWithin(
					Order.location.cast(Geography),  # Конвертируем в geography
					user_point.cast(Geography),  # Конвертируем в geography
					filters.radius_km * 1000,  # Радиус в метрах
				)
			)
		
		# Фильтрация по цене
		if filters.min_price:
			stmt = stmt.where(
				or_(
					Order.min_price >= filters.min_price,
					Order.min_price.is_(None)
				)
			)
		if filters.max_price:
			stmt = stmt.where(
				or_(
					Order.min_price <= filters.max_price,
					Order.min_price.is_(None)
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
			raise ValueError("Заказ не найден")
		
		# Проверяем, что пользователь является владельцем заказа или админом
		if order.customer_id != customer_id and not is_admin:
			raise ValueError("Недостаточно прав для редактирования заказа")
		
		# Проверяем, что заказ еще открыт
		if order.status != OrderStatus.OPEN:
			raise ValueError("Нельзя редактировать закрытый заказ")
		
		# Обновляем только переданные поля
		for field, value in update_data.items():
			if hasattr(order, field):
				setattr(order, field, value)
		
		try:
			await session.commit()
			await session.refresh(order)
			return order
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при обновлении заказа")
	
	@staticmethod
	async def close_order(session: AsyncSession, order_id: int, customer_id: int, is_admin: bool = False) -> Order:
		stmt = select(Order).where(Order.id == order_id)
		result = await session.execute(stmt)
		order = result.scalar_one_or_none()
		
		if not order:
			raise ValueError("Заказ не найден")
		
		# Проверяем, что пользователь является владельцем заказа или админом
		if order.customer_id != customer_id and not is_admin:
			raise ValueError("Недостаточно прав для закрытия заказа")
		
		# Проверяем, что заказ еще открыт
		if order.status != OrderStatus.OPEN:
			raise ValueError("Заказ уже закрыт")
		
		order.status = OrderStatus.CLOSED
		
		try:
			await session.commit()
			await session.refresh(order)
			return order
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при закрытии заказа")
	
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
			raise ValueError("Заказ не найден")
		
		# Проверяем права
		if order.customer_id != user_id and not is_admin:
			raise ValueError("Недостаточно прав для удаления заказа")
		
		await session.delete(order)
		await session.commit()


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
			raise ValueError("Заказ не найден")
		
		# Проверяем, что заказ открыт
		if order.status != OrderStatus.OPEN:
			raise ValueError("Нельзя отправить предложение к закрытому заказу")
		
		# Проверяем, что исполнитель не является владельцем заказа
		if order.customer_id == executor_id:
			raise ValueError("Нельзя отправить предложение к собственному заказу")
		
		# Проверяем, что исполнитель еще не отправлял предложение к этому заказу
		existing_proposal_stmt = select(OrderProposal).where(
			and_(
				OrderProposal.order_id == order_id,
				OrderProposal.executor_id == executor_id
			)
		)
		existing_result = await session.execute(existing_proposal_stmt)
		if existing_result.scalar_one_or_none():
			raise ValueError("Вы уже отправили предложение к этому заказу")
		
		proposal = OrderProposal(
			proposed_price=proposal_data.proposed_price,
			message=proposal_data.message,
			order_id=order_id,
			executor_id=executor_id
		)
		
		session.add(proposal)
		try:
			await session.commit()
			await session.refresh(proposal)
			return proposal
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при создании предложения")
	
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
			raise ValueError("Заказ не найден")
		
		if order.customer_id != customer_id and not is_admin:
			raise ValueError("Недостаточно прав для просмотра предложений")
		
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
			raise ValueError("Предложение не найдено")
		
		# Проверяем, что пользователь является автором предложения или админом
		if proposal.executor_id != executor_id and not is_admin:
			raise ValueError("Недостаточно прав для редактирования предложения")
		
		# Проверяем, что заказ еще открыт
		if proposal.order.status != OrderStatus.OPEN:
			raise ValueError("Нельзя редактировать предложение к закрытому заказу")
		
		# Обновляем только переданные поля
		for field, value in update_data.items():
			if hasattr(proposal, field):
				setattr(proposal, field, value)
		
		try:
			await session.commit()
			await session.refresh(proposal)
			return proposal
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при обновлении предложения")
	
	@staticmethod
	async def delete_proposal(
			session: AsyncSession,
			proposal_id: int,
			user_id: int,
			is_admin: bool = False
	) -> None:
		stmt = select(OrderProposal).where(OrderProposal.id == proposal_id)
		result = await session.execute(stmt)
		proposal = result.scalar_one_or_none()
		
		if not proposal:
			raise ValueError("Предложение не найдено")
		
		# Проверяем права: либо автор предложения, либо администратор
		if proposal.executor_id != user_id and not is_admin:
			raise ValueError("Недостаточно прав для удаления предложения")
		
		await session.delete(proposal)
		await session.commit()
