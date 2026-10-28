from pydantic import BaseModel


class ImageUploadResponse(BaseModel):
	url: str
	width: int
	height: int
	size: int
	content_type: str = "image/webp"
