from sqlalchemy import select

from app.models import Club
from app.seed import create_user
from app.standard_bag import STANDARD_BAG


def test_new_user_gets_standard_bag(db_session):
    user = create_user(db_session, "golfer@example.com", "pw")
    clubs = db_session.scalars(
        select(Club).where(Club.user_id == user.id).order_by(Club.order_index)
    ).all()
    assert len(clubs) == len(STANDARD_BAG)
    assert clubs[0].label == "Driver"
    assert clubs[0].order_index == 0
