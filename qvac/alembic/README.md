# qvac/alembic

Database migration scripts for the QVAC Python app.

## Purpose

Alembic manages schema migrations for the QVAC SQLite/PostgreSQL database.

## Usage

```bash
cd qvac
alembic upgrade head
alembic revision --autogenerate -m "describe migration"
```

See `alembic.ini` for the database URL configuration.
