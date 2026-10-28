"""use timestamptz for timestamp columns

Revision ID: b2f7c9a41d55
Revises: 19d9442e0bad
Create Date: 2026-10-28 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2f7c9a41d55'
down_revision: Union[str, Sequence[str], None] = '19d9442e0bad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Все временные метки приложения хранятся в UTC
TIMESTAMP_COLUMNS = (
	('order', 'created_at'),
	('order', 'deadline'),
	('order_proposal', 'created_at'),
	('chat', 'created_at'),
	('chat', 'updated_at'),
	('message', 'created_at'),
)


def upgrade() -> None:
	for table, column in TIMESTAMP_COLUMNS:
		op.alter_column(
			table,
			column,
			type_=sa.DateTime(timezone=True),
			existing_type=sa.DateTime(timezone=False),
			postgresql_using=f"{column} AT TIME ZONE 'UTC'",
		)


def downgrade() -> None:
	for table, column in TIMESTAMP_COLUMNS:
		op.alter_column(
			table,
			column,
			type_=sa.DateTime(timezone=False),
			existing_type=sa.DateTime(timezone=True),
			postgresql_using=f"{column} AT TIME ZONE 'UTC'",
		)
