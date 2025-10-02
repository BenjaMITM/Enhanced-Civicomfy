import { CivitaiDownloaderAPI } from "../../api/civitai.js";
export function setupEventListeners(ui) {
    // Modal close
    ui.closeButton.addEventListener('click', () => ui.closeModal());
    ui.modal.addEventListener('click', (event) => {
        if (event.target === ui.modal) ui.closeModal();
    });

    // Tab switching
    ui.tabContainer.addEventListener('click', (event) => {
        if (event.target.matches('.civitai-downloader-tab')) {
            ui.switchTab(event.target.dataset.tab);
        }
    });

    // --- FORMS ---
    ui.downloadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        ui.handleDownloadSubmit();
    });

    // Change of model type should refresh subdir list
    ui.downloadModelTypeSelect.addEventListener('change', async () => {
        await ui.loadAndPopulateSubdirs(ui.downloadModelTypeSelect.value);
    });

    // Create new model type folder (first-level under models/)
    ui.createModelTypeButton.addEventListener('click', async () => {
        const name = prompt('Enter new model type folder name (will be created under models/)');
        if (!name) return;
        try {
            const res = await CivitaiDownloaderAPI.createModelType(name);
            if (res && res.success) {
                await ui.populateModelTypes();
                ui.downloadModelTypeSelect.value = res.name;
                await ui.loadAndPopulateSubdirs(res.name);
                ui.showToast(`Created model type folder: ${res.name}`, 'success');
            } else {
                ui.showToast(res?.error || 'Failed to create model type folder', 'error');
            }
        } catch (e) {
            ui.showToast(e.details || e.message || 'Error creating model type folder', 'error');
        }
    });

    // Create new subfolder under current model type
    ui.createSubdirButton.addEventListener('click', async () => {
        const type = ui.downloadModelTypeSelect.value;
        const name = prompt('Enter new subfolder name (you can include nested paths like A/B):');
        if (!name) return;
        try {
            const res = await CivitaiDownloaderAPI.createModelDir(type, name);
            if (res && res.success) {
                await ui.loadAndPopulateSubdirs(type);
                if (ui.subdirSelect) ui.subdirSelect.value = res.created || '';
                ui.showToast(`Created folder: ${res.created}`, 'success');
            } else {
                ui.showToast(res?.error || 'Failed to create folder', 'error');
            }
        } catch (e) {
            ui.showToast(e.details || e.message || 'Error creating folder', 'error');
        }
    });

    ui.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!ui.searchQueryInput.value.trim() && ui.searchTypeSelect.value === 'any' && ui.searchBaseModelSelect.value === 'any') {
            ui.showToast("Please enter a search query or select a filter.", "error");
            if (ui.searchResultsContainer) ui.searchResultsContainer.innerHTML = '<p>Please enter a search query or select a filter.</p>';
            if (ui.searchPaginationContainer) ui.searchPaginationContainer.innerHTML = '';
            return;
        }
        ui.searchPagination.currentPage = 1;
        ui.handleSearchSubmit();
    });

    // Reset pagination when changing results per page
    if (ui.searchLimitSelect) {
        ui.searchLimitSelect.addEventListener('change', () => {
            ui.searchPagination.currentPage = 1;
            // Only trigger search if we have results already
            if (ui.searchResultsContainer && ui.searchResultsContainer.children.length > 0) {
                ui.handleSearchSubmit();
            }
        });
    }

    ui.settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        ui.handleSettingsSave();
    });

    // Download form inputs
    ui.modelUrlInput.addEventListener('input', () => ui.debounceFetchDownloadPreview());
    ui.modelUrlInput.addEventListener('paste', () => ui.debounceFetchDownloadPreview(0));
    ui.modelVersionIdInput.addEventListener('blur', () => ui.fetchAndDisplayDownloadPreview());

    // --- DYNAMIC CONTENT LISTENERS (Event Delegation) ---

    // Status tab actions (Cancel/Retry/Open/Clear) and click-to-toggle blur on thumbs
    ui.statusContent.addEventListener('click', (event) => {
        const thumbContainer = event.target.closest('.civitai-thumbnail-container');
        if (thumbContainer) {
            const nsfwLevel = Number(thumbContainer.dataset.nsfwLevel ?? thumbContainer.getAttribute('data-nsfw-level'));
            const threshold = Number(ui.settings?.nsfwBlurMinLevel ?? 4);
            const enabled = ui.settings?.hideMatureInSearch === true;
            if (enabled && Number.isFinite(nsfwLevel) && nsfwLevel >= threshold) {
                if (thumbContainer.classList.contains('blurred')) {
                    thumbContainer.classList.remove('blurred');
                    const overlay = thumbContainer.querySelector('.civitai-nsfw-overlay');
                    if (overlay) overlay.remove();
                } else {
                    thumbContainer.classList.add('blurred');
                    if (!thumbContainer.querySelector('.civitai-nsfw-overlay')) {
                        const ov = document.createElement('div');
                        ov.className = 'civitai-nsfw-overlay';
                        ov.title = 'R-rated: click to reveal';
                        ov.textContent = 'R';
                        thumbContainer.appendChild(ov);
                    }
                }
                return; // consume
            }
        }

        const button = event.target.closest('button');
        if (!button) return;

        const downloadId = button.dataset.id;
        if (downloadId) {
            if (button.classList.contains('civitai-cancel-button')) ui.handleCancelDownload(downloadId);
            else if (button.classList.contains('civitai-retry-button')) ui.handleRetryDownload(downloadId, button);
            else if (button.classList.contains('civitai-openpath-button')) ui.handleOpenPath(downloadId, button);
        } else if (button.id === 'civitai-clear-history-button') {
            ui.confirmClearModal.style.display = 'flex';
        }
    });

    // Download preview click-to-toggle blur
    ui.downloadPreviewArea.addEventListener('click', (event) => {
        const thumbContainer = event.target.closest('.civitai-thumbnail-container');
        if (thumbContainer) {
            const nsfwLevel = Number(thumbContainer.dataset.nsfwLevel ?? thumbContainer.getAttribute('data-nsfw-level'));
            const threshold = Number(ui.settings?.nsfwBlurMinLevel ?? 4);
            const enabled = ui.settings?.hideMatureInSearch === true;
            if (enabled && Number.isFinite(nsfwLevel) && nsfwLevel >= threshold) {
                if (thumbContainer.classList.contains('blurred')) {
                    thumbContainer.classList.remove('blurred');
                    const overlay = thumbContainer.querySelector('.civitai-nsfw-overlay');
                    if (overlay) overlay.remove();
                } else {
                    thumbContainer.classList.add('blurred');
                    if (!thumbContainer.querySelector('.civitai-nsfw-overlay')) {
                        const ov = document.createElement('div');
                        ov.className = 'civitai-nsfw-overlay';
                        ov.title = 'R-rated: click to reveal';
                        ov.textContent = 'R';
                        thumbContainer.appendChild(ov);
                    }
                }
            }
        }
    });

    // Layout toggle buttons
    ui.modal.addEventListener('click', (event) => {
        const layoutButton = event.target.closest('.civitai-layout-button');
        if (layoutButton) {
            event.preventDefault();
            const layout = layoutButton.dataset.layout;
            const container = ui.searchResultsContainer;
            const allButtons = ui.modal.querySelectorAll('.civitai-layout-button');
            
            // Update button states
            allButtons.forEach(btn => btn.classList.remove('active'));
            layoutButton.classList.add('active');
            
            // Update container layout
            if (layout === 'grid') {
                container.classList.add('grid-layout');
                ui.applyGridLayoutSize();
                ui.syncGridSizeButtons();
            } else {
                container.classList.remove('grid-layout');
            }
            return;
        }

        const gridSizeButton = event.target.closest('.civitai-grid-size-button');
        if (gridSizeButton) {
            event.preventDefault();
            const size = gridSizeButton.dataset.gridSize;
            ui.setGridLayoutSize(size);
            return;
        }
    });

    // Search results actions, including click-to-toggle blur, selection, open preview
    ui.searchResultsContainer.addEventListener('click', (event) => {
        const thumbContainer = event.target.closest('.civitai-thumbnail-container');
        if (thumbContainer) {
            const nsfwLevel = Number(thumbContainer.dataset.nsfwLevel ?? thumbContainer.getAttribute('data-nsfw-level'));
            const threshold = Number(ui.settings?.nsfwBlurMinLevel ?? 4);
            const enabled = ui.settings?.hideMatureInSearch === true;
            if (enabled && Number.isFinite(nsfwLevel) && nsfwLevel >= threshold) {
                if (thumbContainer.classList.contains('blurred')) {
                    thumbContainer.classList.remove('blurred');
                    const overlay = thumbContainer.querySelector('.civitai-nsfw-overlay');
                    if (overlay) overlay.remove();
                } else {
                    thumbContainer.classList.add('blurred');
                    if (!thumbContainer.querySelector('.civitai-nsfw-overlay')) {
                        const ov = document.createElement('div');
                        ov.className = 'civitai-nsfw-overlay';
                        ov.title = 'R-rated: click to reveal';
                        ov.textContent = 'R';
                        thumbContainer.appendChild(ov);
                    }
                }
                return; // Don't trigger other actions on this click
            }
            // If click on checkbox within thumbnail container, ignore open-preview
            const checkbox = event.target.closest('.civitai-select-checkbox');
            if (!checkbox && thumbContainer.classList.contains('civitai-open-preview')) {
                // Open preview in Download tab, pre-filling fields
                const modelId = thumbContainer.dataset.modelId;
                const versionId = thumbContainer.dataset.versionId;
                if (modelId) {
                    ui.modelUrlInput.value = modelId;
                    ui.modelVersionIdInput.value = versionId || '';
                    ui.customFilenameInput.value = '';
                    ui.forceRedownloadCheckbox.checked = false;
                    ui.switchTab('download');
                    ui.fetchAndDisplayDownloadPreview();
                    ui.showToast(`Opened preview for model ${modelId}.`, 'info', 2500);
                }
                return;
            }
        }

        const downloadButton = event.target.closest('.civitai-search-download-button');
        if (downloadButton) {
            event.preventDefault();
            const { modelId, versionId, modelType } = downloadButton.dataset;
            if (!modelId || !versionId) {
                ui.showToast("Error: Missing data for download.", "error");
                return;
            }
            const modelTypeInternalKey = Object.keys(ui.modelTypes).find(key => ui.modelTypes[key]?.toLowerCase() === modelType?.toLowerCase()) || ui.settings.defaultModelType;

            ui.modelUrlInput.value = modelId;
            ui.modelVersionIdInput.value = versionId;
            ui.customFilenameInput.value = '';
            ui.forceRedownloadCheckbox.checked = false;
            ui.downloadModelTypeSelect.value = modelTypeInternalKey;

            ui.switchTab('download');
            ui.showToast(`Filled download form for Model ID ${modelId}.`, 'info', 4000);
            ui.fetchAndDisplayDownloadPreview();
            return;
        }

        const viewAllButton = event.target.closest('.show-all-versions-button');
        if (viewAllButton) {
            const modelId = viewAllButton.dataset.modelId;
            const versionsContainer = ui.searchResultsContainer.querySelector(`#all-versions-${modelId}`);
            if (versionsContainer) {
                const currentlyVisible = versionsContainer.style.display !== 'none';
                versionsContainer.style.display = currentlyVisible ? 'none' : 'flex';
                viewAllButton.innerHTML = currentlyVisible
                    ? `All versions (${viewAllButton.dataset.totalVersions}) <i class="fas fa-chevron-down"></i>`
                    : `Show less <i class="fas fa-chevron-up"></i>`;
            }
            return;
        }

        const addTagButton = event.target.closest('.civitai-add-tag-button');
        if (addTagButton) {
            event.preventDefault();
            const modelId = addTagButton.dataset.modelId;
            const manager = addTagButton.closest('.civitai-user-tag-manager');
            const input = manager?.querySelector('.civitai-user-tag-input-field');
            if (!modelId || !input) return;
            const value = input.value;
            const trimmed = value.trim();
            const tagsBefore = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
            if (ui.addCustomTag(modelId, trimmed)) {
                input.value = '';
                ui.updateCardTagUI(modelId);
                const tagsAfter = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
                let tagSetChanged = false;
                if (tagsAfter.size !== tagsBefore.size) tagSetChanged = true;
                else {
                    tagsAfter.forEach(tag => {
                        if (!tagsBefore.has(tag)) tagSetChanged = true;
                    });
                }
                if (tagSetChanged) ui.refreshAllTagManagers();
                ui.updateTagFilterControls();
                ui.applyTagFilters();
                ui.updateBulkTagControls();
            }
            return;
        }

        const removeTagButton = event.target.closest('.civitai-remove-tag-button');
        if (removeTagButton) {
            event.preventDefault();
            const modelId = removeTagButton.dataset.modelId;
            const encodedTag = removeTagButton.dataset.tag || '';
            const tag = encodedTag ? decodeURIComponent(encodedTag) : '';
            const tagsBefore = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
            if (ui.removeCustomTag(modelId, tag)) {
                ui.updateCardTagUI(modelId);
                const tagsAfter = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
                let tagSetChanged = false;
                if (tagsAfter.size !== tagsBefore.size) tagSetChanged = true;
                else {
                    tagsBefore.forEach(t => {
                        if (!tagsAfter.has(t)) tagSetChanged = true;
                    });
                }
                if (tagSetChanged) ui.refreshAllTagManagers();
                ui.updateTagFilterControls();
                ui.applyTagFilters();
                ui.updateBulkTagControls();
            }
            return;
        }

        // Click on model name link to open preview
        const nameLink = event.target.closest('.civitai-search-name');
        if (nameLink) {
            event.preventDefault();
            const modelId = nameLink.dataset.modelId;
            const versionId = nameLink.dataset.versionId;
            if (modelId) {
                ui.modelUrlInput.value = modelId;
                ui.modelVersionIdInput.value = versionId || '';
                ui.customFilenameInput.value = '';
                ui.forceRedownloadCheckbox.checked = false;
                ui.switchTab('download');
                ui.fetchAndDisplayDownloadPreview();
                ui.showToast(`Opened preview for model ${modelId}.`, 'info', 2500);
            }
            return;
        }

        // Checkbox toggle (delegated)
        const cb = event.target.closest('.civitai-select-checkbox');
        if (cb) {
            const modelId = cb.dataset.modelId;
            ui.toggleSelection(modelId, cb.checked);
            return;
        }
    });

    ui.searchResultsContainer.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLElement && event.target.classList.contains('civitai-user-tag-input-field') && event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            const modelId = input.dataset.modelId;
            if (!modelId) return;
            const value = input.value;
            const trimmed = value.trim();
            const tagsBefore = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
            if (ui.addCustomTag(modelId, trimmed)) {
                input.value = '';
                ui.updateCardTagUI(modelId);
                const tagsAfter = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
                let tagSetChanged = false;
                if (tagsAfter.size !== tagsBefore.size) tagSetChanged = true;
                else {
                    tagsAfter.forEach(tag => {
                        if (!tagsBefore.has(tag)) tagSetChanged = true;
                    });
                }
                if (tagSetChanged) ui.refreshAllTagManagers();
                ui.updateTagFilterControls();
                ui.applyTagFilters();
                ui.updateBulkTagControls();
            }
        }
    });

    ui.searchResultsContainer.addEventListener('change', (event) => {
        const quickCheckbox = event.target.closest('.civitai-tag-quick-checkbox');
        if (quickCheckbox) {
            const modelId = quickCheckbox.dataset.modelId;
            const encodedTag = quickCheckbox.dataset.tag || '';
            const tag = encodedTag ? decodeURIComponent(encodedTag) : '';
            if (!modelId || !tag) return;
            const shouldApply = quickCheckbox.checked;
            const lowerTag = tag.toLowerCase();
            const tagsBefore = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
            let changed = false;
            if (shouldApply) {
                changed = ui.addCustomTag(modelId, tag, { silent: true });
            } else {
                changed = ui.removeCustomTag(modelId, tag, { silent: true });
            }
            if (changed) {
                ui.updateCardTagUI(modelId);
                const tagsAfter = new Set(ui.getAllCustomTags().map(t => t.toLowerCase()));
                const tagSetChanged = shouldApply ? !tagsBefore.has(lowerTag) : !tagsAfter.has(lowerTag);
                if (tagSetChanged) {
                    ui.refreshAllTagManagers();
                }
                ui.updateTagFilterControls();
                ui.applyTagFilters();
                ui.updateBulkTagControls();
            }
        }
    });

    ui.modal.addEventListener('change', (event) => {
        if (event.target === ui.bulkTagSelect) {
            ui.updateBulkTagButtonStates();
            return;
        }
        const logicRadio = event.target.closest('input[name="civitai-tag-logic"]');
        if (logicRadio) {
            ui.tagFilterLogic = logicRadio.value === 'or' ? 'or' : 'and';
            ui.saveLayoutPreferences();
            ui.applyTagFilters();
            return;
        }
    });

    ui.modal.addEventListener('input', (event) => {
        if (event.target === ui.bulkTagInput) {
            ui.updateBulkTagButtonStates();
        }
    });

    ui.modal.addEventListener('keydown', (event) => {
        if (event.target === ui.bulkTagInput && event.key === 'Enter') {
            event.preventDefault();
            ui.bulkApplyNewTag();
        }
    });

    // Bulk actions and tag filters
    ui.modal.addEventListener('click', (event) => {
        const tagChip = event.target.closest('.civitai-tag-filter-chip');
        if (tagChip) {
            event.preventDefault();
            const encoded = tagChip.dataset.tag || '';
            const tag = encoded ? decodeURIComponent(encoded) : '';
            ui.toggleTagFilter(tag);
            return;
        }
        const clearFilters = event.target.closest('#civitai-clear-tag-filters');
        if (clearFilters) {
            event.preventDefault();
            if (ui.clearTagFilters()) {
                ui.showToast('Cleared tag filters.', 'info', 2000);
            }
            return;
        }
        const bulkApplyTag = event.target.closest('#civitai-bulk-apply-tag');
        if (bulkApplyTag) {
            event.preventDefault();
            ui.bulkApplyExistingTag();
            return;
        }
        const bulkCreateTag = event.target.closest('#civitai-bulk-create-tag');
        if (bulkCreateTag) {
            event.preventDefault();
            ui.bulkApplyNewTag();
            return;
        }
        const bulkDownload = event.target.closest('#civitai-bulk-download');
        if (bulkDownload) {
            event.preventDefault();
            ui.bulkDownloadSelected();
            return;
        }
        const selectAll = event.target.closest('#civitai-select-all');
        if (selectAll) {
            if (selectAll.disabled) return;
            const visibleCards = ui.getVisibleSearchCards();
            const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(card => {
                const id = card?.dataset?.modelId;
                return id && ui.selectedModels.has(String(id));
            });
            if (allVisibleSelected) ui.deselectAllVisible();
            else ui.selectAllVisible();
            return;
        }
    });

    // Pagination
    ui.searchPaginationContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.civitai-page-button');
        if (button && !button.disabled) {
            const page = parseInt(button.dataset.page, 10);
            if (page && page !== ui.searchPagination.currentPage) {
                ui.searchPagination.currentPage = page;
                ui.handleSearchSubmit();
            }
        }
    });

    // Confirmation Modal
    ui.confirmClearYesButton.addEventListener('click', () => ui.handleClearHistory());
    ui.confirmClearNoButton.addEventListener('click', () => {
        ui.confirmClearModal.style.display = 'none';
    });
    ui.confirmClearModal.addEventListener('click', (event) => {
        if (event.target === ui.confirmClearModal) {
            ui.confirmClearModal.style.display = 'none';
        }
    });
}
