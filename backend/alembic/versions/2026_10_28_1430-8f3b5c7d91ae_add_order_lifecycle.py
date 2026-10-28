"""add order lifecycle: assigned status, accepted proposal, proposal status

Revision ID: 8f3b5c7d91ae
Revises: b2f7c9a41d55
Create Date: 2026-10-28 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8f3b5c7d91ae'
down_revision: Union[str, Sequence[str], None] = 'b2f7c9a41d55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PROPOSAL_STATUS = postgresql.ENUM(
	'PENDING', 'ACCEPTED', 'REJECTED',
	name='proposal_status',
)


def upgrade() -> None:
	# Новый статус заказа: заказчик выбрал исполнителя
	op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ASSIGNED' AFTER 'OPEN'")
	
	# Статус отклика: pending -> accepted | rejected
	PROPOSAL_STATUS.create(op.get_bind(), checkfirst=True)
	op.add_column(
		'order_proposal',
		sa.Column(
			'status',
			postgresql.ENUM(
				'PENDING', 'ACCEPTED', 'REJECTED',
				name='proposal_status',
				create_type=False,
			),
			nullable=False,
			server_default='PENDING',
		),
	)
	
	# Один отклик на исполнителя на заказ - защита от гонки при создании
	op.create_unique_constraint(
		'uq_order_proposal_order_executor',
		'order_proposal',
		['order_id', 'executor_id'],
	)
	
	# Один чат на отклик
	op.create_unique_constraint(
		'uq_chat_proposal_id',
		'chat',
		['proposal_id'],
	)
	
	# Выбранный исполнитель и время закрытия
	op.add_column('order', sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True))
	op.add_column('order', sa.Column('accepted_proposal_id', sa.Integer(), nullable=True))
	op.create_unique_constraint(
		'uq_order_accepted_proposal_id',
		'order',
		['accepted_proposal_id'],
	)
	op.create_foreign_key(
		'fk_order_accepted_proposal_id_order_proposal',
		'order',
		'order_proposal',
		['accepted_proposal_id'],
		['id'],
		ondelete='SET NULL',
	)
	
	# Приводим исторические данные к новой семантике:
	# у закрытых заказов не может быть откликов в ожидании и открытых чатов.
	op.execute(
		"""
		UPDATE order_proposal
		SET status = 'REJECTED'
		WHERE order_id IN (SELECT id FROM "order" WHERE status = 'CLOSED')
		"""
	)
	op.execute(
		"""
		UPDATE chat
		SET is_active = false
		WHERE order_id IN (SELECT id FROM "order" WHERE status = 'CLOSED')
		"""
	)


def downgrade() -> None:
	op.drop_constraint('fk_order_accepted_proposal_id_order_proposal', 'order', type_='foreignkey')
	op.drop_constraint('uq_order_accepted_proposal_id', 'order', type_='unique')
	op.drop_column('order', 'accepted_proposal_id')
	op.drop_column('order', 'closed_at')
	
	op.drop_constraint('uq_chat_proposal_id', 'chat', type_='unique')
	op.drop_constraint('uq_order_proposal_order_executor', 'order_proposal', type_='unique')
	op.drop_column('order_proposal', 'status')
	PROPOSAL_STATUS.drop(op.get_bind(), checkfirst=True)
	
	# Убираем ASSIGNED из enum: назначенные заказы становятся закрытыми
	op.execute("UPDATE \"order\" SET status = 'CLOSED' WHERE status = 'ASSIGNED'")
	op.execute("ALTER TYPE order_status RENAME TO order_status_old")
	op.execute("CREATE TYPE order_status AS ENUM ('OPEN', 'CLOSED')")
	op.execute('ALTER TABLE "order" ALTER COLUMN status TYPE order_status USING status::text::order_status')
	op.execute("DROP TYPE order_status_old")
