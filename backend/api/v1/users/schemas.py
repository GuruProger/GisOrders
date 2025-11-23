from pydantic import BaseModel, EmailStr, field_validator, Field
import re
from typing import Optional


class UserBase(BaseModel):
	email: EmailStr
	username: str
	phone_number: str | None = Field(None, pattern=r'^\+7\d{10}$')
	
	@field_validator('phone_number')
	@classmethod
	def validate_phone_format(cls, v):
		if v is None:
			return v
		
		# Удаляем все нецифровые символы кроме +
		cleaned = re.sub(r'[^\d+]', '', v)
		
		# Приводим к формату +7XXXXXXXXXX
		if cleaned.startswith('8') and len(cleaned) == 11:
			cleaned = '+7' + cleaned[1:]
		elif cleaned.startswith('7') and len(cleaned) == 11:
			cleaned = '+' + cleaned
		elif cleaned.startswith('+7') and len(cleaned) == 12:
			pass  # Уже правильный формат
		else:
			raise ValueError('Номер телефона должен быть в российском формате: +7XXXXXXXXXX или 8XXXXXXXXXX')
		
		return cleaned


class UserCreate(UserBase):
	password: str = Field(..., min_length=8)
	
	@field_validator('password')
	@classmethod
	def password_strength(cls, v):
		if len(v) < 8:
			raise ValueError('Пароль должен содержать минимум 8 символов')
		return v


class UserUpdate(BaseModel):
	email: Optional[EmailStr] = None
	username: Optional[str] = None
	phone_number: Optional[str] = Field(None, pattern=r'^\+7\d{10}$')
	
	@field_validator('phone_number')
	@classmethod
	def validate_phone_format(cls, v):
		if v is None:
			return v
		
		# Удаляем все нецифровые символы кроме +
		cleaned = re.sub(r'[^\d+]', '', v)
		
		# Приводим к формату +7XXXXXXXXXX
		if cleaned.startswith('8') and len(cleaned) == 11:
			cleaned = '+7' + cleaned[1:]
		elif cleaned.startswith('7') and len(cleaned) == 11:
			cleaned = '+' + cleaned
		elif cleaned.startswith('+7') and len(cleaned) == 12:
			pass  # Уже правильный формат
		else:
			raise ValueError('Номер телефона должен быть в российском формате: +7XXXXXXXXXX или 8XXXXXXXXXX')
		
		return cleaned


class UserResponse(UserBase):
	id: int
	is_admin: bool
	
	class Config:
		from_attributes = True


class LoginRequest(BaseModel):
	email: EmailStr
	password: str


class Token(BaseModel):
	access_token: str
	token_type: str
	user: UserResponse