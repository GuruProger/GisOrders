"""enable_postgis

Revision ID: ваша_новая_revision_id
Revises: 1dcc4977c420
Create Date: 2026-03-1 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '59e744c05168'
down_revision: Union[str, Sequence[str], None] = '1dcc4977c420'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Включаем расширение PostGIS
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis')


def downgrade() -> None:
    # Отключаем расширение (осторожно - удалит все геоданные!)
    op.execute('DROP EXTENSION IF EXISTS postgis')