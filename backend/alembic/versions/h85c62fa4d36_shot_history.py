"""Durable round shot positions and revisioned corrections."""
from uuid import NAMESPACE_URL, UUID, uuid5

from alembic import op
import sqlalchemy as sa

revision = "h85c62fa4d36"
down_revision = "g74b51e93c25"
branch_labels = None
depends_on = None


def upgrade():
    for column in [
        sa.Column("client_id", sa.String(36), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("start_position", sa.JSON(), nullable=True),
        sa.Column("end_position", sa.JSON(), nullable=True),
        sa.Column("club_label", sa.String(), nullable=True),
        sa.Column("start_lie", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("end_lie", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("penalties", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("holed_out", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    ]:
        op.add_column("shots", column)
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT s.id, s.device_key, c.label FROM shots s JOIN clubs c ON c.id=s.club_id WHERE s.round_id IS NOT NULL")).all()
    for shot_id, device_key, label in rows:
        try:
            client_id = str(UUID(device_key.rsplit(":", 1)[-1]))
        except (ValueError, AttributeError):
            client_id = str(uuid5(NAMESPACE_URL, f"golf-history-shot:{shot_id}"))
        connection.execute(sa.text("UPDATE shots SET client_id=:client_id, club_label=:label WHERE id=:id"), {"client_id": client_id, "label": label, "id": shot_id})
    with op.batch_alter_table("shots") as batch:
        batch.create_unique_constraint("uq_round_shot_client", ["round_id", "client_id"])


def downgrade():
    with op.batch_alter_table("shots") as batch:
        batch.drop_constraint("uq_round_shot_client", type_="unique")
        for column in ("client_id", "sequence", "start_position", "end_position", "club_label", "start_lie", "end_lie", "penalties", "holed_out", "deleted", "revision"):
            batch.drop_column(column)
