"""
Where the Streamlit app gets its data, and how it asks for fresh data.

The "Refresh pair data" GitHub Actions workflow (.github/workflows/) runs
pair_correlation.py and publishes the snapshot as assets on the "pair-data"
release. The app downloads it from there, and falls back to the snapshot
committed in data/ if it can't. Starting the workflow from the app needs a
GITHUB_TOKEN that can run Actions on the repo; everything else works without one.
"""

import io
import os

import pandas as pd
import requests

from pair_correlation import DATA_DIR

GITHUB_REPO = os.environ.get("GITHUB_REPO", "Bill-Cai-2005/Nodal")
GITHUB_API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
DATA_URL = os.environ.get(
    "PAIR_DATA_URL", f"https://github.com/{GITHUB_REPO}/releases/download/pair-data")
WORKFLOW = "refresh-pair-data.yml"
WORKFLOW_BRANCH = os.environ.get("PAIR_DATA_BRANCH", "master")
FILES = ("prices.parquet", "universe.parquet")

ACTIVE_STATUSES = {"queued", "in_progress", "waiting", "requested", "pending"}


def read_snapshot() -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """Returns (prices, universe, source): the published snapshot, or the committed one."""
    try:
        frames = []
        for name in FILES:
            r = requests.get(f"{DATA_URL}/{name}", timeout=30)
            r.raise_for_status()
            frames.append(pd.read_parquet(io.BytesIO(r.content)))
        return frames[0], frames[1], "published"
    except (requests.RequestException, OSError, ValueError):
        return (pd.read_parquet(DATA_DIR / FILES[0]), pd.read_parquet(DATA_DIR / FILES[1]),
                "committed")


def _api(method: str, path: str, **kwargs) -> requests.Response:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    r = requests.request(method, f"{GITHUB_API}/repos/{GITHUB_REPO}{path}", headers=headers,
                         timeout=15, **kwargs)
    r.raise_for_status()
    return r


def latest_run() -> dict | None:
    """The most recent run of the refresh workflow, or None if it has never run."""
    runs = _api("GET", f"/actions/workflows/{WORKFLOW}/runs", params={"per_page": 1})
    runs = runs.json()["workflow_runs"]
    if not runs:
        return None
    run = runs[0]
    return {
        "active": run["status"] in ACTIVE_STATUSES,
        "succeeded": run["conclusion"] == "success",
        "failed": run["status"] == "completed" and run["conclusion"] not in ("success", "cancelled"),
        "started": pd.Timestamp(run["created_at"]),
        "finished": pd.Timestamp(run["updated_at"]),
        "url": run["html_url"],
    }


def start_refresh() -> None:
    """Starts the refresh workflow. GitHub queues the run a few seconds later."""
    _api("POST", f"/actions/workflows/{WORKFLOW}/dispatches", json={"ref": WORKFLOW_BRANCH})
