# ================================================
# File: server/routes/SearchModels.py
# ================================================
import json
import math
import re
import traceback
from aiohttp import web

import server # ComfyUI server instance
from ..utils import get_request_json
from ...api.civitai import CivitaiAPI
from ...config import CIVITAI_API_TYPE_MAP

prompt_server = server.PromptServer.instance

SEARCH_TYPE_ALIASES = {
     "checkpoint": ["Checkpoint"],
     "lora": ["LORA"],
     "locon": ["LoCon", "LORA"],
     "lycoris": ["LYCORIS", "LoCon", "LORA"],
     "vae": ["VAE"],
     "embedding": ["TextualInversion", "Embedding"],
     "hypernetwork": ["Hypernetwork"],
     "controlnet": ["Controlnet", "ControlNet"],
     "motionmodule": ["MotionModule", "Motion Module"],
     "poses": ["Poses", "Pose"],
     "wildcards": ["Wildcards", "Wildcard"],
     "upscaler": ["Upscaler", "Upscale Model", "Upscale Models"],
     "unet": ["UNET", "Unet", "U-Net"],
     "diffusion_models": ["UNET", "Checkpoint"],
     "diffusers": ["Diffusers"],
}


def _normalize_tags(value):
     if not value:
          return []
     if isinstance(value, str):
          raw_items = re.split(r"[\n,]+", value)
     elif isinstance(value, (list, tuple, set)):
          raw_items = list(value)
     else:
          return []

     cleaned = []
     seen = set()
     for item in raw_items:
          tag = item.strip() if isinstance(item, str) else ""
          if not tag:
               continue
          lowered = tag.lower()
          if lowered in seen:
               continue
          seen.add(lowered)
          cleaned.append(tag)
     return cleaned


def _hit_tag_names(hit):
     tags = []
     for tag in hit.get("tags", []) if isinstance(hit.get("tags", []), list) else []:
          if isinstance(tag, str):
               name = tag.strip()
          elif isinstance(tag, dict):
               name = str(tag.get("name") or "").strip()
          else:
               name = ""
          if name:
               tags.append(name)
     return tags


def _matches_civitai_tag_filters(hit, include_tags, exclude_tags, logic):
     if not include_tags and not exclude_tags:
          return True

     lower_tags = {tag.lower() for tag in _hit_tag_names(hit)}
     include_lower = [tag.lower() for tag in include_tags]
     exclude_lower = [tag.lower() for tag in exclude_tags]

     if exclude_lower and any(tag in lower_tags for tag in exclude_lower):
          return False

     if not include_lower:
          return True

     if logic == "or":
          return any(tag in lower_tags for tag in include_lower)

     return all(tag in lower_tags for tag in include_lower)


@prompt_server.routes.post("/civitai/search")
async def route_search_models(request):
     """API Endpoint for searching models using Civitai's Meilisearch."""
     api_key = None # Meili might not use the standard key
     try:
          data = await get_request_json(request)

          query = data.get("query", "").strip()
          model_type_keys = data.get("model_types", []) # e.g., ["lora", "checkpoint"] (frontend internal keys)
          base_model_filters = data.get("base_models", []) # e.g., ["SD 1.5", "Pony"]
          civitai_tag_filters = _normalize_tags(data.get("civitai_tag_filters", []))
          civitai_exclude_tag_filters = _normalize_tags(data.get("civitai_exclude_tag_filters", []))
          civitai_tag_filter_logic = data.get("civitai_tag_filter_logic", "and")
          if civitai_tag_filter_logic not in {"and", "or"}:
               civitai_tag_filter_logic = "and"
          sort = data.get("sort", "Most Downloaded") # Frontend display value
          # Make period optional or remove if not supported by Meili sort directly
          # period = data.get("period", "AllTime")
          try:
               limit = int(data.get("limit", 20))
          except (TypeError, ValueError):
               limit = 20
          try:
               page = int(data.get("page", 1))
          except (TypeError, ValueError):
               page = 1
          limit = max(1, min(100, limit))
          page = max(1, page)
          api_key = data.get("api_key", "") # Keep for potential future use or different endpoints
          nsfw = data.get("nsfw", None) # Expect Boolean or None

          if not query and not model_type_keys and not base_model_filters and not civitai_tag_filters and not civitai_exclude_tag_filters:
               raise web.HTTPBadRequest(reason="Search requires a query or at least one filter (type, base model, or Civitai tag).")

          # Instantiate API - API key might not be needed for Meili public search
          api = CivitaiAPI(api_key or None)

          # --- Prepare Filters for Meili API call ---

          # 1. Map internal type keys to Civitai API 'type' names (used in Meili filter)
          # This assumes Meili filters on the uppercase names like "LORA", "Checkpoint"
          api_types_filter = []
          if isinstance(model_type_keys, list) and model_type_keys and "any" not in model_type_keys:
               for key in model_type_keys:
                    # Map key.lower() for robustness - use the existing map from config
                    # CIVITAI_API_TYPE_MAP maps internal key -> Civitai API type name (e.g. 'lora' -> 'LORA')
                    api_type = CIVITAI_API_TYPE_MAP.get(key.lower())
                    alias_types = SEARCH_TYPE_ALIASES.get(key.lower(), [])
                    candidate_types = []
                    if isinstance(api_type, str):
                         candidate_types.append(api_type)
                    elif isinstance(api_type, (list, tuple, set)):
                         candidate_types.extend(api_type)
                    candidate_types.extend(alias_types)

                    # Ensure we handle cases where the map might return None or duplicate types
                    for candidate_type in candidate_types:
                         if candidate_type and candidate_type not in api_types_filter:
                              api_types_filter.append(candidate_type)

          # 2. Base Model Filters (assume frontend sends exact names like "SD 1.5")
          valid_base_models = []
          if isinstance(base_model_filters, list) and base_model_filters:
               # Optional: Validate against known list?
               valid_base_models = [bm for bm in base_model_filters if isinstance(bm, str) and bm]
               # Example validation (optional):
               # valid_base_models = [bm for bm in base_model_filters if bm in AVAILABLE_MEILI_BASE_MODELS]
               # if len(valid_base_models) != len(base_model_filters):
               #     print("Warning: Some provided base model filters were invalid.")

          # --- Call the New API Method ---
          print(f"[Server Search] Meili: query='{query if query else '<none>'}', types={api_types_filter or 'Any'}, baseModels={valid_base_models or 'Any'}, civitaiTags={civitai_tag_filters or 'Any'}, excludeTags={civitai_exclude_tag_filters or 'Any'}, tagLogic={civitai_tag_filter_logic}, sort={sort}, nsfw={nsfw}, limit={limit}, page={page}")

          tag_filter_groups = []
          if civitai_tag_filters:
               tag_filters = [f'"tags.name"="{tag}"' for tag in civitai_tag_filters]
               if civitai_tag_filter_logic == "or":
                    tag_filter_groups.append(tag_filters)
               else:
                    tag_filter_groups.extend(tag_filters)

          if civitai_exclude_tag_filters:
               for tag in civitai_exclude_tag_filters:
                    tag_filter_groups.append(f'NOT "tags.name"="{tag}"')

          # Call the new search method
          meili_results = api.search_models_meili(
               query=query or None, # Meili handles empty query if filters exist
               types=api_types_filter or None,
               base_models=valid_base_models or None,
               sort=sort, # Pass the frontend value, mapping happens inside search_models_meili
               limit=limit,
               page=page,
               nsfw=nsfw,
               additional_filters=tag_filter_groups or None
          )

          # Handle API error response from CivitaiAPI helper
          if meili_results and isinstance(meili_results, dict) and "error" in meili_results:
               status_code = meili_results.get("status_code", 500) or 500
               return web.json_response(meili_results, status=status_code)

          # --- Process Meili Response for Frontend ---
          if meili_results and isinstance(meili_results, dict) and "hits" in meili_results:
               processed_items = []
               image_base_url = "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7QA" # Base URL for images

               for hit in meili_results.get("hits", []):
                    if not isinstance(hit, dict):
                         continue # Skip invalid hits

                    if not _matches_civitai_tag_filters(hit, civitai_tag_filters, civitai_exclude_tag_filters, civitai_tag_filter_logic):
                         continue

                    thumbnail_url = None
                    # Get thumbnail from images array (prefer first image)
                    images = hit.get("images")
                    if images and isinstance(images, list) and len(images) > 0:
                         first_image = images[0]
                         # Ensure first image is a dict with a 'url' field
                         if isinstance(first_image, dict) and first_image.get("url"):
                              image_id = first_image["url"]
                              # Construct URL with a default width (e.g., 256 or 450)
                              thumbnail_url = f"{image_base_url}/{image_id}/width=256" # Adjust width as needed

                    # Extract latest version info (Meili response includes 'version' object for the primary version)
                    latest_version_info = hit.get("version", {}) or {} # Ensure it's a dict

                    # Prepare item structure for frontend (can pass raw hit + extras, or build a specific structure)
                    # Let's pass the raw `hit` and add the `thumbnailUrl` and potentially other processed fields.
                    hit["thumbnailUrl"] = thumbnail_url # Add processed thumbnail URL directly to the hit object

                    # Optional: Add more processed fields if needed, e.g., formatted stats
                    # hit['processedStats'] = { ... }

                    processed_items.append(hit)

               # --- Calculate Pagination Info ---
               total_hits = meili_results.get("estimatedTotalHits", 0)
               current_page = page # Use the requested page number
               total_pages = math.ceil(total_hits / limit) if limit > 0 else 0

               # --- Return Structure for Frontend ---
               response_data = {
                    "items": processed_items, # The array of processed hits
                    "metadata": {
                         "totalItems": total_hits,
                         "currentPage": current_page,
                         "pageSize": limit, # The limit used for the request
                         "totalPages": total_pages,
                         # Meili provides offset, limit, processingTimeMs which could also be passed if useful
                         "meiliProcessingTimeMs": meili_results.get("processingTimeMs"),
                         "meiliOffset": meili_results.get("offset"),
                    }
               }
               return web.json_response(response_data)

          # Handle unexpected format from API or empty results
          print(f"[Server Search] Warning: Unexpected Meili search result format or empty hits: {meili_results}")
          return web.json_response({"items": [], "metadata": {"totalItems": 0, "currentPage": page, "pageSize": limit, "totalPages": 0}}, status=500)

     except web.HTTPError as http_err:
          body_detail = ""
          try:
               body_detail = await http_err.text() if hasattr(http_err, 'text') else http_err.body.decode('utf-8', errors='ignore') if http_err.body else ""
               if body_detail.startswith('{') and body_detail.endswith('}'):
                    body_detail = json.loads(body_detail)
          except Exception:
               pass
          return web.json_response({"error": http_err.reason, "details": body_detail or "No details", "status_code": http_err.status}, status=http_err.status)

     except Exception as e:
          print("--- Unhandled Error in /civitai/search ---")
          traceback.print_exc()
          print("--- End Error ---")
          return web.json_response({"error": "Internal Server Error", "details": f"An unexpected search error occurred: {str(e)}", "status_code": 500}, status=500)