"""Stable identity for rounds created on a device."""
from alembic import op
import sqlalchemy as sa

revision = 'f63a40d82b13'
down_revision = 'e52d39c71a02'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('rounds', sa.Column('device_key', sa.String(80), nullable=True))
    op.create_index('ix_rounds_device_key', 'rounds', ['device_key'], unique=True)


def downgrade():
    op.drop_index('ix_rounds_device_key', table_name='rounds')
    op.drop_column('rounds', 'device_key')
