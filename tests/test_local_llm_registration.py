def test_reply_server_registers_local_llm_routes():
    from reply_server import app

    paths = set(app.openapi()["paths"])
    assert {
        "/api/local-llm/load-model",
        "/api/local-llm/config",
        "/api/local-llm/status",
        "/api/local-llm/chat",
        "/api/local-llm/unload-model",
    } <= paths


def test_reply_server_requires_login_for_local_llm_status():
    from fastapi.testclient import TestClient

    from reply_server import app

    response = TestClient(app).get("/api/local-llm/status")

    assert response.status_code == 401
    assert response.json()["detail"] == "未授权访问"
