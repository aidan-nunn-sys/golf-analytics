"""Course archive, yardages, historical labels and offline revisions."""
from alembic import op
import sqlalchemy as sa

revision = "e52d39c71a02"
down_revision = "d84f20a71e03"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("courses", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tee_sets", sa.Column("hole_yardages", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("rounds", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("rounds", sa.Column("course_name", sa.String(), nullable=True))
    op.add_column("rounds", sa.Column("tee_name", sa.String(), nullable=True))
    op.add_column("rounds", sa.Column("hole_yardages", sa.JSON(), nullable=False, server_default="{}"))
    op.execute("UPDATE rounds SET course_name = (SELECT name FROM courses WHERE courses.id = rounds.course_id), tee_name = (SELECT name FROM tee_sets WHERE tee_sets.id = rounds.tee_set_id)")


def downgrade():
    with op.batch_alter_table("rounds") as batch:
        for column in ("revision", "course_name", "tee_name", "hole_yardages"):
            batch.drop_column(column)
    with op.batch_alter_table("tee_sets") as batch:
        batch.drop_column("hole_yardages")
    with op.batch_alter_table("courses") as batch:
        batch.drop_column("archived_at")
