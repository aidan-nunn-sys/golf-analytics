from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import settings


@pytest.mark.parametrize('existing', [False, True])
def test_personal_note_migration_preserves_courses(tmp_path, monkeypatch, existing):
    url = f'sqlite:///{tmp_path / "notes.db"}'
    monkeypatch.setattr(settings, 'database_url', url)
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    engine = create_engine(url)
    if existing:
        command.upgrade(config, 'a74b51e93c24')
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO courses (id,name,import_source) VALUES (1,'Keep this course','manual')"))
            conn.execute(text('INSERT INTO holes (id,course_id,number,par) VALUES (1,1,1,4)'))
    command.upgrade(config, 'head')
    assert 'hole_notes' in inspect(engine).get_table_names()
    assert {'user_id', 'course_id', 'hole_number', 'revision', 'text'} <= {c['name'] for c in inspect(engine).get_columns('hole_notes')}
    assert inspect(engine).get_unique_constraints('hole_notes')[0]['column_names'] == ['user_id', 'course_id', 'hole_number']
    if existing:
        with engine.connect() as conn:
            assert conn.execute(text('SELECT name FROM courses WHERE id=1')).scalar() == 'Keep this course'
            assert conn.execute(text('SELECT par FROM holes WHERE id=1')).scalar() == 4
    engine.dispose()
