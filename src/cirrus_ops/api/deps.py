"""Shared dependencies for the Cirrus Ops API."""

from cirrus_ops import db


def get_db():
    """Return the DB module. Placeholder for future dependency injection."""
    return db
