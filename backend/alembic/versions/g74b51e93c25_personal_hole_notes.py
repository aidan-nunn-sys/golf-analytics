"""Private reusable course-hole notes, independent of round snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "g74b51e93c25"
down_revision = "a74b51e93c24"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hole_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("hole_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(2000), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "course_id", "hole_number", name="uq_hole_note_owner"),
    )


def downgrade():
    op.drop_table("hole_notes")
