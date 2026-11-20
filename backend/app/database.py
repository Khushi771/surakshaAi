from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def migrate_schema() -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as connection:
        columns = {
            row["name"]
            for row in connection.exec_driver_sql("PRAGMA table_info(incidents)").mappings()
        }
        if "assignee_name" not in columns:
            connection.exec_driver_sql("ALTER TABLE incidents ADD COLUMN assignee_name VARCHAR(120)")
        if "assignee_email" not in columns:
            connection.exec_driver_sql("ALTER TABLE incidents ADD COLUMN assignee_email VARCHAR(254)")
        connection.exec_driver_sql(
            """UPDATE actions
               SET owner = (
                   SELECT incidents.assignee_name FROM incidents
                   WHERE incidents.id = actions.incident_id
               )
               WHERE owner = 'Unassigned'
                 AND EXISTS (
                     SELECT 1 FROM incidents
                     WHERE incidents.id = actions.incident_id
                       AND incidents.assignee_name IS NOT NULL
                       AND incidents.assignee_name != ''
                 )"""
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
