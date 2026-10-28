from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import db_helper
from core.security import get_current_active_user
from .schemas import ImageUploadResponse
from .services import ImageUploadService
from ..users.models import User

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post(
	"/images",
	response_model=ImageUploadResponse,
	summary="Загрузка изображения",
	description=(
		"Принимает JPEG, PNG или WebP до MEDIA_MAX_UPLOAD_SIZE_MB, "
		"поворачивает по EXIF, уменьшает до 1920 px и сохраняет как WebP"
	),
)
async def upload_image(
		file: Annotated[UploadFile, File(description="Файл изображения")],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	return await ImageUploadService.save(file)
