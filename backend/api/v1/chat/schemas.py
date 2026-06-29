from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List


# Схемы для Chat
class ChatBase(BaseModel):
	order_id: int
	customer_id: int
	executor_id: int
	proposal_id: Optional[int] = None


class ChatCreate(ChatBase):
	pass


class ChatResponse(ChatBase):
	id: int
	is_active: bool
	created_at: datetime
	updated_at: datetime
	last_message: Optional[str] = None
	unread_count: int = 0
	
	class Config:
		from_attributes = True


class ChatWithMessagesResponse(ChatResponse):
	messages: List["MessageResponse"] = []


# Схемы для Message
class MessageBase(BaseModel):
	text: str = Field(..., min_length=1, max_length=2000)


class MessageCreate(MessageBase):
	"""Схема для создания сообщения. chat_id берётся из URL."""
	pass


class MessageUpdate(BaseModel):
	is_read: Optional[bool] = None
	text: Optional[str] = Field(None, min_length=1, max_length=2000)


class MessageResponse(MessageBase):
	id: int
	chat_id: int
	sender_id: int
	is_read: bool
	created_at: datetime
	
	class Config:
		from_attributes = True