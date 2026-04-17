"""Create MVP users and lot_status tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260411_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.String(length=100), nullable=False),
        sa.Column("employee_number", sa.String(length=50), nullable=True),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("auth", sa.String(length=50), nullable=False, server_default="ENGINEER"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("employee_id"),
    )
    op.create_index("ix_users_employee_id", "users", ["employee_id"], unique=False)

    op.create_table(
        "lot_status",
        sa.Column("lot_id", sa.String(length=100), primary_key=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("equipment", sa.String(length=100), nullable=True),
        sa.Column("process_step", sa.String(length=100), nullable=True),
        sa.Column("hold_comment", sa.Text(), nullable=True),
        sa.Column("hold_operator_id", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_lot_status_status", "lot_status", ["status"], unique=False)
    op.create_index(
        "ix_lot_status_hold_operator_id",
        "lot_status",
        ["hold_operator_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_lot_status_hold_operator_id", table_name="lot_status")
    op.drop_index("ix_lot_status_status", table_name="lot_status")
    op.drop_table("lot_status")
    op.drop_index("ix_users_employee_id", table_name="users")
    op.drop_table("users")
