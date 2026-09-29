"""Stale-snapshot refresh for instances that outlive the nightly update."""

from pathlib import Path

import pytest

from deanos_engine.data import Snapshot, get_snapshot, save_snapshot, set_snapshot
from deanos_engine.data import snapshot as snapmod


class FakeRemote:
    """Stands in for the release asset: serves a file with an ETag, or 304."""

    def __init__(self, tmp: Path, snap: Snapshot) -> None:
        self.tmp = tmp
        self.version = 1
        self.snap = snap
        self.calls: list[str | None] = []
        self.fail = False

    def download(self, url: str, etag: str | None) -> tuple[Path | None, str | None]:
        self.calls.append(etag)
        if self.fail:
            raise OSError("network down")
        current = f'"v{self.version}"'
        if etag == current:
            return None, etag
        path = self.tmp / f"snap{self.version}-{len(self.calls)}.npz"
        meta = {**self.snap.meta, "version": self.version}
        save_snapshot(Snapshot(self.snap.prices, self.snap.factors, meta), path)
        return path, current


@pytest.fixture()
def remote(tmp_path: Path, snapshot: Snapshot, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    small = Snapshot(snapshot.prices.iloc[-300:], snapshot.factors.iloc[-300:], {"universe": {}})
    r = FakeRemote(tmp_path, small)
    clock = {"t": 1000.0}
    monkeypatch.setattr(snapmod, "_download", r.download)
    monkeypatch.setattr(snapmod, "_now", lambda: clock["t"])
    monkeypatch.delenv("DEANOS_DATA_PATH", raising=False)
    monkeypatch.setenv("DEANOS_DATA_URL", "https://example.invalid/snapshot.npz")
    monkeypatch.setenv("DEANOS_DATA_TTL_HOURS", "6")
    set_snapshot(None)
    snapmod._cached = None
    snapmod._retry_after = 0.0
    r.clock = clock  # type: ignore[attr-defined]
    yield r
    set_snapshot(None)


def test_loads_once_then_reuses_within_ttl(remote: FakeRemote) -> None:
    assert get_snapshot().meta["version"] == 1
    remote.clock["t"] += 3600  # type: ignore[attr-defined]
    get_snapshot()
    assert remote.calls == [None]


def test_unchanged_remote_is_a_conditional_check(remote: FakeRemote) -> None:
    get_snapshot()
    remote.clock["t"] += 7 * 3600  # type: ignore[attr-defined]
    assert get_snapshot().meta["version"] == 1
    assert remote.calls == [None, '"v1"']


def test_new_version_is_swapped_in_after_ttl(remote: FakeRemote) -> None:
    get_snapshot()
    remote.version = 2
    remote.clock["t"] += 7 * 3600  # type: ignore[attr-defined]
    assert get_snapshot().meta["version"] == 2


def test_failed_refresh_keeps_serving_and_backs_off(remote: FakeRemote) -> None:
    get_snapshot()
    remote.fail = True
    remote.clock["t"] += 7 * 3600  # type: ignore[attr-defined]
    assert get_snapshot().meta["version"] == 1
    n = len(remote.calls)
    remote.clock["t"] += 60  # type: ignore[attr-defined]
    get_snapshot()
    assert len(remote.calls) == n  # backing off
    remote.fail = False
    remote.version = 2
    remote.clock["t"] += 16 * 60  # type: ignore[attr-defined]
    assert get_snapshot().meta["version"] == 2
