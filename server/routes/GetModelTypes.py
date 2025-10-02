# ================================================
# File: server/routes/GetModelTypes.py
# ================================================
import os
from aiohttp import web
import server # ComfyUI server instance
import folder_paths
from ...config import MODEL_TYPE_DIRS

prompt_server = server.PromptServer.instance

@prompt_server.routes.get("/civitai/model_types")
async def route_get_model_types(request):
    """API Endpoint to get the known model types and their mapping."""
    try:
        # Return the configured model type mappings from config
        # Format: {internal_key: display_name}
        entries = {}
        for internal_key, (display_name, folder_paths_type) in MODEL_TYPE_DIRS.items():
            entries[internal_key] = display_name
        
        # Also dynamically add any additional folders found in models/ that aren't in our config
        # But first, collect all known folder_paths_type values to avoid duplicates
        try:
            models_dir = getattr(folder_paths, 'models_dir', None)
            if not models_dir:
                base = getattr(folder_paths, 'base_path', os.getcwd())
                models_dir = os.path.join(base, 'models')
            
            if os.path.isdir(models_dir):
                # Collect all folder_paths_type values from our config to avoid duplicates
                known_folder_names = set()
                for internal_key, (display_name, folder_paths_type) in MODEL_TYPE_DIRS.items():
                    if folder_paths_type:  # Skip None entries like 'other'
                        known_folder_names.add(folder_paths_type)
                
                for name in sorted(os.listdir(models_dir)):
                    p = os.path.join(models_dir, name)
                    # Only add if it's a directory, not already in our entries, and not a known folder type
                    if (os.path.isdir(p) and 
                        name not in entries and 
                        name not in known_folder_names):
                        # Add directories not in our config with their literal name
                        entries[name] = name.title()  # Capitalize for display
                        print(f"[GetModelTypes] Adding unconfigured directory: {name}")
        except Exception as e:
            print(f"Warning: Could not scan models directory: {e}")
        
        return web.json_response(entries)
    except Exception as e:
        print(f"Error getting model types: {e}")
        return web.json_response({"error": "Internal Server Error", "details": str(e), "status_code": 500}, status=500)
