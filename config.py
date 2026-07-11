# ================================================
# File: config.py
# ================================================
import os
import folder_paths # Use ComfyUI's folder_paths

# --- Configuration ---
MAX_CONCURRENT_DOWNLOADS = 3
DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024  # 4MB (increase to reduce per-chunk overhead)
DEFAULT_CONNECTIONS = 8
DOWNLOAD_HISTORY_LIMIT = 100
DOWNLOAD_TIMEOUT = 60 # Timeout for individual download chunks/requests (seconds)
HEAD_REQUEST_TIMEOUT = 25 # Timeout for initial HEAD request (seconds)
METADATA_DOWNLOAD_TIMEOUT = 20 # Timeout for downloading thumbnail (seconds)

# --- Paths ---
# The root directory of *this specific plugin/extension*
# Calculated based on the location of this config.py file
PLUGIN_ROOT = os.path.dirname(os.path.realpath(__file__))

# Construct web paths relative to the plugin's root directory
WEB_DIRECTORY = os.path.join(PLUGIN_ROOT, "web")
JAVASCRIPT_PATH = os.path.join(WEB_DIRECTORY, "js")
CSS_PATH = os.path.join(WEB_DIRECTORY, "css")
# Corrected path construction to avoid issues with leading slashes
PLACEHOLDER_IMAGE_PATH = os.path.join(WEB_DIRECTORY, "images", "placeholder.jpeg")

# Get ComfyUI directories using folder_paths
COMFYUI_ROOT_DIR = folder_paths.base_path
# MODELS_DIR removed; resolve per-type via folder_paths

# --- Model Types ---
# Maps the internal key (lowercase) to a tuple: (display_name, folder_paths_type)
# The folder_paths_type is used by ComfyUI's folder_paths.get_directory_by_type().
MODEL_TYPE_DIRS = {
    "checkpoint": ("Checkpoint", "checkpoints"),
    "diffusers": ("Diffusers", "diffusers"),
    "diffusion_models": ("Diffusion Models", "diffusion_models"),
    "unet": ("Unet", "unet"),
    "lora": ("Lora", "loras"),
    "locon": ("LoCon", "loras"),
    "lycoris": ("LyCORIS", "loras"),
    "vae": ("VAE", "vae"),
    "embedding": ("Embedding", "embeddings"),
    "hypernetwork": ("Hypernetwork", "hypernetworks"),
    "controlnet": ("ControlNet", "controlnet"),
    "upscaler": ("Upscaler", "upscale_models"),
    "motionmodule": ("Motion Module", "motion_models"),
    "poses": ("Poses", "poses"),
    "wildcards": ("Wildcards", "wildcards"),
    "audio_encoders": ("Audio Encoders", "audio_encoders"),
    "background_removal": ("Background Removal", "background_removal"),
    "clip": ("CLIP", "clip"),
    "clip_vision": ("CLIP Vision", "clip_vision"),
    "configs": ("Configs", "configs"),
    "detection": ("Detection", "detection"),
    "frame_interpolation": ("Frame Interpolation", "frame_interpolation"),
    "geometry_estimation": ("Geometry Estimation", "geometry_estimation"),
    "gligen": ("GLIGEN", "gligen"),
    "latent_upscale_models": ("Latent Upscale Models", "latent_upscale_models"),
    "model_patches": ("Model Patches", "model_patches"),
    "optical_flow": ("Optical Flow", "optical_flow"),
    "photomaker": ("PhotoMaker", "photomaker"),
    "style_models": ("Style Models", "style_models"),
    "text_encoders": ("Text Encoders", "text_encoders"),
    "upscale_models": ("Upscale Models", "upscale_models"),
    "vae_approx": ("VAE Approx", "vae_approx"),
    # 'other' will save to a dedicated folder inside the Civicomfy extension directory
    "other": ("Other", None)
}

# Aliases that should be treated as the canonical model type key above.
# This keeps the UI from showing duplicate options for the same storage root.
MODEL_TYPE_ALIASES = {
    "diffusion-models": "diffusion_models",
    "diffusionmodels": "diffusion_models",
}

# Base models that are commonly distributed as diffusion-style folders rather than
# a single checkpoint file. Used as a heuristic when Civitai labels the model as a checkpoint.
DIFFUSION_LIKE_BASE_MODELS = {
    "cogvideox",
    "flux.1 d",
    "flux.1 s",
    "flux2",
    "hunyuan 1",
    "hunyuan video",
    "ltxv",
    "lumina",
    "mochi",
    "wan video",
    "z-image",
}

# Civitai API specific type mapping (for search filters)
# Maps internal key (lowercase) to Civitai API 'types' parameter value
CIVITAI_API_TYPE_MAP = {
    "checkpoint": "Checkpoint",
    "lora": "LORA",
    "locon": "LoCon",
    "lycoris": "LORA", # Civitai might group LyCORIS under LORA search type
    "vae": "VAE",
    "embedding": "TextualInversion",
    "hypernetwork": "Hypernetwork",
    "controlnet": "Controlnet",
    "motionmodule": "MotionModule",
    "poses": "Poses",
    "wildcards": "Wildcards",
    "upscaler": "Upscaler", 
    "unet": "UNET",
    "diffusers": "Diffusers",
    "diffusion_models": "UNET",
}

AVAILABLE_MEILI_BASE_MODELS = [
    "AuraFlow", "CogVideoX", "Flux.1 D", "Flux.1 S", "Flux2", "Hunyuan 1", "Hunyuan Video",
    "Illustrious", "Kolors", "LTXV", "Lumina", "Mochi", "NoobAI", "ODOR", "Other",
    "PixArt E", "PixArt a", "Playground v2", "Pony", "SD 1.4", "SD 1.5",
    "SD 1.5 Hyper", "SD 1.5 LCM", "SD 2.0", "SD 2.0 768", "SD 2.1", "SD 2.1 768",
    "SD 2.1 Unclip", "SD 3", "SD 3.5", "SD 3.5 Large", "SD 3.5 Large Turbo",
    "SD 3.5 Medium", "SDXL 0.9", "SDXL 1.0", "SDXL 1.0 LCM", "SDXL Distilled",
    "SDXL Hyper", "SDXL Lightning", "SDXL Turbo", "SVD", "SVD XT", "Stable Cascade",
    "Wan Video", "Z-Image", "Ovis"
]

# --- Filename Suffixes ---
METADATA_SUFFIX = ".cminfo.json"
PREVIEW_SUFFIX = ".preview.jpeg" # Keep as requested, even if source is png/webp

# --- Log Initial Paths for Verification ---
print("-" * 30)
print("[Civicomfy Config Initialized]")
print(f"  - Plugin Root: {PLUGIN_ROOT}")
print(f"  - Web Directory: {WEB_DIRECTORY}")
print(f"  - ComfyUI Base Path: {COMFYUI_ROOT_DIR}")
print("-" * 30)
