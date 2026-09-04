"""Helpers for discovering models from OpenAI-compatible providers."""

from typing import Any


def build_models_url(base_url: str) -> str:
    normalized = (base_url or "").strip().rstrip("/")
    if not normalized:
        raise ValueError("API 地址不能为空")
    return f"{normalized}/models"


def parse_models_response(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    rows = payload.get("data")
    if not isinstance(rows, list):
        return []
    model_ids = {
        str(row.get("id")).strip()
        for row in rows
        if isinstance(row, dict) and row.get("id")
    }
    return sorted(model_ids)
