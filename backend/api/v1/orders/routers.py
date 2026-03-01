from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from typing import Annotated, Optional

from core.database import db_helper
from core.security import get_current_user, get_current_active_user
from .models import Order, OrderProposal, OrderStatus
from .schemas import (
	OrderCreate, OrderResponse, OrderUpdate, OrderProposalCreate,
	OrderProposalResponse, OrderProposalUpdate, OrderFilters,
	OrderWithProposalsResponse, OrderProposalWithOrderResponse
)
from .services import OrderService, OrderProposalService
from ..users.models import User

router = APIRouter(prefix="/orders", tags=["orders"])


# Эндпоинты для заказов
@router.post(
	"/",
	response_model=OrderResponse,
	summary="Создание заказа",
	description="Создание нового заказа на услуги"
)
async def create_order(
		order_data: OrderCreate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		order = await OrderService.create_order(session, order_data, current_user.id)
		from geoalchemy2.shape import to_shape
		
		shape = to_shape(order.location)
		return order
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/my",
	response_model=list[OrderResponse],
	summary="Мои заказы",
	description="Получение списка заказов текущего пользователя"
)
async def get_my_orders(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
		order_status: Optional[OrderStatus] = Query(None, description="Фильтр по статусу заказа")
):
	try:
		orders = await OrderService.get_orders_by_customer(session, current_user.id, order_status)
		return orders
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/available",
	response_model=list[OrderResponse],
	summary="Доступные заказы",
	description="Получение списка заказов, доступных для отправки предложений"
)
async def get_available_orders(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
		radius_km: Optional[int] = Query(None, ge=1, le=50, description="Радиус поиска в км"),
		user_lat: Optional[float] = Query(None, ge=-90, le=90, description="Широта пользователя"),
		user_lon: Optional[float] = Query(None, ge=-180, le=180, description="Долгота пользователя"),
		min_price: Optional[float] = Query(None, ge=0, description="Минимальная цена"),
		max_price: Optional[float] = Query(None, ge=0, description="Максимальная цена"),
		tree_type: Optional[str] = Query(None, description="Тип дерева"),
		max_height: Optional[float] = Query(None, gt=0, description="Максимальная высота дерева"),
		page: int = Query(1, ge=1, description="Номер страницы"),
		per_page: int = Query(20, ge=1, le=100, description="Количество элементов на странице"),
		sort_by: str = Query("created_at", description="Поле для сортировки",
		                     regex="^(created_at|deadline|min_price)$"),
		sort_order: str = Query("desc", description="Порядок сортировки", regex="^(asc|desc)$")
):
	try:
		filters = OrderFilters(
			radius_km=radius_km,
			user_lat=user_lat,
			user_lon=user_lon,
			min_price=min_price,
			max_price=max_price,
			tree_type=tree_type,
			max_height=max_height,
			page=page,
			per_page=per_page,
			sort_by=sort_by,
			sort_order=sort_order
		)
		
		orders = await OrderService.get_available_orders(session, current_user.id, filters)
		return orders
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/{order_id}",
	response_model=OrderResponse,
	summary="Получение заказа по ID",
	description="Получение информации о заказе по его идентификатору"
)
async def get_order_by_id(
		order_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	order = await OrderService.get_order_by_id(session, order_id)
	if not order:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Заказ не найден"
		)
	return order


@router.patch(
	"/{order_id}",
	response_model=OrderResponse,
	summary="Обновление заказа",
	description="Обновление данных заказа (для админа или владельца)"
)
async def update_order(
		order_id: int,
		update_data: OrderUpdate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		# Преобразуем Pydantic модель в dict, исключая None значения
		update_dict = update_data.model_dump(exclude_unset=True)
		
		order = await OrderService.update_order(session, order_id, update_dict, current_user.id, current_user.is_admin)
		return order
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Ошибка при обновлении заказа"
		)


@router.post(
	"/{order_id}/close",
	response_model=OrderResponse,
	summary="Закрытие заказа",
	description="Закрытие заказа (для админа или владельца)"
)
async def close_order(
		order_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		order = await OrderService.close_order(session, order_id, current_user.id, current_user.is_admin)
		return order
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Ошибка при закрытии заказа"
		)


@router.delete(
	"/{order_id}",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Удаление заказа",
	description="Удаление заказа (для админа или владельца заказа)"
)
async def delete_order(
		order_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		await OrderService.delete_order(
			session, order_id, current_user.id, current_user.is_admin
		)
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=str(e)
		)


# Эндпоинты для предложений
@router.post(
	"/{order_id}/proposals",
	response_model=OrderProposalResponse,
	summary="Создание предложения",
	description="Создание предложения к заказу (только для исполнителей)"
)
async def create_proposal(
		order_id: int,
		proposal_data: OrderProposalCreate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		proposal = await OrderProposalService.create_proposal(
			session, proposal_data, order_id, current_user.id
		)
		return proposal
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Ошибка при создании предложения"
		)


@router.get(
	"/{order_id}/proposals",
	response_model=list[OrderProposalResponse],
	summary="Предложения к заказу",
	description="Получение списка предложений к заказу (для админа или владельца заказа)"
)
async def get_order_proposals(
		order_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		proposals = await OrderProposalService.get_proposals_by_order(
			session, order_id, current_user.id, current_user.is_admin
		)
		return proposals
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/proposals/my",
	response_model=list[OrderProposalWithOrderResponse],
	summary="Мои предложения",
	description="Получение списка предложений текущего пользователя"
)
async def get_my_proposals(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		proposals = await OrderProposalService.get_proposals_by_executor(session, current_user.id)
		return proposals
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/proposals/{proposal_id}",
	response_model=OrderProposalWithOrderResponse,
	summary="Получение предложения по ID",
	description="Получение информации о предложении по его идентификатору"
)
async def get_proposal_by_id(
		proposal_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	proposal = await OrderProposalService.get_proposal_by_id(session, proposal_id)
	if not proposal:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Предложение не найдено"
		)
	
	# Проверяем права доступа: либо автор предложения, либо владелец заказа, либо администратор
	if proposal.executor_id != current_user.id and proposal.order.customer_id != current_user.id and not current_user.is_admin:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Недостаточно прав для просмотра предложения"
		)
	
	return proposal


@router.patch(
	"/proposals/{proposal_id}",
	response_model=OrderProposalResponse,
	summary="Обновление предложения",
	description="Обновление данных предложения (для админа автора)"
)
async def update_proposal(
		proposal_id: int,
		update_data: OrderProposalUpdate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		# Преобразуем Pydantic модель в dict, исключая None значения
		update_dict = update_data.model_dump(exclude_unset=True)
		
		proposal = await OrderProposalService.update_proposal(
			session, proposal_id, update_dict, current_user.id, current_user.is_admin
		)
		return proposal
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Ошибка при обновлении предложения"
		)


@router.delete(
	"/proposals/{proposal_id}",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Удаление предложения",
	description="Удаление предложения (автор или администратор)"
)
async def delete_proposal(
		proposal_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		await OrderProposalService.delete_proposal(
			session, proposal_id, current_user.id, current_user.is_admin
		)
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=str(e)
		)
