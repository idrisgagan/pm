"""Calls to the AI model through OpenRouter, and the temporary /api/ai/ping
route that checks the connection (removed in Part 9)."""

import os
from typing import Annotated

import httpx2
import openai
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import current_user

MODEL = "openai/gpt-oss-120b"
BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT_SECONDS = 30

# Tests set this to a client on a fake transport. None means the SDK's own.
http_client: httpx2.Client | None = None


class NotConfigured(Exception):
    pass


class AIError(Exception):
    pass


def _client() -> openai.OpenAI:
    # Read at call time, so the app starts without a key.
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise NotConfigured("AI is not configured: OPENROUTER_API_KEY is not set.")
    # No retries, so a failing call gives up within the timeout.
    return openai.OpenAI(
        api_key=api_key,
        base_url=BASE_URL,
        timeout=TIMEOUT_SECONDS,
        max_retries=0,
        http_client=http_client,
    )


def complete(prompt: str) -> str:
    try:
        response = _client().chat.completions.create(
            model=MODEL, messages=[{"role": "user", "content": prompt}]
        )
    # APITimeoutError is a kind of APIConnectionError, so it goes first.
    except openai.APITimeoutError as exc:
        raise AIError("The AI service took too long to answer.") from exc
    except openai.APIConnectionError as exc:
        raise AIError("Could not reach the AI service.") from exc
    except openai.APIStatusError as exc:
        raise AIError(f"The AI service returned an error ({exc.status_code}).") from exc
    return response.choices[0].message.content or ""


router = APIRouter(prefix="/api/ai")


class Answer(BaseModel):
    answer: str


@router.post("/ping")
def ping(username: Annotated[str, Depends(current_user)]) -> Answer:
    return Answer(answer=complete("What is 2+2?"))
