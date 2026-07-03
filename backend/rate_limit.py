"""In-memory sliding-window rate limiter.

Single-process por diseño: la app corre como UNA instancia de uvicorn
(ver render.yaml / .do/app.yaml, instance_count: 1). Si escalás a varios
workers o instancias, reemplazá el store por Redis manteniendo la misma
interfaz de `check()`.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        """Registra un hit para `key` y levanta 429 si superó `limit`
        dentro de la ventana deslizante."""
        now = time.monotonic()
        hits = self._hits[key]
        cutoff = now - window_seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= limit:
            retry_after = max(1, int(hits[0] + window_seconds - now) + 1)
            raise HTTPException(
                status_code=429,
                detail="Demasiados intentos. Probá de nuevo en unos minutos.",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    """IP del cliente, respetando el proxy del PaaS (primer hop de
    X-Forwarded-For). Suficiente para frenar fuerza bruta; no es una
    identidad fuerte."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
