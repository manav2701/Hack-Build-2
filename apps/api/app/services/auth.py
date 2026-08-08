"""User accounts — signup, login, and the token the web app and extension carry.

Deliberately dependency-free. Two constructions do all the work, both from the
standard library:

  * **Passwords** — PBKDF2-HMAC-SHA256, per-user random salt, stored as a single
    ``pbkdf2_sha256$iterations$salt$hash`` string. Verified with
    :func:`hmac.compare_digest`, so a wrong password costs the same time as a
    right one.
  * **Sessions** — a stateless HS256 JWT signed with ``JWT_SECRET``. Stateless
    because the browser, the Chrome extension and the API all live on different
    origins; a bearer token crosses those cleanly where a cookie does not.

Storage is SQLite through the stdlib ``sqlite3`` module, which means the API has
no new runtime dependency and no external database to provision. Note the
deployment consequence: a container filesystem is ephemeral, so on Railway the
accounts table survives restarts only if ``DALAL_DB_PATH`` points at a mounted
volume. That is documented, not hidden — see docs/DEPLOYMENT.md.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

PBKDF2_ITERATIONS = 240_000
SALT_BYTES = 16
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30          # 30 days: a demo user should not be logged out mid-event
MIN_PASSWORD_LENGTH = 8

_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")


class AuthError(Exception):
    """Anything the caller should turn into a 4xx. Carries its own status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------------------
# base64url (JWT uses the unpadded variant)
# ---------------------------------------------------------------------------

def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# ---------------------------------------------------------------------------
# passwords
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = os.urandom(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time check. A malformed stored hash is a failed login, not a crash."""
    try:
        algorithm, iterations, salt_b64, digest_b64 = (encoded or "").split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected = _b64d(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), _b64d(salt_b64), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(expected, actual)


# ---------------------------------------------------------------------------
# tokens (HS256 JWT)
# ---------------------------------------------------------------------------

def _secret() -> bytes:
    return settings.JWT_SECRET.encode("utf-8")


def mint_token(user_id: str, email: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    now = int(time.time())
    header = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64e(json.dumps(
        {"sub": user_id, "email": email, "iat": now, "exp": now + ttl_seconds},
        separators=(",", ":"),
    ).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = _b64e(hmac.new(_secret(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def read_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """The token's claims, or None if it is absent, malformed, forged or expired.

    Returns None rather than raising so an *optional* auth check (a voice job with no
    signed-in browser behind it) is an ordinary branch, not an exception path.
    """
    if not token or token.count(".") != 2:
        return None
    header_b64, payload_b64, signature_b64 = token.split(".")
    expected = hmac.new(_secret(), f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, _b64d(signature_b64)):
            return None
        claims = json.loads(_b64d(payload_b64))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(claims, dict) or not claims.get("sub"):
        return None
    if int(claims.get("exp", 0)) < int(time.time()):
        return None
    return claims


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Pull the raw token out of an ``Authorization: Bearer <token>`` header."""
    if not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


# ---------------------------------------------------------------------------
# storage
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS user_jobs (
    job_id     TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    dish       TEXT NOT NULL DEFAULT '',
    area       TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    verdict    TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_jobs_user ON user_jobs (user_id, created_at DESC);
"""


class UserStore:
    """Thread-safe SQLite access.

    FastAPI runs sync work on a threadpool, and ``sqlite3`` connections are not safe to
    share across threads by default, so one connection is guarded by a mutex. At this
    scale (a handful of auth calls per session) that is simpler and more predictable
    than a pool, and it keeps writes serialised.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None

    def _connect(self) -> sqlite3.Connection:
        if self._conn is not None:
            return self._conn
        directory = os.path.dirname(os.path.abspath(self.path))
        if directory:
            os.makedirs(directory, exist_ok=True)
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # WAL keeps a read during a write from blocking; harmless if the FS refuses it.
        try:
            conn.execute("PRAGMA journal_mode=WAL")
        except sqlite3.Error:
            pass
        conn.executescript(_SCHEMA)
        conn.commit()
        self._conn = conn
        logger.info("auth: user store ready at %s", self.path)
        return conn

    # -- users ----------------------------------------------------------------

    def create_user(self, email: str, password: str, name: str = "") -> Dict[str, Any]:
        email = (email or "").strip().lower()
        name = (name or "").strip()
        if not _EMAIL.match(email):
            raise AuthError("That does not look like a valid email address.", 422)
        if len(password or "") < MIN_PASSWORD_LENGTH:
            raise AuthError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", 422)

        record = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": name or email.split("@")[0],
            "password_hash": hash_password(password),
            "created_at": time.time(),
        }
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT INTO users (id, email, name, password_hash, created_at) "
                    "VALUES (:id, :email, :name, :password_hash, :created_at)",
                    record,
                )
                conn.commit()
            except sqlite3.IntegrityError:
                # 409, not 500: the address is taken. We say so plainly because signup is
                # already a public endpoint — enumeration is not meaningfully prevented by
                # a vague message here, and a confusing error costs every honest user.
                raise AuthError("An account with that email already exists. Try logging in.", 409)
        return self._public(record)

    def authenticate(self, email: str, password: str) -> Dict[str, Any]:
        row = self._find_by_email(email)
        # Hash regardless of whether the user exists so a missing account and a wrong
        # password take the same time and cannot be told apart by timing.
        stored = row["password_hash"] if row else hash_password("dummy-password-for-timing")
        if not verify_password(password or "", stored) or row is None:
            raise AuthError("Email or password is incorrect.", 401)
        return self._public(dict(row))

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._connect().execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        return self._public(dict(row)) if row else None

    def _find_by_email(self, email: str) -> Optional[sqlite3.Row]:
        with self._lock:
            return self._connect().execute(
                "SELECT * FROM users WHERE email = ?", ((email or "").strip().lower(),)
            ).fetchone()

    @staticmethod
    def _public(record: Dict[str, Any]) -> Dict[str, Any]:
        """The user as the client may see it — never the password hash."""
        return {
            "id": record["id"],
            "email": record["email"],
            "name": record.get("name") or "",
            "created_at": record.get("created_at"),
        }

    # -- craving history ------------------------------------------------------

    def attach_job(self, job_id: str, user_id: str, dish: str = "", area: str = "") -> None:
        with self._lock:
            conn = self._connect()
            conn.execute(
                "INSERT OR REPLACE INTO user_jobs (job_id, user_id, dish, area, created_at, verdict) "
                "VALUES (?, ?, ?, ?, ?, COALESCE((SELECT verdict FROM user_jobs WHERE job_id = ?), NULL))",
                (job_id, user_id, dish or "", area or "", time.time(), job_id),
            )
            conn.commit()

    def save_job_verdict(self, job_id: str, verdict: Dict[str, Any]) -> None:
        """Persist a finished verdict against whichever user started it, if any."""
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE user_jobs SET verdict = ? WHERE job_id = ?",
                (json.dumps(verdict), job_id),
            )
            conn.commit()

    def job_owner(self, job_id: str) -> Optional[str]:
        with self._lock:
            row = self._connect().execute(
                "SELECT user_id FROM user_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
        return row["user_id"] if row else None

    def history(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._connect().execute(
                "SELECT job_id, dish, area, created_at, verdict FROM user_jobs "
                "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, max(1, min(limit, 100))),
            ).fetchall()

        out: List[Dict[str, Any]] = []
        for row in rows:
            verdict = None
            if row["verdict"]:
                try:
                    verdict = json.loads(row["verdict"])
                except json.JSONDecodeError:
                    verdict = None
            out.append({
                "job_id": row["job_id"],
                "dish": row["dish"],
                "area": row["area"],
                "created_at": row["created_at"],
                "verdict": verdict,
            })
        return out

    def latest_job_for(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._connect().execute(
                "SELECT job_id, dish, area, created_at FROM user_jobs "
                "WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None


store = UserStore(settings.DALAL_DB_PATH)


def current_user(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    """The signed-in user for a request, or None. Never raises."""
    claims = read_token(bearer_token(authorization))
    if not claims:
        return None
    return store.get_user(str(claims["sub"]))


def require_user(authorization: Optional[str]) -> Dict[str, Any]:
    """The signed-in user, or an :class:`AuthError` the route turns into a 401."""
    user = current_user(authorization)
    if user is None:
        raise AuthError("Sign in to continue.", 401)
    return user
