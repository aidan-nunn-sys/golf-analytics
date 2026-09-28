from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text, inspect

from app.config import settings


def test_upgrade_backfills_historical_stroke_indexes(tmp_path, monkeypatch):
    database = f'sqlite:///{tmp_path / "migration.db"}'
    monkeypatch.setattr(settings, 'database_url', database)
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    command.upgrade(config, '291fc33fba04')
    engine = create_engine(database)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO courses (id,name,import_source) VALUES (1,'Original course','manual')"))
        conn.execute(text('INSERT INTO holes (id,course_id,number,par,stroke_index) VALUES (1,1,1,4,7)'))
        conn.execute(text("INSERT INTO rounds (id,user_id,course_id,date,status,current_hole,hole_count) VALUES (1,1,1,'2026-09-01','completed',1,18)"))
        conn.execute(text('INSERT INTO round_holes (round_id,hole_id,par) VALUES (1,1,4)'))
    command.upgrade(config, 'head')
    with engine.connect() as conn:
        assert conn.execute(text('SELECT stroke_index FROM round_holes')).scalar() == 7
    assert 'scorecard_source' in {c['name'] for c in inspect(engine).get_columns('courses')}
    engine.dispose()


def test_fresh_database_migrates_to_head(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database_url', f'sqlite:///{tmp_path / "fresh.db"}')
    command.upgrade(Config(str(Path(__file__).parents[1] / 'alembic.ini')), 'head')
