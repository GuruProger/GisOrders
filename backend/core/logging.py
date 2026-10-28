import json
import logging
from datetime import datetime, timezone
from typing import Any

from core.config import settings

# Поля, которые уже представлены в JSON явно или относятся к внутренностям logging.
_RESERVED_ATTRIBUTES = {
	"args",
	"asctime",
	"created",
	"exc_info",
	"exc_text",
	"filename",
	"funcName",
	"levelname",
	"levelno",
	"lineno",
	"message",
	"module",
	"msecs",
	"msg",
	"name",
	"pathname",
	"process",
	"processName",
	"relativeCreated",
	"stack_info",
	"stacklevel",
	"taskName",
	"thread",
	"threadName",
}


class JsonFormatter(logging.Formatter):
	"""Форматтер для машинно-читаемых логов: одна строка JSON на запись."""
	
	def format(self, record: logging.LogRecord) -> str:
		payload: dict[str, Any] = {
			"timestamp": datetime.fromtimestamp(
				record.created,
				tz=timezone.utc,
			).isoformat(),
			"level": record.levelname,
			"logger": record.name,
			"message": record.getMessage(),
		}
		
		for key, value in record.__dict__.items():
			if key in _RESERVED_ATTRIBUTES or key.startswith("_"):
				continue
			payload[key] = value
		
		if record.exc_info:
			payload["exception"] = self.formatException(record.exc_info)
		
		return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
	"""Настраивает root logger один раз на процесс."""
	root = logging.getLogger()
	if getattr(root, "_gisorders_configured", False):
		return
	
	handler = logging.StreamHandler()
	if settings.log_json:
		handler.setFormatter(JsonFormatter())
	else:
		handler.setFormatter(
			logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
		)
	
	root.handlers.clear()
	root.addHandler(handler)
	root.setLevel(settings.log_level.upper())
	root._gisorders_configured = True
