"""Green observations and idempotent device shots."""
from alembic import op
import sqlalchemy as sa
revision = 'a74b51e93c24'
down_revision = 'f63a40d82b13'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('rounds', sa.Column('green_notes', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('shots', sa.Column('device_key', sa.String(100), nullable=True))
    op.create_index('ix_shots_device_key', 'shots', ['device_key'], unique=True)


def downgrade():
    op.drop_index('ix_shots_device_key', table_name='shots')
    op.drop_column('shots', 'device_key')
    op.drop_column('rounds', 'green_notes')
