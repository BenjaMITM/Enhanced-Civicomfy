# ================================================
# File: server/routes/TagState.py
# ================================================
import json
import os
from aiohttp import web

import server
from ...config import PLUGIN_ROOT

prompt_server = server.PromptServer.instance

TAG_STATE_FILE = os.path.join(PLUGIN_ROOT, "tag_state.json")


def _load_tag_state():
    if not os.path.exists(TAG_STATE_FILE):
        return {
            "custom_tags": {},
            "active_tag_filters": [],
            "tag_filter_logic": "and",
            "civitai_tag_filters": [],
            "civitai_exclude_tag_filters": [],
            "civitai_tag_filter_logic": "and",
        }

    try:
        with open(TAG_STATE_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, dict):
                return {
                    "custom_tags": data.get("custom_tags", {}) if isinstance(data.get("custom_tags", {}), dict) else {},
                    "active_tag_filters": data.get("active_tag_filters", []) if isinstance(data.get("active_tag_filters", []), list) else [],
                    "tag_filter_logic": data.get("tag_filter_logic", "and") if data.get("tag_filter_logic", "and") in {"and", "or"} else "and",
                    "civitai_tag_filters": data.get("civitai_tag_filters", []) if isinstance(data.get("civitai_tag_filters", []), list) else [],
                    "civitai_exclude_tag_filters": data.get("civitai_exclude_tag_filters", []) if isinstance(data.get("civitai_exclude_tag_filters", []), list) else [],
                    "civitai_tag_filter_logic": data.get("civitai_tag_filter_logic", "and") if data.get("civitai_tag_filter_logic", "and") in {"and", "or"} else "and",
                }
    except Exception as e:
        print(f"[Civicomfy] Warning: Failed to load tag state: {e}")

    return {
        "custom_tags": {},
        "active_tag_filters": [],
        "tag_filter_logic": "and",
        "civitai_tag_filters": [],
        "civitai_exclude_tag_filters": [],
        "civitai_tag_filter_logic": "and",
    }


def _save_tag_state(state):
    try:
        os.makedirs(PLUGIN_ROOT, exist_ok=True)
        with open(TAG_STATE_FILE, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Civicomfy] Error writing tag state file: {e}")
        return False


@prompt_server.routes.get("/civitai/tag_state")
async def route_get_tag_state(request):
    """Load persisted tag filters and custom tags."""
    return web.json_response(_load_tag_state())


@prompt_server.routes.post("/civitai/tag_state")
async def route_save_tag_state(request):
    """Persist tag filters and custom tags."""
    try:
        data = await request.json()
        state = {
            "custom_tags": data.get("custom_tags", {}) if isinstance(data.get("custom_tags", {}), dict) else {},
            "active_tag_filters": data.get("active_tag_filters", []) if isinstance(data.get("active_tag_filters", []), list) else [],
            "tag_filter_logic": data.get("tag_filter_logic", "and") if data.get("tag_filter_logic", "and") in {"and", "or"} else "and",
            "civitai_tag_filters": data.get("civitai_tag_filters", []) if isinstance(data.get("civitai_tag_filters", []), list) else [],
            "civitai_exclude_tag_filters": data.get("civitai_exclude_tag_filters", []) if isinstance(data.get("civitai_exclude_tag_filters", []), list) else [],
            "civitai_tag_filter_logic": data.get("civitai_tag_filter_logic", "and") if data.get("civitai_tag_filter_logic", "and") in {"and", "or"} else "and",
        }
        if _save_tag_state(state):
            return web.json_response({"success": True})
        return web.json_response({"success": False, "error": "Failed to save tag state"}, status=500)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)