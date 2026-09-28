"""Round notes and recoverable deletion."""

from alembic import op
import sqlalchemy as sa

revision = "d84f20a71e03"
down_revision = "c61b72498d01"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rounds", sa.Column("notes", sa.String(4000), nullable=False, server_default=""))
    op.add_column("rounds", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table("rounds") as batch:
        batch.drop_column("deleted_at")
        batch.drop_column("notes")
