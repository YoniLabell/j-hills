from app.auth.security import create_access_token, hash_password, verify_password
from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_password_hashing():
    h = hash_password("a-long-password")
    assert h != "a-long-password"
    assert verify_password("a-long-password", h)
    assert not verify_password("wrong-password", h)


def test_admin_endpoints_require_authentication(client):
    for method, path in [
        ("get", "/api/admin/apartments"),
        ("post", "/api/admin/apartments"),
        ("get", "/api/admin/bookings"),
        ("get", "/api/admin/inquiries"),
        ("get", "/api/admin/settings"),
        ("put", "/api/admin/settings"),
        ("post", "/api/admin/apartments/1/sync-calendar"),
        ("delete", "/api/admin/images/1"),
        ("get", "/api/admin/dashboard"),
    ]:
        r = getattr(client, method)(path)
        assert r.status_code == 401, (method, path, r.status_code)


def test_login_sets_httponly_cookie_and_grants_access(client, admin_user):
    r = client.post("/api/admin/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert client.get("/api/admin/me").json()["email"] == ADMIN_EMAIL
    assert client.get("/api/admin/dashboard").status_code == 200


def test_bearer_token_also_works(client, admin_user):
    token = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()[
        "access_token"
    ]
    client.cookies.clear()
    assert client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_wrong_password_and_unknown_user(client, admin_user):
    assert (
        client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": "wrong-password"}).status_code
        == 401
    )
    assert (
        client.post(
            "/api/admin/login", json={"email": "nobody@example.com", "password": ADMIN_PASSWORD}
        ).status_code
        == 401
    )


def test_expired_and_forged_tokens_rejected(client, admin_user):
    expired, _ = create_access_token(admin_user.id, expires_minutes=-1)
    assert client.get("/api/admin/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    import jwt

    forged = jwt.encode(
        {"sub": str(admin_user.id), "exp": 9999999999, "typ": "admin"},
        "wrong-secret-wrong-secret-wrong-secret-xx",
        algorithm="HS256",
    )
    assert client.get("/api/admin/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_inactive_user_cannot_access(client, db, admin_user):
    token, _ = create_access_token(admin_user.id)
    admin_user.is_active = False
    db.commit()
    assert client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert (
        client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).status_code
        == 401
    )


def test_logout_clears_cookie(admin_client):
    assert admin_client.post("/api/admin/logout").status_code == 204
    assert admin_client.get("/api/admin/me").status_code == 401


def test_login_rate_limited(client, admin_user):
    codes = [
        client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": "wrong-password"}).status_code
        for _ in range(12)
    ]
    assert 429 in codes


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
