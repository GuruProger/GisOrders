"""add_chat_and_message_tables

Revision ID: 19d9442e0bad
Revises: 49d058d4937c
Create Date: 2026-06-08 20:40:08.105549

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '19d9442e0bad'
down_revision: Union[str, Sequence[str], None] = '49d058d4937c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	# Создаём таблицу chat
	op.create_table('chat',
	                sa.Column('id', sa.Integer(), nullable=False),
	                sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
	                sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
	                sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(),
	                          nullable=False),
	                sa.Column('order_id', sa.Integer(), nullable=False),
	                sa.Column('customer_id', sa.Integer(), nullable=False),
	                sa.Column('executor_id', sa.Integer(), nullable=False),
	                sa.Column('proposal_id', sa.Integer(), nullable=True),
	                sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ondelete='CASCADE'),
	                sa.ForeignKeyConstraint(['executor_id'], ['user.id'], ondelete='CASCADE'),
	                sa.ForeignKeyConstraint(['order_id'], ['order.id'], ondelete='CASCADE'),
	                sa.ForeignKeyConstraint(['proposal_id'], ['order_proposal.id'], ondelete='SET NULL'),
	                sa.PrimaryKeyConstraint('id')
	                )
	
	# Создаём индексы
	op.create_index(op.f('ix_chat_order_id'), 'chat', ['order_id'], unique=False)
	op.create_index(op.f('ix_chat_customer_id'), 'chat', ['customer_id'], unique=False)
	op.create_index(op.f('ix_chat_executor_id'), 'chat', ['executor_id'], unique=False)
	
	# Создаём таблицу message
	op.create_table('message',
	                sa.Column('id', sa.Integer(), nullable=False),
	                sa.Column('text', sa.Text(), nullable=False),
	                sa.Column('is_read', sa.Boolean(), nullable=False, default=False),
	                sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
	                sa.Column('chat_id', sa.Integer(), nullable=False),
	                sa.Column('sender_id', sa.Integer(), nullable=False),
	                sa.ForeignKeyConstraint(['chat_id'], ['chat.id'], ondelete='CASCADE'),
	                sa.ForeignKeyConstraint(['sender_id'], ['user.id'], ondelete='CASCADE'),
	                sa.PrimaryKeyConstraint('id')
	                )
	
	# Создаём индексы
	op.create_index(op.f('ix_message_chat_id'), 'message', ['chat_id'], unique=False)
	op.create_index(op.f('ix_message_created_at'), 'message', ['created_at'], unique=False)


def downgrade() -> None:
	op.drop_index(op.f('ix_message_created_at'), table_name='message')
	op.drop_index(op.f('ix_message_chat_id'), table_name='message')
	op.drop_table('message')
	op.drop_index(op.f('ix_chat_executor_id'), table_name='chat')
	op.drop_index(op.f('ix_chat_customer_id'), table_name='chat')
	op.drop_index(op.f('ix_chat_order_id'), table_name='chat')
	op.drop_table('chat')
