"""add user.is_active for account blocking

Revision ID: d6e2a4c8b153
Revises: 8f3b5c7d91ae
Create Date: 2026-10-28 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd6e2a4c8b153'
down_revision: Union[str, Sequence[str], None] = '8f3b5c7d91ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	op.add_column(
		'user',
		sa.Column(
			'is_active',
			sa.Boolean(),
			nullable=False,
			server_default=sa.true(),
		),
	)


def downgrade() -> None:
	op.drop_column('user', 'is_active')
