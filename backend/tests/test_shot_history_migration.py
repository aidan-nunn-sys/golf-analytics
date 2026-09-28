from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import settings


@pytest.mark.parametrize('existing',[False,True])
def test_shot_history_migration(tmp_path,monkeypatch,existing):
    url=f'sqlite:///{tmp_path / "history.db"}'
    monkeypatch.setattr(settings,'database_url',url)
    config=Config(str(Path(__file__).parents[1]/'alembic.ini'))
    engine=create_engine(url)
    client_id=str(uuid4())
    if existing:
        command.upgrade(config,'g74b51e93c25')
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO clubs (id,user_id,label,category,is_active,order_index) VALUES (1,1,'7 Iron','iron',1,0)"))
            conn.execute(text("INSERT INTO shots (id,round_id,hole_number,club_id,total_yards,direction,source,device_key) VALUES (1,1,1,1,150,'straight','gps',:key)"),{'key':f'1:1:{client_id}'})
            conn.execute(text("INSERT INTO shots (id,round_id,hole_number,club_id,total_yards,direction,source) VALUES (2,1,1,1,155,'left','gps')"))
    command.upgrade(config,'head')
    columns={c['name'] for c in inspect(engine).get_columns('shots')}
    assert {'start_position','end_position','client_id','sequence','revision','deleted'}<=columns
    if existing:
        with engine.connect() as conn:
            rows=conn.execute(text('SELECT client_id,total_yards,sequence,start_position,revision,deleted,club_label FROM shots ORDER BY id')).all()
            assert rows[0]==(client_id,150,None,None,1,0,'7 Iron')
            assert rows[1][0] and rows[1][0]!=client_id
            assert rows[1][1:]==(155,None,None,1,0,'7 Iron')
    engine.dispose()
