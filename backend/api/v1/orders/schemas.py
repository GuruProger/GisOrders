from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from enum import Enum


class OrderStatus(str, Enum):
	OPEN = "open"
	CLOSED = "closed"


# Базовые схемы для Order
class OrderBase(BaseModel):
	title: str = Field(..., min_length=5, max_length=200)
	description: str = Field(..., min_length=10)
	min_price: Optional[float] = Field(None, ge=0)
	max_price: Optional[float] = Field(None, ge=0)
	deadline: datetime
	address: str = Field(..., min_length=5, max_length=500)
	tree_type: str = Field(..., max_length=50)
	tree_height: float = Field(..., gt=0)
	tree_diameter: float = Field(..., gt=0)
	photos: Optional[List[str]] = None
	
	@field_validator('max_price')
	def validate_prices(cls, v, values):
		if 'min_price' in values.data and v is not None and values.data['min_price'] is not None:
			if v < values.data['min_price']:
				raise ValueError('max_price должен быть больше или равен min_price')
		return v
	
	@field_validator('deadline')
	def validate_deadline(cls, v):
		# Если пришел aware datetime - преобразуем к naive
		if v.tzinfo is not None:
			v = v.replace(tzinfo=None)
		
		if v <= datetime.now():
			raise ValueError('Дедлайн должен быть в будущем')
		return v


class OrderCreate(OrderBase):
	lat: float = Field(..., ge=-90, le=90)
	lon: float = Field(..., ge=-180, le=180)


class OrderUpdate(BaseModel):
	title: Optional[str] = Field(None, min_length=5, max_length=200)
	description: Optional[str] = Field(None, min_length=10)
	min_price: Optional[float] = Field(None, ge=0)
	max_price: Optional[float] = Field(None, ge=0)
	deadline: Optional[datetime] = None
	address: Optional[str] = Field(None, min_length=5, max_length=500)
	tree_type: Optional[str] = Field(None, max_length=50)
	tree_height: Optional[float] = Field(None, gt=0)
	tree_diameter: Optional[float] = Field(None, gt=0)
	photos: Optional[List[str]] = None
	
	@field_validator('deadline')
	def validate_deadline(cls, v):
		if v:
			# Если пришел aware datetime - преобразуем к naive
			if v.tzinfo is not None:
				v = v.replace(tzinfo=None)
			
			if v <= datetime.now():
				raise ValueError('Дедлайн должен быть в будущем')
		return v
	
	@field_validator('max_price')
	def validate_prices(cls, v, values):
		if 'min_price' in values.data and v is not None and values.data['min_price'] is not None:
			if v < values.data['min_price']:
				raise ValueError('max_price должен быть больше или равен min_price')
		return v


class OrderResponse(OrderBase):
	id: int
	status: OrderStatus
	created_at: datetime
	customer_id: int
	lat: float
	lon: float
	
	class Config:
		from_attributes = True


# Схемы для OrderProposal
class OrderProposalBase(BaseModel):
	proposed_price: float = Field(..., gt=0)
	message: Optional[str] = Field(None, max_length=1000)


class OrderProposalCreate(OrderProposalBase):
	pass


class OrderProposalUpdate(BaseModel):
	proposed_price: Optional[float] = Field(None, gt=0)
	message: Optional[str] = Field(None, max_length=1000)


class OrderProposalResponse(OrderProposalBase):
	id: int
	created_at: datetime
	order_id: int
	executor_id: int
	
	class Config:
		from_attributes = True


# Специальные схемы
class OrderWithProposalsResponse(OrderResponse):
	proposals: List[OrderProposalResponse] = []


class OrderProposalWithOrderResponse(OrderProposalResponse):
	order: OrderResponse


# Схемы для фильтров
class OrderFilters(BaseModel):
	radius_km: int = Field(10, gt=0, le=50)
	user_lat: float = Field(..., ge=-90, le=90)
	user_lon: float = Field(..., ge=-180, le=180)
	min_price: Optional[float] = Field(None, ge=0)
	max_price: Optional[float] = Field(None, ge=0)
	tree_type: Optional[str] = None
	max_height: Optional[float] = Field(None, gt=0)
	page: int = Field(1, ge=1)
	per_page: int = Field(20, ge=1, le=100)
	sort_by: str = Field("created_at", pattern="^(created_at|deadline|min_price)$")
	sort_order: str = Field("desc", pattern="^(asc|desc)$")
	
	@field_validator('max_price')
	def validate_prices(cls, v, values):
		if 'min_price' in values.data and v is not None and values.data['min_price'] is not None:
			if v < values.data['min_price']:
				raise ValueError('max_price должен быть больше или равен min_price')
		return v
