import { CivitaiDownloaderAPI } from "../../api/civitai.js";

export async function handleSearchSubmit(ui) {
    ui.searchSubmitButton.disabled = true;
    ui.searchSubmitButton.textContent = 'Searching...';
    ui.searchResultsContainer.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Searching...</p>';
    ui.searchPaginationContainer.innerHTML = '';
    ui.ensureFontAwesome();

    const params = {
        query: ui.searchQueryInput.value.trim(),
        model_types: ui.searchTypeSelect.value === 'any' ? [] : [ui.searchTypeSelect.value],
        base_models: ui.searchBaseModelSelect.value === 'any' ? [] : [ui.searchBaseModelSelect.value],
        sort: ui.searchSortSelect.value,
        limit: parseInt(ui.searchLimitSelect.value) || ui.searchPagination.limit,
        page: ui.searchPagination.currentPage,
        api_key: ui.settings.apiKey,
    };

    ui.lastSearchBaseParams = null;
    ui.loadedPages = new Set();
    ui.loadedModelIds = new Set();
    ui.highestLoadedPage = parseInt(params.page, 10) || 1;
    ui.fetchingAdditionalResults = false;
    ui.filterTopUpScheduled = false;

    try {
        const response = await CivitaiDownloaderAPI.searchModels(params);
        if (!response || !response.metadata || !Array.isArray(response.items)) {
            console.error("Invalid search response structure:", response);
            throw new Error("Received invalid data from search API.");
        }

        const baseParams = { ...params };
        delete baseParams.page;
        ui.lastSearchBaseParams = baseParams;
        ui.currentSearchItems = Array.isArray(response.items) ? response.items : [];
        ui.currentSearchMetadata = response.metadata || null;
        const currentPage = parseInt(response.metadata.currentPage, 10) || params.page || 1;
        ui.loadedPages = new Set([currentPage]);
        ui.highestLoadedPage = currentPage;
        ui.loadedModelIds = new Set();
        ui.currentSearchItems.forEach(item => {
            const id = item?.id;
            if (id) ui.loadedModelIds.add(String(id));
        });
        ui.fetchingAdditionalResults = false;
        ui.filterTopUpScheduled = false;

        ui.renderSearchResults(ui.currentSearchItems);
        ui.renderSearchPagination(response.metadata);
        ui.updateTagFilterControls();
        ui.applyTagFilters();
        ui.updateBulkActionsUI();

    } catch (error) {
        const message = `Search failed: ${error.details || error.message || 'Unknown error'}`;
        console.error("Search Submit Error:", error);
        ui.searchResultsContainer.innerHTML = `<p style="color: var(--error-text, #ff6b6b);">${message}</p>`;
        ui.showToast(message, 'error');
    } finally {
        ui.searchSubmitButton.disabled = false;
        ui.searchSubmitButton.textContent = 'Search';
    }
}
