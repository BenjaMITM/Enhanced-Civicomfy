# ================================================
# File: server/routes/GetBaseModels.py
# ================================================
from aiohttp import web
import server # ComfyUI server instance
from ...config import AVAILABLE_MEILI_BASE_MODELS
from ...api.civitai import CivitaiAPI

prompt_server = server.PromptServer.instance

@prompt_server.routes.get("/civitai/base_models")
async def route_get_base_models(request):
    """API Endpoint to get the known base model types for filtering."""
    try:
        api = CivitaiAPI(None)
        discovered = set()

        # Ask Meili for a very small public query and read the facet distribution.
        # This lets new base models appear without waiting for a config update.
        result = api.search_models_meili(query="", limit=1, page=1, nsfw=True, sort="Relevancy")
        if isinstance(result, dict):
            facet_distribution = result.get("facetDistribution") or {}
            for key in ("version.baseModel", "baseModel"):
                values = facet_distribution.get(key)
                if isinstance(values, dict):
                    discovered.update(value for value in values.keys() if isinstance(value, str) and value.strip())

        merged = sorted({*AVAILABLE_MEILI_BASE_MODELS, *discovered}, key=lambda value: value.lower())
        return web.json_response({"base_models": merged})
    except Exception as e:
        print(f"Error getting base model types: {e}")
        return web.json_response({"error": "Internal Server Error", "details": str(e), "status_code": 500}, status=500)