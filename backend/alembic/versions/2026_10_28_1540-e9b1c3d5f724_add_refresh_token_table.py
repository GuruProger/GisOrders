"""add refresh_token table

Revision ID: e9b1c3d5f724
Revises: d6e2a4c8b153
Create Date: 2026-10-28 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e9b1c3d5f724'
down_revision: Union[str, Sequence[str], None] = 'd6e2a4c8b153'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	op.create_table(
		'refresh_token',
		sa.Column('id', sa.Integer(), nullable=False),
		sa.Column('token_hash', sa.String(length=64), nullable=False),
		sa.Column('user_id', sa.Integer(), nullable=False),
		sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
		sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
		sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
		sa.Column('replaced_by_id', sa.Integer(), nullable=True),
		sa.ForeignKeyConstraint(
			['user_id'],
			['user.id'],
			name='fk_refresh_token_user_id_user',
			ondelete='CASCADE',
		),
		sa.ForeignKeyConstraint(
			['replaced_by_id'],
			['refresh_token.id'],
			name='fk_refresh_token_replaced_by_id_refresh_token',
			ondelete='SET NULL',
		),
		sa.PrimaryKeyConstraint('id', name='pk_refresh_token'),
	)
	op.create_index(
		'ix_refresh_token_token_hash',
		'refresh_token',
		['token_hash'],
		unique=True,
	)
	op.create_index(
		'ix_refresh_token_user_id',
		'refresh_token',
		['user_id'],
		unique=False,
	)


def downgrade() -> None:
	op.drop_index('ix_refresh_token_user_id', table_name='refresh_token')
	op.drop_index('ix_refresh_token_token_hash', table_name='refresh_token')
	op.drop_table('refresh_token')
