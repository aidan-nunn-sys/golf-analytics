"""Scorecard import provenance and immutable round stroke indexes."""
from alembic import op
import sqlalchemy as sa

revision = 'c61b72498d01'
down_revision = '291fc33fba04'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('courses') as batch:
        batch.add_column(sa.Column('scorecard_source', sa.String(), nullable=True))
        batch.add_column(sa.Column('scorecard_imported_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('scorecard_urls', sa.JSON(), nullable=True))
    with op.batch_alter_table('tee_sets') as batch:
        batch.add_column(sa.Column('source_key', sa.String(), nullable=True))
        batch.create_unique_constraint('uq_course_tee_source', ['course_id', 'source_key'])
    with op.batch_alter_table('round_holes') as batch:
        batch.add_column(sa.Column('stroke_index', sa.Integer(), nullable=True))
    op.execute('UPDATE round_holes SET stroke_index = (SELECT stroke_index FROM holes WHERE holes.id = round_holes.hole_id)')


def downgrade():
    with op.batch_alter_table('round_holes') as batch:
        batch.drop_column('stroke_index')
    with op.batch_alter_table('tee_sets') as batch:
        batch.drop_constraint('uq_course_tee_source', type_='unique')
        batch.drop_column('source_key')
    with op.batch_alter_table('courses') as batch:
        batch.drop_column('scorecard_urls')
        batch.drop_column('scorecard_imported_at')
        batch.drop_column('scorecard_source')
