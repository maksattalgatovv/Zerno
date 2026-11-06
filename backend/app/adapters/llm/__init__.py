from functools import lru_cache

from app.adapters.llm.base import AssistantProvider
from app.adapters.llm.demo import DemoAssistant
from app.core.config import get_settings


@lru_cache
def get_assistant() -> AssistantProvider:
    settings = get_settings()
    if settings.anthropic_api_key:
        from app.adapters.llm.claude import ClaudeAssistant

        return ClaudeAssistant(settings.anthropic_api_key, settings.assistant_model)
    return DemoAssistant()
