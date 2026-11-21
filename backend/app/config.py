"""Settings read from the environment. OPENROUTER_API_KEY is the exception:
ai.py reads it on each call, so the app starts without it."""

import logging
import os
import secrets
from pathlib import Path

logger = logging.getLogger(__name__)

# The built frontend. The Docker image sets PM_STATIC_DIR; locally it is
# frontend/out after `npm run build`.
STATIC_DIR = Path(
    os.environ.get(
        "PM_STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)


def session_secret() -> str:
    secret = os.environ.get("PM_SESSION_SECRET")
    if secret:
        return secret
    logger.warning(
        "PM_SESSION_SECRET is not set. Using a random secret, so sessions end "
        "when the app restarts."
    )
    return secrets.token_urlsafe(32)
