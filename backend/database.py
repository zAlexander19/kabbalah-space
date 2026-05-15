from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def get_session_factory():
    """Returns the async sessionmaker callable. Used by BackgroundTasks /
    asyncio.create_task that run outside the request lifecycle and need to
    open their own DB session.

    Usage:
        async with get_session_factory()() as db:
            ...
    """
    return AsyncSessionLocal