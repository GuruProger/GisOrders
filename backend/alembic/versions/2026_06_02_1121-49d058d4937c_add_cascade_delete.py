"""add cascade delete

Revision ID: 49d058d4937c
Revises: ae5557f98182
Create Date: 2026-06-02 11:21:53.999221

"""
from typing import Sequence, Union

from alembic import op


revision: str = '49d058d4937c'
down_revision: Union[str, Sequence[str], None] = 'ae5557f98182'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('fk_order_customer_id_user', 'order', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_customer_id_user',
        source_table='order',
        referent_table='user',
        local_cols=['customer_id'],
        remote_cols=['id'],
        ondelete='CASCADE'
    )
    
    op.drop_constraint('fk_order_proposal_executor_id_user', 'order_proposal', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_proposal_executor_id_user',
        source_table='order_proposal',
        referent_table='user',
        local_cols=['executor_id'],
        remote_cols=['id'],
        ondelete='CASCADE'
    )
    
    op.drop_constraint('fk_order_proposal_order_id_order', 'order_proposal', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_proposal_order_id_order',
        source_table='order_proposal',
        referent_table='order',
        local_cols=['order_id'],
        remote_cols=['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_order_proposal_order_id_order', 'order_proposal', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_proposal_order_id_order',
        'order_proposal', 'order',
        ['order_id'], ['id']
    )
    
    op.drop_constraint('fk_order_proposal_executor_id_user', 'order_proposal', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_proposal_executor_id_user',
        'order_proposal', 'user',
        ['executor_id'], ['id']
    )
    
    op.drop_constraint('fk_order_customer_id_user', 'order', type_='foreignkey')
    op.create_foreign_key(
        'fk_order_customer_id_user',
        'order', 'user',
        ['customer_id'], ['id']
    )