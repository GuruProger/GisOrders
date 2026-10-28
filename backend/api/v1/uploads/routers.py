from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from core.security import get_current_active_user

from ..users.models import User
from .schemas import ImageUploadResponse
from .services import ImageUploadService

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
