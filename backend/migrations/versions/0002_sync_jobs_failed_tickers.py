"""sync_jobs.failed_tickers: per-job count of tickers whose sync failed

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sync_jobs",
        sa.Column("failed_tickers", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("sync_jobs", "failed_tickers")
