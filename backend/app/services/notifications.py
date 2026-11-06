"""Create user notifications, honouring each user's preferences."""

from sqlalchemy.orm import Session

from app.db import models as m


def notify(
    db: Session,
    user: m.User,
    category: str,  # missions|ai|alerts
    title: str,
    message: str,
    *,
    severity: str = "info",
    params: dict | None = None,
    link: str | None = None,
) -> None:
    if not (user.notification_prefs or {}).get(category, True):
        return
    db.add(m.Notification(
        user_id=user.id, title=title, message=message, params=params or {},
        severity=severity, link=link,
    ))
