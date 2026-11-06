"""Claude-powered assistant, active when ANTHROPIC_API_KEY is configured."""

import json

import anthropic

from app.adapters.llm.base import AssistantProvider

LANGUAGE_NAMES = {"en": "English", "ru": "Russian", "kk": "Kazakh"}

SYSTEM_PROMPT = """You are ZERNO's farm assistant, helping farmers in Kazakhstan.
Use plain language that someone without technical training understands, and keep answers
short and practical. Base statements about this farm on the farm data provided. Say so
when the data doesn't cover something. The data may be labelled as demo or simulated: if
so, mention that when it matters. You can't see the field, so present causes as
possibilities to check on the ground, and suggest an agronomist before any chemical
treatment."""


class ClaudeAssistant(AssistantProvider):
    is_demo = False

    def __init__(self, api_key: str, model: str) -> None:
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.provider_id = f"anthropic:{model}"

    def reply(self, context: dict, history: list[dict], question: str, lang: str) -> str:
        system = (
            f"{SYSTEM_PROMPT}\n\nAlways answer in {LANGUAGE_NAMES.get(lang, 'English')}.\n\n"
            f"Farm data (JSON):\n{json.dumps(context, ensure_ascii=False)}"
        )
        response = self.client.beta.messages.create(
            model=self.model,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=system,
            messages=[*history, {"role": "user", "content": question}],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("The assistant model declined this request")
        text = "".join(block.text for block in response.content if block.type == "text")
        if not text:
            raise RuntimeError("The assistant model returned no text")
        return text
