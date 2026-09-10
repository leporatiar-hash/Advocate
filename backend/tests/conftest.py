"""Shared pytest fixtures. Sets DATABASE_URL to a fresh temp SQLite file
before anything imports `main`/`database`, so tests never touch a real
database — this must happen before any other backend module is imported,
which is why it lives in pytest_configure rather than a fixture."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


def pytest_configure(config):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["SECRET_KEY"] = "test-secret"
    # Never let a test accidentally spend a real OpenAI call — every AI path
    # under test must exercise the deterministic fallback / validator, not a
    # live, non-deterministic completion.
    os.environ.pop("OPENAI_API_KEY", None)


@pytest.fixture(scope="session")
def app():
    import main  # import side effect: Base.metadata.create_all() on the temp DB
    return main.app


@pytest.fixture()
def db(app):
    from database import SessionLocal
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client(app):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def clinician_token(client):
    email = "test.clinician@example.com"
    resp = client.post("/auth/register", json={
        "email": email, "password": "testpass123", "name": "Test Clinician", "role": "clinician",
    })
    if resp.status_code != 200:
        resp = client.post("/auth/login", json={"email": email, "password": "testpass123"})
    return resp.json()["access_token"]
