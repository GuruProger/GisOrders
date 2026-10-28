import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserBase(BaseModel):
	email: EmailStr
	username: str
	phone_number: Optional[str] = Field(None, pattern=r'^\+7\d{10}$')
	
	@field_validator('phone_number')
	def validate_phone_format(cls, v: Optional[str]) -> Optional[str]:
		if not v:  # Обрабатываем None и пустые строки
			return None
		
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


def validate_password_strength(value: str) -> str:
	if len(value) < 8:
		raise ValueError('Пароль должен содержать минимум 8 символов')
	if not any(c.isupper() for c in value):
		raise ValueError('Пароль должен содержать хотя бы одну заглавную букву')
	if not any(c.isdigit() for c in value):
		raise ValueError('Пароль должен содержать хотя бы одну цифру')
	return value


class UserCreate(UserBase):
	password: str = Field(..., min_length=8)
	
	@field_validator('password')
	def password_strength(cls, v: str) -> str:
		return validate_password_strength(v)


class UserUpdate(BaseModel):
	email: Optional[EmailStr] = None
	username: Optional[str] = None
	phone_number: Optional[str] = Field(None, pattern=r'^\+7\d{10}$')
	
	@field_validator('phone_number')
	def validate_phone_format(cls, v: Optional[str]) -> Optional[str]:
		# Используем тот же валидатор, что и в UserBase
		if not v:
			return None
		
		cleaned = re.sub(r'[^\d+]', '', v)
		
		if cleaned.startswith('8') and len(cleaned) == 11:
			cleaned = '+7' + cleaned[1:]
		elif cleaned.startswith('7') and len(cleaned) == 11:
			cleaned = '+' + cleaned
		elif cleaned.startswith('+7') and len(cleaned) == 12:
			pass
		else:
			raise ValueError('Номер телефона должен быть в российском формате: +7XXXXXXXXXX или 8XXXXXXXXXX')
		
		return cleaned


class UserResponse(UserBase):
	id: int
	is_admin: bool
	is_active: bool = True
	
	model_config = ConfigDict(from_attributes=True)  # Заменяет class Config в Pydantic v2


class UserPublicResponse(BaseModel):
	id: int
	username: str
	
	model_config = ConfigDict(from_attributes=True)  # Заменяет class Config в Pydantic v2


class LoginRequest(BaseModel):
	email: EmailStr
	password: str


class Token(BaseModel):
	access_token: str
	refresh_token: str
	token_type: str
	user: UserResponse


class RefreshRequest(BaseModel):
	refresh_token: str = Field(..., min_length=16)


class PasswordChangeRequest(BaseModel):
	current_password: str = Field(..., min_length=1)
	new_password: str = Field(..., min_length=8)
	
	@field_validator('new_password')
	def password_strength(cls, v: str) -> str:
		return validate_password_strength(v)
