import enum


class UserRole(str, enum.Enum):
    USER = "USER"
    GENEALOGIST = "GENEALOGIST"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"


class ProfileStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class PersonSex(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    UNKNOWN = "UNKNOWN"


class RelationshipType(str, enum.Enum):
    PARENT_CHILD = "PARENT_CHILD"
    SPOUSE = "SPOUSE"
    OTHER = "OTHER"


class FactType(str, enum.Enum):
    BIRTH = "BIRTH"
    DEATH = "DEATH"
    MARRIAGE = "MARRIAGE"
    RESIDENCE = "RESIDENCE"
    SERVICE = "SERVICE"
    NOTE = "NOTE"


class FactConfidence(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    HYPOTHESIS = "HYPOTHESIS"
    PROBABLE = "PROBABLE"
    CONFIRMED = "CONFIRMED"


class ArchiveRequestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PREPARED = "PREPARED"
    SENT = "SENT"
    IN_PROGRESS = "IN_PROGRESS"
    NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION"
    RESPONSE_RECEIVED = "RESPONSE_RECEIVED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ArchiveTemplateType(str, enum.Enum):
    GENERAL_ARCHIVE = "GENERAL_ARCHIVE"
    MILITARY_ARCHIVE = "MILITARY_ARCHIVE"
    CIVIL_REGISTRY = "CIVIL_REGISTRY"
    MEDICAL_ARCHIVE = "MEDICAL_ARCHIVE"
    PERSONNEL_ARCHIVE = "PERSONNEL_ARCHIVE"
    RESIDENCE_PROPERTY_ARCHIVE = "RESIDENCE_PROPERTY_ARCHIVE"
    CUSTOM = "CUSTOM"


class TemplateFieldDataType(str, enum.Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    DATE = "date"
    YEAR = "year"
    NUMBER = "number"
    SELECT = "select"
    CHECKBOX = "checkbox"


class TemplateFieldCategory(str, enum.Enum):
    PERSON = "person"
    APPLICANT = "applicant"
    ARCHIVE = "archive"
    MILITARY = "military"
    MEDICAL = "medical"
    RESIDENCE = "residence"
    DOCUMENT = "document"
    CUSTOM = "custom"


class ArchiveTemplateBlockType(str, enum.Enum):
    HEADER_RIGHT = "HEADER_RIGHT"
    HEADER_LEFT = "HEADER_LEFT"
    TITLE = "TITLE"
    BODY = "BODY"
    ATTACHMENTS = "ATTACHMENTS"
    FOOTER = "FOOTER"
    CUSTOM_BLOCK = "CUSTOM_BLOCK"


class GeneratedArchiveRequestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PREPARED = "PREPARED"
    EXPORTED = "EXPORTED"
    SENT_OUTSIDE_SYSTEM = "SENT_OUTSIDE_SYSTEM"
    RESPONSE_RECEIVED = "RESPONSE_RECEIVED"
    CANCELLED = "CANCELLED"


class DocumentKind(str, enum.Enum):
    ARCHIVE_SCAN = "ARCHIVE_SCAN"
    REQUEST_DRAFT = "REQUEST_DRAFT"
    REQUEST_FINAL = "REQUEST_FINAL"
    BOOK_RESULT = "BOOK_RESULT"
    ATTACHMENT = "ATTACHMENT"


class DocumentSourceType(str, enum.Enum):
    USER_UPLOAD = "USER_UPLOAD"
    GENEALOGIST_UPLOAD = "GENEALOGIST_UPLOAD"
    SYSTEM_GENERATED = "SYSTEM_GENERATED"
    ARCHIVE_RECEIVED = "ARCHIVE_RECEIVED"


class NotificationType(str, enum.Enum):
    REQUEST_ASSIGNED = "REQUEST_ASSIGNED"
    REQUEST_STATUS_CHANGED = "REQUEST_STATUS_CHANGED"
    REQUEST_NEEDS_CLARIFICATION = "REQUEST_NEEDS_CLARIFICATION"
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED"
    BOOK_READY = "BOOK_READY"
    SYSTEM = "SYSTEM"


class BookStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
