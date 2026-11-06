"""Server-side translations for text produced by the backend.

Stored rows keep stable keys (for example ``issue.nutrient_deficiency``) rather than
sentences, so one record reads correctly in every interface language and in PDF reports.
"""

from app.core.i18n_catalog import CATALOG

LANGUAGES = ("en", "ru", "kk")
DEFAULT_LANG = "en"


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def resolve_lang(header: str | None) -> str:
    """Pick the language from an Accept-Language style header value."""
    if header:
        for part in header.split(","):
            code = part.split(";")[0].strip().lower()[:2]
            if code in LANGUAGES:
                return code
    return DEFAULT_LANG


def t(key: str, lang: str = DEFAULT_LANG, **params: object) -> str:
    """Translate a key. Unknown keys are returned as-is so literals pass through."""
    entry = CATALOG.get(key)
    if entry is None:
        return key
    text = entry.get(lang) or entry[DEFAULT_LANG]
    return text.format_map(_SafeDict(params)) if params else text


def t_params(key: str, lang: str, params: dict | None) -> str:
    """Translate with params, also translating values that are themselves keys."""
    resolved = {k: t(v, lang) if isinstance(v, str) else v for k, v in (params or {}).items()}
    return t(key, lang, **resolved)
