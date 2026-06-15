"""Normalize archive request document links.

Revision ID: 9a1d5e7c3b20
Revises: f2b8c6d4a105
Create Date: 2026-06-14 00:00:00.000000
"""

from alembic import op


revision = "9a1d5e7c3b20"
down_revision = "f2b8c6d4a105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE documents AS d
        SET document_kind = 'ATTACHMENT',
            source_type = 'USER_UPLOAD'
        FROM archive_request_documents AS ard
        JOIN archive_requests AS ar ON ar.id = ard.archive_request_id
        WHERE d.id = ard.document_id
          AND ard.relation_type = 'ATTACHMENT'
          AND d.uploaded_by_user_id = ar.created_by_user_id
        """
    )
    op.execute(
        """
        UPDATE archive_request_documents AS ard
        SET relation_type = 'USER_ATTACHMENT'
        FROM archive_requests AS ar,
             documents AS d
        WHERE ar.id = ard.archive_request_id
          AND d.id = ard.document_id
          AND ard.relation_type = 'ATTACHMENT'
          AND d.uploaded_by_user_id = ar.created_by_user_id
        """
    )
    op.execute(
        """
        UPDATE documents AS d
        SET document_kind = 'ARCHIVE_SCAN',
            source_type = 'GENEALOGIST_UPLOAD'
        FROM archive_request_documents AS ard
        JOIN archive_requests AS ar ON ar.id = ard.archive_request_id
        WHERE d.id = ard.document_id
          AND ard.relation_type = 'ATTACHMENT'
          AND ar.assigned_genealogist_user_id IS NOT NULL
          AND d.uploaded_by_user_id = ar.assigned_genealogist_user_id
        """
    )
    op.execute(
        """
        UPDATE archive_request_documents AS ard
        SET relation_type = 'GENEALOGIST_RESULT'
        FROM archive_requests AS ar,
             documents AS d
        WHERE ar.id = ard.archive_request_id
          AND d.id = ard.document_id
          AND ard.relation_type = 'ATTACHMENT'
          AND ar.assigned_genealogist_user_id IS NOT NULL
          AND d.uploaded_by_user_id = ar.assigned_genealogist_user_id
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE archive_request_documents
        SET relation_type = 'ATTACHMENT'
        WHERE relation_type IN ('USER_ATTACHMENT', 'GENEALOGIST_RESULT')
        """
    )
