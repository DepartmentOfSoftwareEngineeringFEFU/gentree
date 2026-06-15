from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import ArchiveRequestDocument, Document, PersonDocument
from app.repositories.base import SQLAlchemyRepository


class DocumentRepository(SQLAlchemyRepository[Document]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Document)

    async def get_by_id(self, document_id: UUID) -> Document | None:
        result = await self.session.execute(
            select(Document).where(Document.id == document_id)
        )
        return result.scalar_one_or_none()

    async def get_by_archive_request(self, archive_request_id: UUID) -> list[Document]:
        result = await self.session.execute(
            select(Document, ArchiveRequestDocument.relation_type)
            .join(ArchiveRequestDocument, ArchiveRequestDocument.document_id == Document.id)
            .where(ArchiveRequestDocument.archive_request_id == archive_request_id)
            .order_by(Document.created_at.desc())
        )
        docs: list[Document] = []
        for doc, relation_type in result.all():
            doc.archive_request_relation_type = relation_type
            docs.append(doc)
        return docs

    async def get_archive_request_ids(self, document_id: UUID) -> list[UUID]:
        result = await self.session.execute(
            select(ArchiveRequestDocument.archive_request_id).where(
                ArchiveRequestDocument.document_id == document_id
            )
        )
        return list(result.scalars().all())

    async def get_by_person(self, person_id: UUID) -> list[Document]:
        result = await self.session.execute(
            select(Document)
            .join(PersonDocument, PersonDocument.document_id == Document.id)
            .where(PersonDocument.person_id == person_id)
            .order_by(Document.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: object) -> Document:
        doc = Document(**kwargs)
        self.session.add(doc)
        await self.session.flush()
        return doc

    async def link_to_archive_request(
        self, document_id: UUID, archive_request_id: UUID, relation_type: str = "ATTACHMENT"
    ) -> None:
        link = ArchiveRequestDocument(
            archive_request_id=archive_request_id,
            document_id=document_id,
            relation_type=relation_type,
        )
        self.session.add(link)

    async def link_to_person(
        self, document_id: UUID, person_id: UUID, relation_type: str = "ATTACHMENT"
    ) -> None:
        link = PersonDocument(
            person_id=person_id,
            document_id=document_id,
            relation_type=relation_type,
        )
        self.session.add(link)

    async def commit_and_refresh(self, doc: Document) -> Document:
        await self.session.commit()
        await self.session.refresh(doc)
        return doc

    async def delete(self, doc: Document) -> None:
        await self.session.delete(doc)
        await self.session.commit()
