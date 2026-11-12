"""
Chronos In-Memory Sliding-Window Rate Limiter
"""
import collections
import threading
import time
from typing import Callable, Deque, Dict, Optional, Tuple
from fastapi import HTTPException, Request, Response, status
from chronos_logging import get_logger

logger = get_logger("chronos.rate_limiter")


class SlidingWindowRateLimiter:
    """Thread-safe sliding-window rate limiter with sub-second accuracy."""

    def __init__(self):
        # Key: (rate_key, endpoint_identifier) -> Deque of timestamps
        self._history: Dict[Tuple[str, str], Deque[float]] = collections.defaultdict(collections.deque)
        self._lock = threading.Lock()

    def check_rate_limit(
        self,
        key: str,
        endpoint_id: str,
        max_requests: int,
        window_seconds: int,
    ) -> Tuple[bool, int, int]:
        """
        Check if request exceeds rate limit.
        Returns: (is_allowed, remaining_requests, retry_after_seconds)
        """
        now = time.time()
        window_start = now - window_seconds
        map_key = (key, endpoint_id)

        with self._lock:
            dq = self._history[map_key]
            # Evict timestamps older than window
            while dq and dq[0] < window_start:
                dq.popleft()

            current_count = len(dq)
            if current_count >= max_requests:
                oldest_ts = dq[0]
                retry_after = max(1, int(oldest_ts + window_seconds - now))
                return False, 0, retry_after

            dq.append(now)
            remaining = max(0, max_requests - len(dq))
            return True, remaining, 0

    def reset(self):
        with self._lock:
            self._history.clear()


limiter = SlidingWindowRateLimiter()


def rate_limit(
    max_requests: int,
    window_seconds: int = 60,
    key_func: Optional[Callable[[Request], str]] = None,
):
    """FastAPI dependency for sliding-window rate limiting."""
    async def dependency(request: Request, response: Response):
        client_ip = request.client.host if request.client else "unknown_ip"
        key = key_func(request) if key_func else client_ip
        endpoint_id = f"{request.method}:{request.url.path}"

        allowed, remaining, retry_after = limiter.check_rate_limit(
            key=key,
            endpoint_id=endpoint_id,
            max_requests=max_requests,
            window_seconds=window_seconds,
        )

        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        if not allowed:
            response.headers["Retry-After"] = str(retry_after)
            logger.warning(
                "Rate limit exceeded",
                extra={
                    "event_type": "RATE_LIMIT_EXCEEDED",
                    "outcome": "DENIED",
                    "data": {"key": key, "endpoint": endpoint_id, "retry_after": retry_after},
                },
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

    return dependency
