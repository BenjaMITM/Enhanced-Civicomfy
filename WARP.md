# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

Civicomfy is a ComfyUI custom node extension that integrates Civitai's vast model repository directly into ComfyUI, allowing users to search, download, and organize AI models without leaving their workflow. It provides a clean web-based interface for browsing Civitai models and handles automatic organization into appropriate directories.

## Architecture

### Core Components

- **API Layer** (`api/civitai.py`): CivitaiAPI wrapper that handles communication with Civitai's REST API and Meilisearch endpoints
- **Download Manager** (`downloader/manager.py`): Multi-threaded download manager with queue system, history persistence, and chunk-based downloading
- **Server Routes** (`server/routes/`): Individual route modules that handle web API endpoints for the frontend interface
- **Frontend** (`web/js/`): Modular JavaScript UI with separate components for search, status, and preview rendering
- **Configuration** (`config.py`): Centralized configuration including model type mappings and directory paths

### Data Flow

1. Frontend sends search/download requests to server routes
2. Routes use CivitaiAPI to fetch model information from Civitai
3. Download requests are queued through the DownloadManager
4. ChunkDownloader handles multi-connection downloads with progress tracking
5. Models are organized into ComfyUI directories based on model type
6. Metadata (.cminfo.json) and previews (.preview.jpeg) are saved alongside models

### Model Organization

The extension maps Civitai model types to ComfyUI directory structure using `MODEL_TYPE_DIRS` in `config.py`. It respects ComfyUI's `folder_paths` system and `extra_model_paths.yaml` configurations.

## Development Commands

### Installation

```bash
# Git clone installation
cd ComfyUI/custom_nodes
git clone https://github.com/MoonGoblinDev/Civicomfy.git

# Or via Comfy-CLI
comfy node registry-install civicomfy
```

### Development Setup
No additional dependencies beyond ComfyUI's requirements. The extension uses only Python standard library and ComfyUI's built-in dependencies (requests, aiohttp, etc.).

### Testing Download Manager

```bash
# Run ComfyUI to initialize the extension and test download functionality
# The download manager starts automatically and logs to console
python main.py --listen 0.0.0.0 --port 8188
```

### Debug Frontend Issues

```bash
# Check for missing frontend files
ls -la web/js/civitaiDownloader.js
ls -la web/js/civitaiDownloader.css

# View browser console for JavaScript errors when testing UI
```

## Key Files for Development

### Backend Core
- `__init__.py` - Extension entry point, handles ComfyUI registration and initialization checks
- `config.py` - All configuration constants, model type mappings, and path resolution
- `downloader/manager.py` - Main download orchestration, queue management, and history persistence
- `downloader/chunk_downloader.py` - Multi-connection download implementation with cancellation support

### API Integration
- `api/civitai.py` - Civitai API wrapper with both REST API and Meilisearch support
- `utils/helpers.py` - URL parsing, filename sanitization, and model directory resolution
- `server/utils.py` - Request handling utilities and model/version detail fetching

### Frontend Structure
- `web/js/civitaiDownloader.js` - Main UI controller and ComfyUI integration
- `web/js/ui/UI.js` - Core UI component management
- `web/js/ui/searchRenderer.js` - Search results and filtering interface
- `web/js/ui/statusRenderer.js` - Download status and progress display

### Server Routes (Individual Files)
- `server/routes/SearchModels.py` - Handle search with filters and pagination
- `server/routes/DownloadModel.py` - Process download requests with file selection
- `server/routes/GetStatus.py` - Return download queue, active, and history status
- `server/routes/CancelDownload.py` - Cancel active or queued downloads

## Important Implementation Details

### Download State Management
Downloads progress through states: `queued` → `starting` → `downloading` → `completed`/`failed`/`cancelled`. The DownloadManager persists history to `download_history.json` for retry functionality.

### Model Type Resolution
Model types are resolved using ComfyUI's `folder_paths.get_directory_by_type()` system. The `get_model_dir()` helper in `utils/helpers.py` handles fallbacks and directory creation.

### File Selection Logic
The `select_primary_file()` function prioritizes safetensors over pickle formats, and pruned over full models when multiple files are available.

### API Key Management
API keys are stored in frontend settings and passed with each request. The extension works without API keys but may have rate limitations.

### Thread Safety
The DownloadManager uses threading.Lock for all shared state access. Individual ChunkDownloaders handle their own cancellation state.

## Configuration Notes

### Model Directory Mapping
Edit `MODEL_TYPE_DIRS` in `config.py` to add support for new model types or change directory mappings. Each entry maps to ComfyUI's folder_paths system.

### Download Settings
Modify `MAX_CONCURRENT_DOWNLOADS`, `DEFAULT_CONNECTIONS`, and timeout values in `config.py` for performance tuning.

### Frontend Customization

The UI is modular; adjust components in `web/js/ui/` and styles in `web/js/civitaiDownloader.css`.

## Common Development Tasks

When adding new model types, update both `MODEL_TYPE_DIRS` and `CIVITAI_API_TYPE_MAP` in `config.py`.

When modifying search functionality, update both the frontend search renderer and the backend `server/routes/SearchModels.py` route.

For download behavior changes, focus on `downloader/manager.py` and `downloader/chunk_downloader.py`.

Frontend changes primarily affect `web/js/` files - the extension serves this directory statically to ComfyUI's web interface.

## Server API Endpoints

All endpoints are registered via decorators in `server/routes/*.py` when `server/__init__.py` is imported from `__init__.py`.

- **POST `/civitai/search`** (`server/routes/SearchModels.py`)
  - Body: `{ query?: string, model_types?: string[], base_models?: string[], sort?: string, limit?: number, page?: number, nsfw?: boolean, api_key?: string }`
  - Returns: `{ items: any[], metadata: { totalItems, currentPage, pageSize, totalPages, meiliProcessingTimeMs?, meiliOffset? } }`
  - Notes: Uses Meilisearch via `CivitaiAPI.search_models_meili()`; supports type and base model filters.

- **POST `/civitai/get_model_details`** (`server/routes/GetModelDetails.py`)
  - Body: `{ model_url_or_id: string, model_version_id?: number, api_key?: string }`
  - Returns curated details for preview including primary file and `files` list for selection.

- **POST `/civitai/download`** (`server/routes/DownloadModel.py`)
  - Body: `{ model_url_or_id: string, model_type: string, model_version_id?: number, custom_filename?: string, subdir?: string, file_id?: number, file_name_contains?: string, num_connections?: number, force_redownload?: boolean, api_key?: string }`
  - Returns: `{ status: 'queued' | 'exists' | 'exists_size_mismatch', ... }`
  - Behavior: Queues a job in `DownloadManager`; creates `.cminfo.json` and `.preview.jpeg` alongside file.

- **GET `/civitai/status`** (`server/routes/GetStatus.py`)
  - Returns: `{ queue: Item[], active: Item[], history: Item[] }` with sensitive fields stripped.

- **POST `/civitai/cancel`** (`server/routes/CancelDownload.py`)
  - Body: `{ download_id: string }`
  - Cancels queued/active downloads.

- **POST `/civitai/retry`** (`server/routes/RetryDownload.py`)
  - Body: `{ download_id: string }`
  - Re-queues a failed/cancelled history item (sets `force_redownload: true`).

- **POST `/civitai/open_path`** (`server/routes/OpenPath.py`)
  - Body: `{ download_id: string }`
  - Opens containing folder with OS-specific handler, with safety checks against known model directories.

- **POST `/civitai/clear_history`** (`server/routes/ClearHistory.py`)
  - Clears in-memory history and removes `download_history.json`.

- **GET `/civitai/model_types`** (`server/routes/GetModelTypes.py`)
  - Returns map of internal model type keys to display names, plus discovered unknown `models/` subfolders.

- **GET `/civitai/base_models`** (`server/routes/GetBaseModels.py`)
  - Returns: `{ base_models: string[] }` for UI filter.

- **GET `/civitai/model_dirs?type={key}`** (`server/routes/GetModelDirs.py`)
  - Returns: `{ model_type, base_dir, subdirs: string[] }` where `subdirs` are relative, `""` is root.

- **POST `/civitai/create_dir`** (`server/routes/GetModelDirs.py`)
  - Body: `{ model_type: string, new_dir: string, root?: string }`
  - Creates nested subfolders under the resolved base dir; sanitizes and prevents traversal.

- **POST `/civitai/create_model_type`** (`server/routes/GetModelDirs.py`)
  - Body: `{ name: string }`
  - Creates a first-level folder under `models/`.

- **GET `/civitai/model_roots?type={key}`** (`server/routes/GetModelDirs.py`)
  - Returns: `{ model_type, roots: string[] }` including ComfyUI and plugin-added roots.

- **POST `/civitai/create_root`** (`server/routes/GetModelDirs.py`)
  - Body: `{ model_type: string, path: string }`
  - Registers a custom absolute root in `custom_roots.json` and creates folder if missing.

### Example Requests

```bash
curl -s http://127.0.0.1:8188/civitai/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"anime","model_types":["lora"],"limit":20,"page":1,"sort":"Most Downloaded"}'

curl -s http://127.0.0.1:8188/civitai/get_model_details \
  -H 'Content-Type: application/json' \
  -d '{"model_url_or_id":"https://civitai.com/models/000?modelVersionId=111"}'

curl -s http://127.0.0.1:8188/civitai/download \
  -H 'Content-Type: application/json' \
  -d '{"model_url_or_id":"12345","model_type":"lora","model_version_id":67890,"force_redownload":true}'
```

## Data & Files

- **History persistence**: `download_history.json` in extension root (`downloader/manager.py` → `HISTORY_FILE_PATH`).
- **Metadata**: `<file>.cminfo.json` with model/version/file info (`_save_civitai_metadata`).
- **Preview image**: `<file>.preview.jpeg` downloaded from version images (`_download_and_save_preview`).
- **Directory resolution**: `utils/helpers.py:get_model_dir()` uses `folder_paths` with fallbacks and ensures existence.
- **Safety**: `open_containing_folder()` checks path is within known ComfyUI dirs or plugin-managed roots before opening.

## Frontend Integration

- Entry: `web/js/civitaiDownloader.js` registers `Civicomfy.CivitaiDownloader` and injects a button into `.comfyui-button-group`.
- CSS: `web/js/civitaiDownloader.css` is loaded via `addCssLink()` from `web/js/utils/dom.js`.
- UI: `web/js/ui/UI.js` composes handlers and renderers; tabs for Download/Search/Status/Settings.
- API client: `web/js/api/civitai.js` wraps `api.fetchApi` with consistent error handling.

## Known Limitations

- **Multi-connection downloads**: `downloader/chunk_downloader.py` notes multi-connection “somehow still not working”; UI disables connections field (`templates.js`). Fallback single-connection is used.
- **Meilisearch token**: Public bearer token is embedded for Meili search; API may change without notice.
- **NSFW handling**: UI blurs thumbnails when `nsfwLevel >= settings.nsfwBlurMinLevel` (default 4). Click to reveal.

## Troubleshooting

- **Missing frontend assets**: On startup, `__init__.py` warns if `web/js/civitaiDownloader.js` or `civitaiDownloader.css` are missing.
- **API key issues**: Without key, Civitai may rate-limit; some downloads require auth. UI prompts to fill Settings.
- **Status not updating**: Ensure modal is open; updates every 3s (`statusHandler.js`). Check `/civitai/status` in browser.
- **Download stuck/failed**: See console logs from `DownloadManager` and `ChunkDownloader`. Retry via history using `/civitai/retry`.
- **Open path fails**: Path must be within known model dirs; otherwise denied by safety checks.

## Development Tips

- Adjust timeouts and concurrency in `config.py` for your environment.
- Add logging in `downloader/chunk_downloader.py` for segment failures (range/416, size mismatch).
- When adding model types, update both `MODEL_TYPE_DIRS` mapping and `CIVITAI_API_TYPE_MAP` for search filters.