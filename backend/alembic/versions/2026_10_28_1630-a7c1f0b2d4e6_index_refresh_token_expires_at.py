"""index refresh_token expires_at for cleanup

Revision ID: a7c1f0b2d4e6
Revises: e9b1c3d5f724
Create Date: 2026-10-28 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7c1f0b2d4e6'
down_revision: Union[str, Sequence[str], None] = 'e9b1c3d5f724'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	op.create_index(
		'ix_refresh_token_expires_at',
		'refresh_token',
		['expires_at'],
		unique=False,
	)


def downgrade() -> None:
	op.drop_index('ix_refresh_token_expires_at', table_name='refresh_token')
