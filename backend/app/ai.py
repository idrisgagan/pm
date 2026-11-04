"""Calls to the AI model through OpenRouter."""

import os

import httpx2
import openai
import pydantic
from openai.types.chat import ChatCompletionMessageParam

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


def ask[T: pydantic.BaseModel](messages: list[ChatCompletionMessageParam], output: type[T]) -> T:
    """Send the messages and return the reply parsed into `output`, using
    JSON-schema structured output."""
    try:
        response = _client().chat.completions.parse(
            model=MODEL,
            messages=messages,
            response_format=output,
            # Route only to providers that support structured output.
            extra_body={"provider": {"require_parameters": True}},
        )
    # APITimeoutError is a kind of APIConnectionError, so it goes first.
    except openai.APITimeoutError as exc:
        raise AIError("The AI service took too long to answer.") from exc
    except openai.APIConnectionError as exc:
        raise AIError("Could not reach the AI service.") from exc
    except openai.APIStatusError as exc:
        raise AIError(f"The AI service returned an error ({exc.status_code}).") from exc
    except (
        pydantic.ValidationError,
        openai.LengthFinishReasonError,
        openai.ContentFilterFinishReasonError,
    ) as exc:
        raise AIError("The AI service gave an answer the app could not read.") from exc
    parsed = response.choices[0].message.parsed
    if parsed is None:
        raise AIError("The AI service gave an answer the app could not read.")
    return parsed
