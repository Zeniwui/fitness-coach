"""Centralized FastAPI exception handlers translating domain errors to HTTP responses."""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from fitness_coach.domain.coach import (
    AttachmentAlreadyLinkedError,
    CoachError,
    CoachValidationError,
    ConversationNotFoundError,
    InvalidProposalStateError,
    MessageNotFoundError,
    ProposalNotFoundError,
)

_COACH_ERROR_STATUS: dict[type[CoachError], int] = {
    ConversationNotFoundError: status.HTTP_404_NOT_FOUND,
    MessageNotFoundError: status.HTTP_404_NOT_FOUND,
    ProposalNotFoundError: status.HTTP_404_NOT_FOUND,
    InvalidProposalStateError: status.HTTP_409_CONFLICT,
    AttachmentAlreadyLinkedError: status.HTTP_409_CONFLICT,
    CoachValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register domain exception -> HTTP status handlers on the FastAPI app."""

    @app.exception_handler(CoachError)
    async def handle_coach_error(_request: Request, exc: CoachError) -> JSONResponse:
        status_code = _COACH_ERROR_STATUS.get(
            type(exc), status.HTTP_400_BAD_REQUEST
        )
        return JSONResponse(status_code=status_code, content={"detail": str(exc)})
