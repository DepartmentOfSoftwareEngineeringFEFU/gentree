"""Create or promote a user to the ADMIN role.

Usage:
    python -m app.scripts.create_admin <email> <password>

If a user with the given email already exists, it is promoted to ADMIN
and its password is updated. Otherwise a new ADMIN user is created.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.enums import UserRole, UserStatus
from app.models.user import User


async def create_admin(email: str, password: str) -> None:
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(email=email, role=UserRole.ADMIN, status=UserStatus.ACTIVE)
            session.add(user)
            action = "created"
        else:
            user.role = UserRole.ADMIN
            user.status = UserStatus.ACTIVE
            action = "promoted"
        user.hashed_password = hash_password(password)
        await session.commit()
        print(f"Admin user {action}: {email}")


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python -m app.scripts.create_admin <email> <password>")
        sys.exit(1)
    asyncio.run(create_admin(sys.argv[1], sys.argv[2]))


if __name__ == "__main__":
    main()
