"""The contract for the farm assistant."""

from abc import ABC, abstractmethod


class AssistantProvider(ABC):
    provider_id: str
    is_demo: bool

    @abstractmethod
    def reply(self, context: dict, history: list[dict], question: str, lang: str) -> str:
        """Answer using farm context. ``history`` holds {"role", "content"} oldest first."""
