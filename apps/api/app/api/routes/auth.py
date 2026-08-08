"""Account endpoints for the web app and the Chrome extension.

Both clients are separate origins from this API, so the session is a bearer token
rather than a cookie: the extension's popup can hold one in ``chrome.storage`` and
the web app in ``localStorage``, and neither needs a same-site relationship with
the backend.

These routes are NOT ElevenLabs webhook tools, so unlike ``/v1/tools/*`` they are
allowed to answer a real 4xx — no live conversation is listening.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Header, HTTPException
from pydantic import BaseModel, Field

from app.services.auth import AuthError, mint_token, require_user, store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["Accounts"])


class SignupBody(BaseModel):
    email: str = Field(examples=["amin@daleelbites.ae"])
    password: str = Field(min_length=1, examples=["a-strong-passphrase"])
    name: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


class SessionResponse(BaseModel):
    token: str
    user: dict


def _session(user: dict) -> SessionResponse:
    return SessionResponse(token=mint_token(user["id"], user["email"]), user=user)


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/signup", response_model=SessionResponse, status_code=201)
async def signup(body: SignupBody):
    """Create an account and return a session token in the same round trip.

    Signing up then immediately having to log in is friction with no security value,
    so the new account is signed in straight away.
    """
    try:
        user = store.create_user(body.email, body.password, body.name)
    except AuthError as exc:
        raise _http(exc)
    logger.info("auth: new account %s", user["email"])
    return _session(user)


@router.post("/login", response_model=SessionResponse)
async def login(body: LoginBody):
    try:
        user = store.authenticate(body.email, body.password)
    except AuthError as exc:
        raise _http(exc)
    return _session(user)


@router.get("/me")
async def me(authorization: Optional[str] = Header(None)):
    """Who this token belongs to. The clients call it on boot to restore a session."""
    try:
        return {"user": require_user(authorization)}
    except AuthError as exc:
        raise _http(exc)


@router.get("/history")
async def history(limit: int = 20, authorization: Optional[str] = Header(None)):
    """This user's past cravings, newest first, each with its finished verdict.

    Scoped by the token's subject — a user can only ever read their own rows.
    """
    try:
        user = require_user(authorization)
    except AuthError as exc:
        raise _http(exc)
    return {"jobs": store.history(user["id"], limit=limit)}


@router.post("/logout")
async def logout(_: Optional[dict] = Body(default=None)):
    """A courtesy endpoint. The token is stateless, so logging out is the client
    discarding it; this exists so the clients have one obvious call to make and so a
    future revocation list has a home."""
    return {"ok": True}
