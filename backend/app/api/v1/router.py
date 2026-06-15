from fastapi import APIRouter

from app.modules.archive_requests.router import router as archive_requests_router
from app.modules.auth.router import router as auth_router
from app.modules.books.router import router as books_router
from app.modules.documents.router import router as documents_router
from app.modules.facts.router import router as facts_router
from app.modules.generated_requests.router import router as generated_requests_router
from app.modules.notifications.router import router as notifications_router
from app.modules.persons.router import router as persons_router
from app.modules.profiles.router import router as profiles_router
from app.modules.relationships.router import router as relationships_router
from app.modules.templates.router import router as templates_router
from app.modules.users.router import router as users_router
from app.schemas.health import HealthcheckResponse

router = APIRouter()


@router.get("/health", tags=["system"], response_model=HealthcheckResponse)
async def healthcheck() -> HealthcheckResponse:
    return HealthcheckResponse(status="ok", service="gentree-backend")


router.include_router(auth_router)
router.include_router(users_router)
router.include_router(profiles_router)
router.include_router(persons_router)
router.include_router(relationships_router)
router.include_router(facts_router)
router.include_router(archive_requests_router)
router.include_router(documents_router)
router.include_router(notifications_router)
router.include_router(books_router)
router.include_router(templates_router)
router.include_router(generated_requests_router)
