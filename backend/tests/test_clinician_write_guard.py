"""Phase 2 test criterion: "A clinician token gets 403 on every write route.
Automated test that enumerates routes."

Iterates every registered POST/PUT/PATCH/DELETE route on the live app and
asserts a clinician token is rejected with 403 — not by checking a fixed,
hand-maintained list of paths, which would silently stop covering a route
added later. Two explicit exemptions, both intentional and read-only-safe:

- /auth/* — a clinician has to be able to log in, register, reset a
  password, and edit their own account. None of that touches caregiver data.
- /clinicians/redeem — the one write a clinician legitimately makes: the
  read-only enforcement is about clinicians never writing a CAREGIVER's
  data, not about the clinician router having zero POST handlers at all.

If a new write endpoint is added anywhere else without a require_not_clinician
(or equivalent) guard, this test starts failing for it automatically.
"""
import re

import pytest

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

EXEMPT_PREFIXES = ("/auth",)
EXEMPT_EXACT = {("POST", "/clinicians/redeem")}

# Substituted into any {param} path segment so a route can actually be
# called — the test only cares about the auth guard firing, not about the
# handler succeeding, so these values just need to be well-formed enough to
# route/parse (a real 403 must come back before any business logic runs).
PATH_PARAM_VALUES = {
    "date_str": "2026-01-01",
    "metric": "sleep",
    "instrument": "phq9",
}
DEFAULT_PATH_PARAM_VALUE = "1"


def _fill_path(path: str) -> str:
    def replace(match):
        name = match.group(1)
        return PATH_PARAM_VALUES.get(name, DEFAULT_PATH_PARAM_VALUE)
    return re.sub(r"\{([^}]+)\}", replace, path)


def _collect_write_routes(app):
    routes = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            continue
        for method in methods & WRITE_METHODS:
            if path.startswith(EXEMPT_PREFIXES):
                continue
            if (method, path) in EXEMPT_EXACT:
                continue
            routes.append((method, path))
    return sorted(set(routes))


def test_every_write_route_is_enumerated_and_nonempty(app):
    """Sanity check on the test itself: if this list is empty, every other
    assertion in this file passes vacuously and proves nothing."""
    routes = _collect_write_routes(app)
    assert len(routes) >= 15, f"expected at least 15 write routes, found {len(routes)}: {routes}"


@pytest.fixture()
def write_routes(app):
    return _collect_write_routes(app)


def test_clinician_token_gets_403_on_every_write_route(client, clinician_token, app):
    routes = _collect_write_routes(app)
    headers = {"Authorization": f"Bearer {clinician_token}"}
    failures = []
    for method, path in routes:
        url = _fill_path(path)
        resp = client.request(method, url, headers=headers, json={})
        if resp.status_code != 403:
            failures.append((method, path, resp.status_code))

    assert not failures, (
        "These write routes did NOT return 403 for a clinician token "
        "(method, path, actual status): " + repr(failures)
    )


def test_caregiver_token_is_not_blanket_blocked(client, app):
    """Control: the same guard must not accidentally reject a normal
    caregiver too — otherwise this test file would pass by blocking
    everyone, not by correctly scoping to the clinician role."""
    email = "write-guard-control.caregiver@example.com"
    resp = client.post("/auth/register", json={
        "email": email, "password": "testpass123", "name": "Control Caregiver", "role": "caregiver",
    })
    token = resp.json()["access_token"]

    resp = client.post(
        "/patients/",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Guard Control Patient", "diagnosis": "test"},
    )
    assert resp.status_code == 200, resp.text
