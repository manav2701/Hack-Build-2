"""Accounts: token integrity, password handling, and the endpoints' contract.

The token tests are the important ones. A session token is the only thing standing
between one user's craving history and everybody else's, and it is verified by code in
this repo rather than by a library — so forgery has to be tested explicitly, not
assumed.
"""

import base64
import json
import time

import pytest
from fastapi.testclient import TestClient

from app.services import auth


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A TestClient over a throwaway SQLite file, so tests never touch real accounts."""
    store = auth.UserStore(str(tmp_path / "test.db"))
    monkeypatch.setattr(auth, "store", store)

    # tools.py and db/supabase.py bind the store at import time.
    from app.api.routes import auth as auth_routes, tools as tools_routes

    monkeypatch.setattr(auth_routes, "store", store)
    monkeypatch.setattr(tools_routes, "user_store", store)

    from app.main import app

    return TestClient(app)


def _b64(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()


# ---------------------------------------------------------------- tokens

def test_valid_token_round_trips():
    claims = auth.read_token(auth.mint_token("user-1", "a@b.ae"))
    assert claims["sub"] == "user-1"
    assert claims["email"] == "a@b.ae"


@pytest.mark.parametrize(
    "token",
    [
        None,
        "",
        "not-a-token",
        "only.two",
        "a.b.c",
    ],
)
def test_malformed_tokens_are_rejected(token):
    assert auth.read_token(token) is None


def test_tampered_payload_is_rejected():
    header, _, signature = auth.mint_token("user-1", "a@b.ae").split(".")
    forged = f"{header}.{_b64({'sub': 'admin', 'exp': int(time.time()) + 999})}.{signature}"
    assert auth.read_token(forged) is None


def test_tampered_signature_is_rejected():
    token = auth.mint_token("user-1", "a@b.ae")
    assert auth.read_token(token[:-4] + "AAAA") is None


def test_alg_none_downgrade_is_rejected():
    """The classic JWT attack: swap the algorithm to "none" and drop the signature.

    We never read `alg` from the header — HS256 is assumed and the signature is always
    checked — so an unsigned token cannot authenticate anyone.
    """
    forged = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64({'sub': 'admin', 'exp': int(time.time()) + 999})}."
    assert auth.read_token(forged) is None


def test_expired_token_is_rejected():
    assert auth.read_token(auth.mint_token("user-1", "a@b.ae", ttl_seconds=-1)) is None


def test_token_signed_with_a_different_secret_is_rejected(monkeypatch):
    """Rotating JWT_SECRET must invalidate every outstanding session."""
    token = auth.mint_token("user-1", "a@b.ae")
    monkeypatch.setattr(auth.settings, "JWT_SECRET", "a-completely-different-secret")
    assert auth.read_token(token) is None


# ---------------------------------------------------------------- passwords

def test_password_hash_verifies_and_is_salted():
    encoded = auth.hash_password("correct-horse-battery")
    assert auth.verify_password("correct-horse-battery", encoded)
    assert not auth.verify_password("wrong-password", encoded)
    # The plaintext must not survive anywhere in the stored value.
    assert "correct-horse-battery" not in encoded
    # Two users with the same password get different hashes.
    assert auth.hash_password("same") != auth.hash_password("same")


def test_malformed_stored_hash_is_a_failed_login_not_a_crash():
    assert not auth.verify_password("anything", "garbage")
    assert not auth.verify_password("anything", "")


# ---------------------------------------------------------------- endpoints

def test_signup_returns_a_usable_session(client):
    res = client.post("/v1/auth/signup", json={"email": "Amin@Daleel.AE", "password": "wontons-in-jvc", "name": "Amin"})
    assert res.status_code == 201

    body = res.json()
    assert body["user"]["email"] == "amin@daleel.ae"        # normalised to lowercase
    assert "password" not in json.dumps(body)               # never echoed back

    me = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["user"]["id"] == body["user"]["id"]


def test_duplicate_signup_conflicts(client):
    client.post("/v1/auth/signup", json={"email": "a@b.ae", "password": "long-enough-1"})
    again = client.post("/v1/auth/signup", json={"email": "A@B.ae", "password": "long-enough-1"})
    assert again.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "long-enough-1"},
        {"email": "a@b.ae", "password": "short"},
    ],
)
def test_signup_validation(client, payload):
    assert client.post("/v1/auth/signup", json=payload).status_code == 422


def test_login_rejects_wrong_password_and_unknown_user(client):
    client.post("/v1/auth/signup", json={"email": "a@b.ae", "password": "long-enough-1"})
    assert client.post("/v1/auth/login", json={"email": "a@b.ae", "password": "long-enough-1"}).status_code == 200
    assert client.post("/v1/auth/login", json={"email": "a@b.ae", "password": "wrong-one-99"}).status_code == 401
    assert client.post("/v1/auth/login", json={"email": "ghost@b.ae", "password": "long-enough-1"}).status_code == 401


def test_protected_routes_require_a_token(client):
    for path in ("/v1/auth/me", "/v1/auth/history"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer forged.token.here"}).status_code == 401


def test_history_is_scoped_to_the_signed_in_user(client):
    """The whole point of the accounts layer: one user cannot read another's cravings."""
    alice = client.post("/v1/auth/signup", json={"email": "alice@b.ae", "password": "long-enough-1"}).json()
    bob = client.post("/v1/auth/signup", json={"email": "bob@b.ae", "password": "long-enough-1"}).json()

    a_headers = {"Authorization": f"Bearer {alice['token']}"}
    b_headers = {"Authorization": f"Bearer {bob['token']}"}

    client.post("/v1/tools/start_research", json={"dish": "biryani", "area": "JVC"}, headers=a_headers)

    alice_jobs = client.get("/v1/auth/history", headers=a_headers).json()["jobs"]
    bob_jobs = client.get("/v1/auth/history", headers=b_headers).json()["jobs"]

    assert len(alice_jobs) == 1 and alice_jobs[0]["dish"] == "biryani"
    assert bob_jobs == []


def test_latest_job_prefers_the_users_own_job(client):
    """A signed-in browser must not attach to a stranger's job.

    Newest-wins globally is fine for one demo user and wrong for two — you would watch
    someone else's verdict appear on your screen.
    """
    alice = client.post("/v1/auth/signup", json={"email": "alice2@b.ae", "password": "long-enough-1"}).json()
    a_headers = {"Authorization": f"Bearer {alice['token']}"}

    mine = client.post(
        "/v1/tools/start_research", json={"dish": "wontons", "area": "JVC"}, headers=a_headers
    ).json()["job_id"]

    # Someone else (or the voice agent) starts a newer, anonymous job afterwards.
    anonymous = client.post("/v1/tools/start_research", json={"dish": "burger", "area": "Marina"}).json()["job_id"]
    assert anonymous != mine

    assert client.get("/v1/tools/latest_job", headers=a_headers).json()["job_id"] == mine
    assert client.get("/v1/tools/latest_job").json()["job_id"] == anonymous


def test_anonymous_research_still_works(client):
    """The voice agent calls start_research from ElevenLabs' cloud with no token."""
    res = client.post("/v1/tools/start_research", json={"dish": "shawarma", "area": "Dubai"})
    assert res.status_code == 200
    assert res.json()["job_id"]
