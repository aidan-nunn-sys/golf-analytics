"""make shots.carry_yards nullable

On-course GPS shots now store ground distance in total_yards instead of
carry_yards (see 2026-07-15 decision log entry), so carry_yards is no longer
populated for round shots.

Revision ID: f3a1c9b2d7e4
Revises: 91a84aef90c8
Create Date: 2026-08-26 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f3a1c9b2d7e4"
down_revision = "91a84aef90c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("shots", schema=None) as batch_op:
        batch_op.alter_column("carry_yards", existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("shots", schema=None) as batch_op:
        batch_op.alter_column("carry_yards", existing_type=sa.Float(), nullable=False)
