from fastapi.testclient import TestClient

from deanos_engine.api import app

client = TestClient(app)


def test_health_reports_all_dependencies() -> None:
    body = client.get("/deanos/api/health").json()
    assert body["status"] == "ok"
    assert body["python"].startswith("3.13")
    assert set(body["dependencies"]) >= {"numpy", "scipy", "statsmodels", "hmmlearn", "arch"}


def test_spike_runs_every_library() -> None:
    body = client.get("/deanos/api/spike").json()
    assert set(body["seconds"]) == {
        "garch_fit",
        "hmm_fit",
        "gmm_fit",
        "ols_hac_fit",
        "bootstrap_5000x252",
    }


def test_routes_live_under_public_prefix() -> None:
    assert client.get("/health").status_code == 404
