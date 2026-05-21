"""FastAPI dependencies for premium gating.

Use require_premium on any endpoint that should be premium-only:

    from billing.dependencies import require_premium

    @app.post("/some-premium-feature")
    async def feature(user: Usuario = Depends(require_premium)):
        ...

Returns 402 Payment Required when the user lacks an active or trial subscription.
The detail dict shape: {"error": "premium_required", "reason": "feature_premium_only"}.

For per-feature gating with a specific reason (e.g., actividad_limit, recurrence_premium,
free_reflection_limit), raise HTTPException(402, {...}) inline in the endpoint instead of
using this dependency. require_premium is for endpoints that are simply "you must be premium
to call this at all".
"""
from fastapi import Depends, HTTPException

from auth import get_current_user
from models import Usuario


async def require_premium(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not current_user.is_premium:
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "reason": "feature_premium_only"},
        )
    return current_user
