"""Application errors. Each carries a stable code that is translated for the client."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.i18n import resolve_lang, t

log = logging.getLogger("zerno.errors")


class ApiError(Exception):
    def __init__(self, status: int, code: str, **params: object) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.params = params


def not_found(what: str = "resource") -> ApiError:
    return ApiError(404, "not_found", what=what)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        lang = resolve_lang(request.headers.get("accept-language"))
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "detail": t(f"error.{exc.code}", lang, **exc.params)},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        lang = resolve_lang(request.headers.get("accept-language"))
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"code": "validation", "detail": t("error.validation", lang), "fields": fields},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        lang = resolve_lang(request.headers.get("accept-language"))
        return JSONResponse(
            status_code=500, content={"code": "internal", "detail": t("error.internal", lang)}
        )
