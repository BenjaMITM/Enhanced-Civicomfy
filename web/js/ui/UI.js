import { Feedback } from "./feedback.js";
import { setupEventListeners } from "./handlers/eventListeners.js";
import { handleDownloadSubmit, fetchAndDisplayDownloadPreview, debounceFetchDownloadPreview } from "./handlers/downloadHandler.js";
import { handleSearchSubmit } from "./handlers/searchHandler.js";
import { handleSettingsSave, loadAndApplySettings, loadSettingsFromCookie, saveSettingsToCookie, applySettings, getDefaultSettings } from "./handlers/settingsHandler.js";
import { startStatusUpdates, stopStatusUpdates, updateStatus, handleCancelDownload, handleRetryDownload, handleOpenPath, handleClearHistory } from "./handlers/statusHandler.js";
import { renderSearchResults } from "./searchRenderer.js";
import { renderDownloadList } from "./statusRenderer.js";
import { renderDownloadPreview } from "./previewRenderer.js";
import { modalTemplate } from "./templates.js";
import { CivitaiDownloaderAPI } from "../api/civitai.js";

export class CivitaiDownloaderUI {
    constructor() {
        this.modal = null;
        this.tabs = {};
        this.tabContents = {};
        this.activeTab = 'download';
        this.modelTypes = {};
        this.statusInterval = null;
        this.statusData = { queue: [], active: [], history: [] };
        this.baseModels = [];
        this.searchPagination = { currentPage: 1, totalPages: 1, limit: 50 };
        this.settings = this.getDefaultSettings();
        this.toastTimeout = null;
        this.modelPreviewDebounceTimeout = null;
        this.selectedModels = new Set();
        this.gridLayoutSize = 'large';
        this.customTags = new Map();
        this.activeTagFilters = new Set();
        this.tagFilterLogic = 'and';
        this.lastSearchBaseParams = null;
        this.loadedPages = new Set();
        this.loadedModelIds = new Set();
        this.highestLoadedPage = 0;
        this.fetchingAdditionalResults = false;
        this.filterTopUpScheduledId = null;
        this.currentSearchItems = [];
        this.currentSearchMetadata = null;

        this.updateStatus();
        this.buildModalHTML();
        this.cacheDOMElements();
        this.loadLayoutPreferences();
        this.loadCustomTags();
        this.loadActiveTagFilters();
        this.updateTagFilterControls();
        this.updateBulkTagControls();
        this.updateBulkTagButtonStates();
        this.setupEventListeners();
        this.feedback = new Feedback(this.modal.querySelector('#civitai-toast'));
        // Ensure icon stylesheet is loaded so buttons render icons immediately
        this.ensureFontAwesome();
    }

    // --- Core UI Methods ---
    buildModalHTML() {
        this.modal = document.createElement('div');
        this.modal.className = 'civitai-downloader-modal';
        this.modal.id = 'civitai-downloader-modal';
        this.modal.innerHTML = modalTemplate(this.settings);
    }

    cacheDOMElements() {
        this.closeButton = this.modal.querySelector('#civitai-close-modal');
        this.tabContainer = this.modal.querySelector('.civitai-downloader-tabs');

        // Download Tab
        this.downloadForm = this.modal.querySelector('#civitai-download-form');
        this.downloadPreviewArea = this.modal.querySelector('#civitai-download-preview-area');
        this.modelUrlInput = this.modal.querySelector('#civitai-model-url');
        this.modelVersionIdInput = this.modal.querySelector('#civitai-model-version-id');
        this.downloadModelTypeSelect = this.modal.querySelector('#civitai-model-type');
        this.createModelTypeButton = this.modal.querySelector('#civitai-create-model-type');
        this.customFilenameInput = this.modal.querySelector('#civitai-custom-filename');
        this.subdirSelect = this.modal.querySelector('#civitai-subdir-select');
        this.createSubdirButton = this.modal.querySelector('#civitai-create-subdir');
        this.downloadConnectionsInput = this.modal.querySelector('#civitai-connections');
        this.forceRedownloadCheckbox = this.modal.querySelector('#civitai-force-redownload');
        this.downloadSubmitButton = this.modal.querySelector('#civitai-download-submit');

        // Search Tab
        this.searchForm = this.modal.querySelector('#civitai-search-form');
        this.searchQueryInput = this.modal.querySelector('#civitai-search-query');
        this.searchTypeSelect = this.modal.querySelector('#civitai-search-type');
        this.searchBaseModelSelect = this.modal.querySelector('#civitai-search-base-model');
        this.searchSortSelect = this.modal.querySelector('#civitai-search-sort');
        this.searchPeriodSelect = this.modal.querySelector('#civitai-search-period');
        this.searchSubmitButton = this.modal.querySelector('#civitai-search-submit');
        this.searchResultsContainer = this.modal.querySelector('#civitai-search-results');
        this.searchPaginationContainer = this.modal.querySelector('#civitai-search-pagination');
        this.searchLimitSelect = this.modal.querySelector('#civitai-search-limit');
        // Bulk actions
        this.bulkActionsBar = this.modal.querySelector('#civitai-bulk-actions');
        this.bulkDownloadButton = this.modal.querySelector('#civitai-bulk-download');
        this.selectAllButton = this.modal.querySelector('#civitai-select-all');
        this.selectedCountSpan = this.modal.querySelector('#civitai-selected-count');
        this.bulkTagger = this.modal.querySelector('#civitai-bulk-tagger');
        this.bulkTagSelect = this.modal.querySelector('#civitai-bulk-tag-select');
        this.bulkApplyTagButton = this.modal.querySelector('#civitai-bulk-apply-tag');
        this.bulkTagInput = this.modal.querySelector('#civitai-bulk-tag-input');
        this.bulkCreateTagButton = this.modal.querySelector('#civitai-bulk-create-tag');
        this.tagFilterContainer = this.modal.querySelector('#civitai-tag-filters');
        this.tagFilterList = this.modal.querySelector('#civitai-tag-filter-list');
        this.tagFilterStatus = this.modal.querySelector('#civitai-tag-filter-status');
        this.clearTagFiltersButton = this.modal.querySelector('#civitai-clear-tag-filters');
        this.tagFilterLogicRadios = this.modal.querySelectorAll('input[name="civitai-tag-logic"]');

        // Status Tab
        this.statusContent = this.modal.querySelector('#civitai-status-content');
        this.activeListContainer = this.modal.querySelector('#civitai-active-list');
        this.queuedListContainer = this.modal.querySelector('#civitai-queued-list');
        this.historyListContainer = this.modal.querySelector('#civitai-history-list');
        this.statusIndicator = this.modal.querySelector('#civitai-status-indicator');
        this.activeCountSpan = this.modal.querySelector('#civitai-active-count');
        this.clearHistoryButton = this.modal.querySelector('#civitai-clear-history-button');
        this.confirmClearModal = this.modal.querySelector('#civitai-confirm-clear-modal');
        this.confirmClearYesButton = this.modal.querySelector('#civitai-confirm-clear-yes');
        this.confirmClearNoButton = this.modal.querySelector('#civitai-confirm-clear-no');

        // Settings Tab
        this.settingsForm = this.modal.querySelector('#civitai-settings-form');
        this.settingsApiKeyInput = this.modal.querySelector('#civitai-settings-api-key');
        this.settingsConnectionsInput = this.modal.querySelector('#civitai-settings-connections');
        this.settingsDefaultTypeSelect = this.modal.querySelector('#civitai-settings-default-type');
        this.settingsAutoOpenCheckbox = this.modal.querySelector('#civitai-settings-auto-open-status');
        this.settingsHideMatureCheckbox = this.modal.querySelector('#civitai-settings-hide-mature');
        this.settingsNsfwThresholdInput = this.modal.querySelector('#civitai-settings-nsfw-threshold');
        this.settingsSaveButton = this.modal.querySelector('#civitai-settings-save');

        // Toast Notification
        this.toastElement = this.modal.querySelector('#civitai-toast');

        // Collect tabs and contents
        this.tabs = {};
        this.modal.querySelectorAll('.civitai-downloader-tab').forEach(tab => {
            this.tabs[tab.dataset.tab] = tab;
        });
        this.tabContents = {};
        this.modal.querySelectorAll('.civitai-downloader-tab-content').forEach(content => {
            const tabName = content.id.replace('civitai-tab-', '');
            if (tabName) this.tabContents[tabName] = content;
        });
    }

    async initializeUI() {
        console.info("[Civicomfy] Initializing UI components...");
        await this.populateModelTypes();
        await this.populateBaseModels();
        this.loadAndApplySettings();
    }

    async populateModelTypes() {
        console.log("[Civicomfy] Populating model types...");
        try {
            const types = await CivitaiDownloaderAPI.getModelTypes();
            if (!types || typeof types !== 'object' || Object.keys(types).length === 0) {
                 throw new Error("Received invalid model types data format.");
            }
            this.modelTypes = types;
            const sortedTypes = Object.entries(this.modelTypes).sort((a, b) => a[1].localeCompare(b[1]));

            this.downloadModelTypeSelect.innerHTML = '';
            this.searchTypeSelect.innerHTML = '<option value="any">Any Type</option>';
            this.settingsDefaultTypeSelect.innerHTML = '';

            sortedTypes.forEach(([key, displayName]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = displayName;
            this.downloadModelTypeSelect.appendChild(option.cloneNode(true));
            this.settingsDefaultTypeSelect.appendChild(option.cloneNode(true));
            this.searchTypeSelect.appendChild(option.cloneNode(true));
        });
        // After types are populated, load subdirs for the current selection
        await this.loadAndPopulateSubdirs(this.downloadModelTypeSelect.value);
        } catch (error) {
            console.error("[Civicomfy] Failed to get or populate model types:", error);
            this.showToast('Failed to load model types', 'error');
            this.downloadModelTypeSelect.innerHTML = '<option value="checkpoint">Checkpoint (Default)</option>';
            this.modelTypes = { "checkpoint": "Checkpoint (Default)" };
        }
    }

    async loadAndPopulateSubdirs(modelType) {
        try {
            const res = await CivitaiDownloaderAPI.getModelDirs(modelType);
            const select = this.subdirSelect;
            if (!select) return;
            const current = select.value;
            select.innerHTML = '';
            const optRoot = document.createElement('option');
            optRoot.value = '';
            optRoot.textContent = '(root)';
            select.appendChild(optRoot);
            if (res && Array.isArray(res.subdirs)) {
                // res.subdirs contains '' for root; skip empty since we added (root)
                res.subdirs.filter(p => p && typeof p === 'string').forEach(rel => {
                    const opt = document.createElement('option');
                    opt.value = rel;
                    opt.textContent = rel;
                    select.appendChild(opt);
                });
            }
            // Restore selection if still present
            if (Array.from(select.options).some(o => o.value === current)) {
                select.value = current;
            }
        } catch (e) {
            console.error('[Civicomfy] Failed to load subdirectories:', e);
            if (this.subdirSelect) {
                this.subdirSelect.innerHTML = '<option value="">(root)</option>';
            }
        }
    }

    // (loadAndPopulateRoots removed; dynamic types already reflect models/ subfolders)

    async populateBaseModels() {
        console.log("[Civicomfy] Populating base models...");
        try {
            const result = await CivitaiDownloaderAPI.getBaseModels();
            if (!result || !Array.isArray(result.base_models)) {
                throw new Error("Invalid base models data format received.");
            }
            this.baseModels = result.base_models.sort();
            const existingOptions = Array.from(this.searchBaseModelSelect.options);
            existingOptions.slice(1).forEach(opt => opt.remove());
            this.baseModels.forEach(baseModelName => {
                const option = document.createElement('option');
                option.value = baseModelName;
                option.textContent = baseModelName;
                this.searchBaseModelSelect.appendChild(option);
            });
        } catch (error) {
             console.error("[Civicomfy] Failed to get or populate base models:", error);
             this.showToast('Failed to load base models list', 'error');
        }
    }

    switchTab(tabId) {
        if (this.activeTab === tabId || !this.tabs[tabId] || !this.tabContents[tabId]) return;

        this.tabs[this.activeTab]?.classList.remove('active');
        this.tabContents[this.activeTab]?.classList.remove('active');

        this.tabs[tabId].classList.add('active');
        this.tabContents[tabId].classList.add('active');
        this.tabContents[tabId].scrollTop = 0;
        this.activeTab = tabId;

        if (tabId === 'status') this.updateStatus();
        else if (tabId === 'settings') this.applySettings();
        else if(tabId === 'download') {
            this.downloadConnectionsInput.value = this.settings.numConnections;
            if (Object.keys(this.modelTypes).length > 0) {
                this.downloadModelTypeSelect.value = this.settings.defaultModelType;
            }
        }
    }

    // --- Modal Control ---
    openModal() {
        this.modal?.classList.add('open');
        document.body.style.setProperty('overflow', 'hidden', 'important');
        this.startStatusUpdates();
        if (this.activeTab === 'status') this.updateStatus();
        if (!this.settings.apiKey) this.switchTab('settings');
    }

    closeModal() {
        this.modal?.classList.remove('open');
        document.body.style.removeProperty('overflow');
        this.stopStatusUpdates();
    }

    // --- Utility Methods ---
    formatBytes(bytes, decimals = 2) {
        if (bytes === null || bytes === undefined || isNaN(bytes)) return 'N/A';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        if (!isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
        return this.formatBytes(bytesPerSecond) + '/s';
    }

    formatDuration(isoStart, isoEnd) {
        try {
            const diffSeconds = Math.round((new Date(isoEnd) - new Date(isoStart)) / 1000);
            if (isNaN(diffSeconds) || diffSeconds < 0) return 'N/A';
            if (diffSeconds < 60) return `${diffSeconds}s`;
            const diffMinutes = Math.floor(diffSeconds / 60);
            const remainingSeconds = diffSeconds % 60;
            return `${diffMinutes}m ${remainingSeconds}s`;
        } catch (e) {
            return 'N/A';
        }
    }

    showToast(message, type = 'info', duration = 3000) {
        this.feedback?.show(message, type, duration);
    }

    ensureFontAwesome() {
        this.feedback?.ensureFontAwesome();
    }

    // --- Rendering (delegated to external renderers) ---
    renderDownloadList = (items, container, emptyMessage) => renderDownloadList(this, items, container, emptyMessage);
    renderSearchResults = (items, options) => renderSearchResults(this, items, options);
    renderDownloadPreview = (data) => renderDownloadPreview(this, data);

    // --- Selection & Bulk actions helpers ---
    updateBulkActionsUI() {
        const count = this.selectedModels.size;
        if (this.selectedCountSpan) this.selectedCountSpan.textContent = `${count} selected`;
        if (this.bulkDownloadButton) this.bulkDownloadButton.disabled = count === 0;
        if (this.bulkActionsBar) this.bulkActionsBar.style.display = count > 0 ? '' : 'none';
        if (this.selectAllButton && this.searchResultsContainer) {
            const visibleCards = this.getVisibleSearchCards();
            const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(card => {
                const id = card?.dataset?.modelId;
                return id && this.selectedModels.has(String(id));
            });
            this.selectAllButton.textContent = allVisibleSelected ? 'Deselect Visible' : 'Select Visible';
            this.selectAllButton.disabled = visibleCards.length === 0;
        }
        this.updateBulkTagControls();
    }

    // --- Layout helpers ---
    setGridLayoutSize(size, { persist = true } = {}) {
        if (!size || (size !== 'large' && size !== 'compact')) return;
        this.gridLayoutSize = size;
        this.applyGridLayoutSize();
        this.syncGridSizeButtons();
        if (persist) this.saveLayoutPreferences();
    }

    applyGridLayoutSize() {
        if (!this.searchResultsContainer) return;
        this.searchResultsContainer.classList.remove('grid-large', 'grid-compact');
        this.searchResultsContainer.classList.add(`grid-${this.gridLayoutSize}`);
    }

    syncGridSizeButtons() {
        if (!this.modal) return;
        this.modal.querySelectorAll('.civitai-grid-size-button').forEach(btn => {
            const isActive = btn.dataset.gridSize === this.gridLayoutSize;
            btn.classList.toggle('active', isActive);
        });
    }

    loadLayoutPreferences() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) {
                this.applyGridLayoutSize();
                this.syncGridSizeButtons();
                return;
            }
            const stored = window.localStorage.getItem('civicomfy_grid_size');
            if (stored === 'compact' || stored === 'large') {
                this.gridLayoutSize = stored;
            }
            const storedLogic = window.localStorage.getItem('civicomfy_tag_logic');
            if (storedLogic === 'or' || storedLogic === 'and') {
                this.tagFilterLogic = storedLogic;
            }
        } catch (e) {
            console.warn('[Civicomfy] Failed to load grid layout preference:', e);
        }
        this.applyGridLayoutSize();
        this.syncGridSizeButtons();
        this.syncTagLogicRadios();
    }

    saveLayoutPreferences() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.setItem('civicomfy_grid_size', this.gridLayoutSize);
            window.localStorage.setItem('civicomfy_tag_logic', this.tagFilterLogic);
        } catch (e) {
            console.warn('[Civicomfy] Failed to persist grid layout preference:', e);
        }
    }

    refreshSearchResults() {
        if (!Array.isArray(this.currentSearchItems)) return;
        this.renderSearchResults(this.currentSearchItems);
        this.updateTagFilterControls();
        this.syncTagLogicRadios();
        this.applyTagFilters();
        this.updateBulkActionsUI();
    }

    // --- Custom tag helpers ---
    loadCustomTags() {
        this.customTags = new Map();
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const raw = window.localStorage.getItem('civicomfy_custom_tags');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                Object.entries(parsed).forEach(([modelId, tags]) => {
                    if (!Array.isArray(tags)) return;
                    const cleaned = [...new Set(tags
                        .map(tag => typeof tag === 'string' ? tag.trim() : '')
                        .filter(Boolean)
                    )].sort((a, b) => a.localeCompare(b));
                    if (cleaned.length > 0) this.customTags.set(String(modelId), cleaned);
                });
            }
        } catch (e) {
            console.warn('[Civicomfy] Failed to load custom tags:', e);
        }
    }

    saveCustomTags() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const serialisable = {};
            this.customTags.forEach((tags, modelId) => {
                if (Array.isArray(tags) && tags.length > 0) {
                    serialisable[modelId] = tags;
                }
            });
            window.localStorage.setItem('civicomfy_custom_tags', JSON.stringify(serialisable));
        } catch (e) {
            console.warn('[Civicomfy] Failed to save custom tags:', e);
        }
    }

    getCustomTags(modelId) {
        const key = String(modelId);
        const tags = this.customTags.get(key);
        return Array.isArray(tags) ? [...tags] : [];
    }

    addCustomTag(modelId, rawTag, { silent = false } = {}) {
        if (!modelId || typeof rawTag !== 'string') return false;
        const tag = rawTag.trim();
        if (!tag) {
            if (!silent) this.showToast('Tag cannot be empty.', 'warning');
            return false;
        }
        if (tag.length > 40) {
            if (!silent) this.showToast('Tag is too long (40 char max).', 'warning');
            return false;
        }
        const key = String(modelId);
        const existing = this.customTags.get(key) || [];
        const alreadyExists = existing.some(t => t.toLowerCase() === tag.toLowerCase());
        if (alreadyExists) {
            if (!silent) this.showToast('Tag already exists for this model.', 'info');
            return false;
        }
        existing.push(tag);
        existing.sort((a, b) => a.localeCompare(b));
        this.customTags.set(key, existing);
        this.saveCustomTags();
        if (!silent) this.showToast(`Added tag "${tag}"`, 'success', 2000);
        return true;
    }

    removeCustomTag(modelId, tag, { silent = false } = {}) {
        if (!modelId || !tag) return false;
        const key = String(modelId);
        const existing = this.customTags.get(key);
        if (!existing) return false;
        const filtered = existing.filter(t => t.toLowerCase() !== tag.toLowerCase());
        if (filtered.length === 0) {
            this.customTags.delete(key);
        } else {
            this.customTags.set(key, filtered.sort((a, b) => a.localeCompare(b)));
        }
        this.saveCustomTags();
        if (!silent) this.showToast(`Removed tag "${tag}"`, 'info', 2000);
        return true;
    }

    getAllCustomTags() {
        const unique = new Set();
        this.customTags.forEach(tags => {
            if (Array.isArray(tags)) {
                tags.forEach(tag => unique.add(tag));
            }
        });
        return Array.from(unique).sort((a, b) => a.localeCompare(b));
    }

    applyTagFilters(skipTopUp = false) {
        if (!this.searchResultsContainer) return;
        const cards = Array.from(this.searchResultsContainer.querySelectorAll('.civitai-search-item'));
        if (cards.length === 0) {
            this.updateTagFilterStatus(0, 0);
            if (!skipTopUp) this.cancelFilterTopUp();
            return;
        }

        const activeFilters = Array.from(this.activeTagFilters);
        if (activeFilters.length === 0) {
            cards.forEach(card => card.classList.remove('tag-filter-hidden'));
            this.updateTagFilterStatus(cards.length, cards.length);
            this.cancelFilterTopUp();
            return;
        }

        const normalizedFilters = activeFilters.map(tag => tag.toLowerCase());
        let visibleCount = 0;
        cards.forEach(card => {
            const tagData = card.__tagData;
            const lowerTags = tagData ? tagData.lowerTags : this.getCustomTags(card.dataset.modelId).map(tag => tag.toLowerCase());
            let matches;
            if (this.tagFilterLogic === 'or') {
                matches = normalizedFilters.some(tag => lowerTags.includes(tag));
            } else {
                matches = normalizedFilters.every(tag => lowerTags.includes(tag));
            }
            card.classList.toggle('tag-filter-hidden', !matches);
            if (matches) visibleCount += 1;
        });
        this.updateTagFilterStatus(visibleCount, cards.length);
        if (!skipTopUp && this.activeTagFilters.size > 0) {
            const desiredCount = this.getCurrentSearchLimit();
            if (visibleCount < desiredCount) this.scheduleFilterTopUp();
            else this.cancelFilterTopUp();
        }
    }

    updateTagFilterControls() {
        if (!this.tagFilterContainer || !this.tagFilterList) return;
        const tags = this.getAllCustomTags();
        if (tags.length === 0) {
            this.tagFilterContainer.style.display = 'none';
            this.tagFilterList.innerHTML = '';
            if (this.clearTagFiltersButton) {
                this.clearTagFiltersButton.disabled = true;
            }
            if (this.tagFilterStatus) {
                this.tagFilterStatus.textContent = '';
            }
            this.activeTagFilters.clear();
            this.saveActiveTagFilters();
            this.cancelFilterTopUp();
            return;
        }

        this.tagFilterContainer.style.display = '';
        const availableLower = new Set(tags.map(tag => tag.toLowerCase()));
        let removed = false;
        this.activeTagFilters.forEach(tag => {
            if (!availableLower.has(tag.toLowerCase())) {
                this.activeTagFilters.delete(tag);
                removed = true;
            }
        });
        if (removed) this.saveActiveTagFilters();

        const chipsHtml = tags.map(tag => {
            const encoded = encodeURIComponent(tag);
            const label = this.escapeHtml(tag);
            const isActive = this.activeTagFilters.has(tag);
            return `<button type="button" class="civitai-tag-filter-chip${isActive ? ' active' : ''}" data-tag="${encoded}">${label}</button>`;
        }).join('');

        this.tagFilterList.innerHTML = chipsHtml;
        if (this.clearTagFiltersButton) {
            this.clearTagFiltersButton.disabled = this.activeTagFilters.size === 0;
        }
        this.syncTagLogicRadios();
    }

    syncTagLogicRadios() {
        if (!this.tagFilterLogicRadios || this.tagFilterLogicRadios.length === 0) return;
        this.tagFilterLogicRadios.forEach(radio => {
            radio.checked = radio.value === this.tagFilterLogic;
        });
    }

    updateBulkTagControls() {
        if (!this.bulkTagger) return;
        const selectedCount = this.selectedModels.size;

        if (selectedCount === 0) {
            this.bulkTagger.style.display = 'none';
            if (this.bulkTagSelect) this.bulkTagSelect.value = '';
            this.updateBulkTagButtonStates();
            return;
        }

        this.bulkTagger.style.display = '';
        const tags = this.getAllCustomTags();

        if (this.bulkTagSelect) {
            const previous = this.bulkTagSelect.value;
            this.bulkTagSelect.innerHTML = '<option value="">Choose existing tag…</option>';
            tags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag;
                opt.textContent = tag;
                this.bulkTagSelect.appendChild(opt);
            });
            if (previous && tags.includes(previous)) {
                this.bulkTagSelect.value = previous;
            } else if (tags.length === 1) {
                this.bulkTagSelect.value = tags[0];
            }
        }

        this.updateBulkTagButtonStates();
    }

    updateBulkTagButtonStates() {
        const hasSelection = this.selectedModels.size > 0;
        if (this.bulkApplyTagButton) {
            const tagValue = this.bulkTagSelect ? this.bulkTagSelect.value.trim() : '';
            this.bulkApplyTagButton.disabled = !hasSelection || !tagValue;
        }
        if (this.bulkCreateTagButton) {
            const newTagValue = this.bulkTagInput ? this.bulkTagInput.value.trim() : '';
            this.bulkCreateTagButton.disabled = !hasSelection || !newTagValue;
        }
    }

    applyTagToSelected(tag) {
        const normalized = (tag || '').trim();
        if (!normalized || this.selectedModels.size === 0) return { added: 0, already: 0 };

        const lower = normalized.toLowerCase();
        const tagsBefore = new Set(this.getAllCustomTags().map(t => t.toLowerCase()));
        const changedIds = new Set();
        let added = 0;
        let already = 0;

        this.selectedModels.forEach(modelId => {
            const current = this.getCustomTags(modelId);
            const hasTag = current.some(t => t.toLowerCase() === lower);
            if (hasTag) {
                already += 1;
                return;
            }
            const success = this.addCustomTag(modelId, normalized, { silent: true });
            if (success) {
                added += 1;
                changedIds.add(String(modelId));
            }
        });

        if (changedIds.size > 0) {
            const tagsAfter = new Set(this.getAllCustomTags().map(t => t.toLowerCase()));
            let tagSetChanged = false;
            if (tagsAfter.size !== tagsBefore.size) {
                tagSetChanged = true;
            } else {
                tagsAfter.forEach(tagName => {
                    if (!tagsBefore.has(tagName)) tagSetChanged = true;
                });
            }

            changedIds.forEach(id => this.updateCardTagUI(id));
            if (tagSetChanged) this.refreshAllTagManagers();
            this.updateTagFilterControls();
            this.applyTagFilters();
            this.updateBulkTagControls();
        } else {
            this.updateBulkTagControls();
        }

        return { added, already };
    }

    bulkApplyExistingTag() {
        if (!this.bulkTagSelect) return;
        if (this.selectedModels.size === 0) {
            this.showToast('Select one or more models first.', 'warning');
            return;
        }
        const tag = this.bulkTagSelect.value.trim();
        if (!tag) {
            this.showToast('Choose an existing tag to apply.', 'warning');
            return;
        }

        const { added, already } = this.applyTagToSelected(tag);
        if (added === 0 && already === 0) {
            this.showToast('No tags were applied.', 'info', 2500);
            return;
        }
        if (added === 0 && already > 0) {
            this.showToast(`All selected models already have tag "${tag}".`, 'info', 2500);
            return;
        }

        const messageParts = [];
        if (added > 0) messageParts.push(`${added} new`);
        if (already > 0) messageParts.push(`${already} already tagged`);
        const summary = messageParts.length > 0 ? ` (${messageParts.join(', ')})` : '';
        this.showToast(`Applied tag "${tag}" to ${this.selectedModels.size} model${this.selectedModels.size === 1 ? '' : 's'}${summary}.`, 'success', 3500);
        this.updateBulkTagControls();
    }

    bulkApplyNewTag() {
        if (!this.bulkTagInput) return;
        if (this.selectedModels.size === 0) {
            this.showToast('Select one or more models first.', 'warning');
            return;
        }
        const raw = this.bulkTagInput.value || '';
        const tag = raw.trim();
        if (!tag) {
            this.showToast('Enter a tag name to add.', 'warning');
            return;
        }
        if (tag.length > 40) {
            this.showToast('Tag is too long (40 char max).', 'warning');
            return;
        }

        const { added, already } = this.applyTagToSelected(tag);
        if (added === 0 && already === 0) {
            this.showToast('No tags were applied.', 'info', 2500);
            return;
        }
        if (added === 0 && already > 0) {
            this.showToast(`All selected models already have tag "${tag}".`, 'info', 2500);
        } else {
            this.showToast(`Added tag "${tag}" to ${added} model${added === 1 ? '' : 's'}${already > 0 ? ` (${already} already tagged)` : ''}.`, 'success', 3500);
        }

        this.bulkTagInput.value = '';
        if (this.bulkTagSelect) {
            this.bulkTagSelect.value = tag;
        }
        this.updateBulkTagControls();
        this.updateBulkTagButtonStates();
    }

    buildUserTagManagerInnerHTML(modelId, tagsOverride = null, allTagsOverride = null) {
        const userTags = Array.isArray(tagsOverride) ? [...tagsOverride] : this.getCustomTags(modelId);
        const userTagsHtml = userTags.length > 0
            ? userTags.map(tag => {
                const encoded = encodeURIComponent(tag);
                const label = this.escapeHtml(tag);
                return `
                  <span class="civitai-user-tag" data-tag="${encoded}">
                    <span class="civitai-user-tag-label">${label}</span>
                    <button type="button" class="civitai-remove-tag-button" data-model-id="${modelId}" data-tag="${encoded}" title="Remove tag">&times;</button>
                  </span>
                `;
            }).join('')
            : '<span class="civitai-user-no-tags">No custom tags yet</span>';

        const allTags = Array.isArray(allTagsOverride) ? allTagsOverride : this.getAllCustomTags();
        const lowerUserTags = userTags.map(tag => tag.toLowerCase());
        const quickApplyHtml = allTags.length > 0 ? `
          <div class="civitai-user-tag-quickapply">
            <span class="civitai-user-tag-quickapply-label">Quick tags</span>
            <div class="civitai-user-tag-quickapply-list">
              ${allTags.map(tag => {
                  const encoded = encodeURIComponent(tag);
                  const label = this.escapeHtml(tag);
                  const isChecked = lowerUserTags.includes(tag.toLowerCase()) ? 'checked' : '';
                  return `
                    <label class="civitai-tag-quick-option">
                      <input type="checkbox" class="civitai-tag-quick-checkbox" data-model-id="${modelId}" data-tag="${encoded}" ${isChecked}>
                      <span>${label}</span>
                    </label>
                  `;
              }).join('')}
            </div>
          </div>
        ` : '';

        return `
          <div class="civitai-user-tag-list">
            ${userTagsHtml}
          </div>
        ${quickApplyHtml}
        <div class="civitai-user-tag-input">
          <input type="text" class="civitai-input civitai-user-tag-input-field" placeholder="Add tag" maxlength="40" data-model-id="${modelId}" />
          <button type="button" class="civitai-button small civitai-add-tag-button" data-model-id="${modelId}" title="Add tag">Add</button>
        </div>
        `;
    }

    updateCardTagUI(modelId) {
        if (!this.searchResultsContainer) return;
        const manager = this.searchResultsContainer.querySelector(`.civitai-user-tag-manager[data-model-id="${modelId}"]`);
        if (!manager) return;
        const tags = this.getCustomTags(modelId);
        const card = manager.closest('.civitai-search-item');
        if (card) this.setCardTagDataset(card, tags);
        manager.innerHTML = this.buildUserTagManagerInnerHTML(modelId, tags);
    }

    refreshAllTagManagers() {
        if (!this.searchResultsContainer) return;
        const allTags = this.getAllCustomTags();
        this.searchResultsContainer.querySelectorAll('.civitai-user-tag-manager').forEach(manager => {
            const modelId = manager.dataset.modelId;
            if (!modelId) return;
            const tags = this.getCustomTags(modelId);
            const card = manager.closest('.civitai-search-item');
            if (card) this.setCardTagDataset(card, tags);
            manager.innerHTML = this.buildUserTagManagerInnerHTML(modelId, tags, allTags);
        });
    }

    setCardTagDataset(card, tags) {
        if (!card) return;
        const normalizedTags = Array.isArray(tags) ? [...tags] : [];
        const lowerTags = normalizedTags.map(tag => tag.toLowerCase());
        card.dataset.tags = normalizedTags.join('|');
        card.dataset.tagsLower = lowerTags.join('|');
        card.__tagData = { tags: normalizedTags, lowerTags };
    }

    getCurrentSearchLimit() {
        const selectValue = parseInt(this.searchLimitSelect?.value, 10);
        if (Number.isFinite(selectValue) && selectValue > 0) return selectValue;
        const paginationLimit = parseInt(this.searchPagination?.limit, 10);
        if (Number.isFinite(paginationLimit) && paginationLimit > 0) return paginationLimit;
        return 50;
    }

    scheduleFilterTopUp() {
        if (this.filterTopUpScheduledId !== null) return;
        if (this.fetchingAdditionalResults) return;
        if (!this.activeTagFilters || this.activeTagFilters.size === 0) return;
        this.filterTopUpScheduledId = requestAnimationFrame(async () => {
            this.filterTopUpScheduledId = null;
            try {
                await this.ensureFilteredResultsFillLimit();
            } catch (error) {
                console.error('[Civicomfy] Failed to top up filtered results:', error);
            }
        });
    }

    cancelFilterTopUp() {
        if (this.filterTopUpScheduledId !== null) {
            cancelAnimationFrame(this.filterTopUpScheduledId);
            this.filterTopUpScheduledId = null;
        }
    }

    async fetchAdditionalSearchPage(page) {
        if (!this.lastSearchBaseParams) return null;
        const params = { ...this.lastSearchBaseParams, page, limit: this.getCurrentSearchLimit() };
        try {
            const response = await CivitaiDownloaderAPI.searchModels(params);
            if (!response || !Array.isArray(response.items)) return null;

            if (response.metadata) {
                this.searchPagination = {
                    ...this.searchPagination,
                    totalPages: response.metadata.totalPages,
                    totalItems: response.metadata.totalItems,
                };
            }

            const newItems = [];
            response.items.forEach(item => {
                const id = item?.id;
                if (!id) return;
                const key = String(id);
                if (this.loadedModelIds && this.loadedModelIds.has(key)) return;
                this.loadedModelIds.add(key);
                newItems.push(item);
            });

            return { items: newItems, metadata: response.metadata };
        } catch (error) {
            console.error('[Civicomfy] Failed to fetch additional search page:', error);
            this.showToast('Failed to load more results for current filters.', 'error');
            return null;
        }
    }

    async ensureFilteredResultsFillLimit() {
        if (!this.activeTagFilters || this.activeTagFilters.size === 0) return;
        if (this.fetchingAdditionalResults) return;
        if (!this.lastSearchBaseParams) return;
        if (!this.searchPagination || !Number.isFinite(this.searchPagination.totalPages)) return;

        if (!this.loadedPages) this.loadedPages = new Set();
        if (!this.loadedModelIds) this.loadedModelIds = new Set();

        const desiredCount = this.getCurrentSearchLimit();
        if (!Number.isFinite(desiredCount) || desiredCount <= 0) return;

        let visibleCount = this.getVisibleSearchCards().length;
        if (visibleCount >= desiredCount) return;

        const totalPages = this.searchPagination.totalPages || 1;
        let nextPage = this.highestLoadedPage || this.searchPagination.currentPage || 1;
        let addedAny = false;

        this.fetchingAdditionalResults = true;
        try {
            while (visibleCount < desiredCount && nextPage < totalPages) {
                const targetPage = nextPage + 1;
                if (this.loadedPages && this.loadedPages.has(targetPage)) {
                    nextPage = targetPage;
                    continue;
                }

                const result = await this.fetchAdditionalSearchPage(targetPage);
                this.loadedPages?.add(targetPage);
                this.highestLoadedPage = Math.max(this.highestLoadedPage || 0, targetPage);

                if (!result) break;
                if (Array.isArray(result.items) && result.items.length > 0) {
                    this.currentSearchItems.push(...result.items);
                    addedAny = true;
                    this.renderSearchResults(result.items, { append: true });
                    this.applyTagFilters(true);
                    visibleCount = this.getVisibleSearchCards().length;
                    if (visibleCount >= desiredCount) break;
                }

                nextPage = targetPage;
                if (targetPage >= totalPages) break;
            }
        } finally {
            this.fetchingAdditionalResults = false;
            visibleCount = this.getVisibleSearchCards().length;
            const hasMorePages = (this.highestLoadedPage || 0) < (this.searchPagination?.totalPages || 1);
            if (addedAny) {
                this.renderSearchPagination(this.searchPagination);
            }
            if (addedAny && visibleCount < desiredCount && hasMorePages) {
                this.scheduleFilterTopUp();
            } else if (visibleCount >= desiredCount || !hasMorePages) {
                this.cancelFilterTopUp();
            }
        }
    }

    toggleTagFilter(tag) {
        if (!tag) return;
        const decoded = typeof tag === 'string' ? tag : String(tag);
        if (this.activeTagFilters.has(decoded)) this.activeTagFilters.delete(decoded);
        else this.activeTagFilters.add(decoded);
        this.saveActiveTagFilters();
        this.updateTagFilterControls();
        this.applyTagFilters();
        this.updateBulkActionsUI();
    }

    clearTagFilters() {
        if (this.activeTagFilters.size === 0) return false;
        this.activeTagFilters.clear();
        this.saveActiveTagFilters();
        this.updateTagFilterControls();
        this.applyTagFilters();
        this.updateBulkActionsUI();
        return true;
    }

    getVisibleSearchCards() {
        if (!this.searchResultsContainer) return [];
        return Array.from(this.searchResultsContainer.querySelectorAll('.civitai-search-item'))
            .filter(card => !card.classList.contains('tag-filter-hidden'));
    }

    updateTagFilterStatus(visibleCount, totalCount) {
        if (!this.tagFilterStatus) return;
        if (totalCount === 0) {
            this.tagFilterStatus.textContent = '';
            return;
        }
        if (this.activeTagFilters.size === 0) {
            this.tagFilterStatus.textContent = `${totalCount} models (no tag filters)`;
            return;
        }
        if (visibleCount === 0) {
            this.tagFilterStatus.textContent = 'No models match the selected tags.';
            return;
        }
        const filtersList = Array.from(this.activeTagFilters).join(', ');
        const logicLabel = this.tagFilterLogic === 'or' ? 'OR' : 'AND';
        this.tagFilterStatus.textContent = `${visibleCount} of ${totalCount} models match (${logicLabel}): ${filtersList}`;
    }

    escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    loadActiveTagFilters() {
        this.activeTagFilters = new Set();
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const raw = window.localStorage.getItem('civicomfy_active_tag_filters');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                parsed
                    .map(tag => typeof tag === 'string' ? tag.trim() : '')
                    .filter(Boolean)
                    .forEach(tag => this.activeTagFilters.add(tag));
            }
        } catch (e) {
            console.warn('[Civicomfy] Failed to load saved tag filters:', e);
        }
    }

    saveActiveTagFilters() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const value = JSON.stringify(Array.from(this.activeTagFilters));
            window.localStorage.setItem('civicomfy_active_tag_filters', value);
        } catch (e) {
            console.warn('[Civicomfy] Failed to persist tag filters:', e);
        }
    }

    isSelected(modelId) {
        return this.selectedModels.has(String(modelId));
    }

    toggleSelection(modelId, shouldSelect = null) {
        if (!modelId) return;
        const key = String(modelId);
        const select = shouldSelect === null ? !this.selectedModels.has(key) : !!shouldSelect;
        if (select) this.selectedModels.add(key);
        else this.selectedModels.delete(key);
        this.updateBulkActionsUI();
    }

    clearSelection() {
        this.selectedModels.clear();
        this.updateBulkActionsUI();
    }

    selectAllVisible() {
        if (!this.searchResultsContainer) return;
        this.getVisibleSearchCards().forEach(card => {
            const id = card?.dataset?.modelId;
            if (id) this.selectedModels.add(String(id));
        });
        this.updateBulkActionsUI();
        // Also reflect checkboxes in DOM
        this.getVisibleSearchCards().forEach(card => {
            const checkbox = card.querySelector('.civitai-select-checkbox');
            if (checkbox) checkbox.checked = true;
        });
    }

    deselectAllVisible() {
        if (!this.searchResultsContainer) return;
        this.getVisibleSearchCards().forEach(card => {
            const id = card?.dataset?.modelId;
            if (id) this.selectedModels.delete(String(id));
        });
        this.updateBulkActionsUI();
        this.getVisibleSearchCards().forEach(card => {
            const checkbox = card.querySelector('.civitai-select-checkbox');
            if (checkbox) checkbox.checked = false;
        });
    }

    async bulkDownloadSelected() {
        if (this.selectedModels.size === 0) return;
        const ids = Array.from(this.selectedModels);
        const defaultType = this.settings?.defaultModelType || 'checkpoint';
        const apiKey = this.settings?.apiKey || undefined;
        for (const id of ids) {
            try {
                await CivitaiDownloaderAPI.downloadModel({
                    model_url_or_id: id,
                    model_type: defaultType,
                    // model_version_id omitted to use latest
                    custom_filename: '',
                    subdir: '',
                    num_connections: Number(this.settings?.numConnections) || 1,
                    force_redownload: false,
                    api_key: apiKey,
                });
            } catch (e) {
                console.error('[Civicomfy] Bulk download failed for', id, e);
            }
        }
        this.showToast(`Queued downloads for ${ids.length} model(s).`, 'success');
        // Optional: switch to Status
        if (this.settings?.autoOpenStatus) this.switchTab('status');
        // Keep selection or clear? Clear to avoid re-queueing accidentally
        this.clearSelection();
        this.updateStatus();
    }
    
    // --- Auto-select model type based on Civitai model type ---
    inferFolderFromCivitaiType(civitaiType) {
        if (!civitaiType || typeof civitaiType !== 'string') return null;
        const t = civitaiType.trim().toLowerCase();
        const keys = Object.keys(this.modelTypes || {});
        if (keys.length === 0) return null;

        const exists = (k) => keys.includes(k);
        const findBy = (pred) => keys.find(pred);

        // Direct matches first
        if (exists(t)) return t;
        if (exists(`${t}s`)) return `${t}s`;

        // Common mappings from Civitai types to ComfyUI folders
        const candidates = [];
        const addIfExists = (k) => { if (exists(k)) candidates.push(k); };

        switch (t) {
            case 'checkpoint':
                addIfExists('checkpoints');
                addIfExists('models');
                break;
            case 'lora': case 'locon': case 'lycoris':
                addIfExists('loras');
                break;
            case 'vae':
                addIfExists('vae');
                break;
            case 'textualinversion': case 'embedding': case 'embeddings':
                addIfExists('embeddings');
                break;
            case 'hypernetwork':
                addIfExists('hypernetworks');
                break;
            case 'controlnet':
                addIfExists('controlnet');
                break;
            case 'unet': case 'unet2':
                addIfExists('unet');
                break;
            case 'diffusers': case 'diffusionmodels': case 'diffusion_models': case 'diffusion':
                // Normalize to the single 'diffusers' candidate to avoid duplicate listing
                addIfExists('diffusers');
                break;
            case 'upscaler': case 'upscalers':
                addIfExists('upscale_models');
                addIfExists('upscalers');
                break;
            case 'motionmodule':
                addIfExists('motion_models');
                break;
            case 'poses':
                addIfExists('poses');
                break;
            case 'wildcards':
                addIfExists('wildcards');
                break;
            case 'onnx':
                addIfExists('onnx');
                break;
        }
        if (candidates.length > 0) return candidates[0];

        // Relaxed match: name contains type
        const contains = findBy(k => k.toLowerCase().includes(t));
        if (contains) return contains;

        return null;
    }

    async autoSelectModelTypeFromCivitai(civitaiType) {
        try {
            const folder = this.inferFolderFromCivitaiType(civitaiType);
            if (!folder) return;
            if (this.downloadModelTypeSelect && this.downloadModelTypeSelect.value !== folder) {
                this.downloadModelTypeSelect.value = folder;
                await this.loadAndPopulateSubdirs(folder);
                // Reset subdir to root after auto-switch
                if (this.subdirSelect) this.subdirSelect.value = '';
            }
        } catch (e) {
            console.warn('[Civicomfy] Auto-select model type failed:', e);
        }
    }

    renderSearchPagination(metadata) {
        if (!this.searchPaginationContainer) return;
        if (!metadata || metadata.totalPages <= 1) {
            this.searchPaginationContainer.innerHTML = '';
            this.searchPagination = { ...this.searchPagination, ...metadata };
            return;
        }

        this.searchPagination = { ...this.searchPagination, ...metadata };
        const { currentPage, totalPages, totalItems } = this.searchPagination;
        const currentLimit = parseInt(this.searchLimitSelect?.value) || this.searchPagination.limit;

        const createButton = (text, page, isDisabled = false, isCurrent = false) => {
            const button = document.createElement('button');
            button.className = `civitai-button small civitai-page-button ${isCurrent ? 'primary active' : ''}`;
            button.dataset.page = page;
            button.disabled = isDisabled;
            button.innerHTML = text;
            button.type = 'button';
            return button;
        };

        const fragment = document.createDocumentFragment();
        fragment.appendChild(createButton('&laquo; Prev', currentPage - 1, currentPage === 1));
        
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) fragment.appendChild(createButton('1', 1));
        if (startPage > 2) fragment.appendChild(document.createElement('span')).textContent = '...';

        for (let i = startPage; i <= endPage; i++) {
            fragment.appendChild(createButton(i, i, false, i === currentPage));
        }

        if (endPage < totalPages - 1) fragment.appendChild(document.createElement('span')).textContent = '...';
        if (endPage < totalPages) fragment.appendChild(createButton(totalPages, totalPages));
        
        fragment.appendChild(createButton('Next &raquo;', currentPage + 1, currentPage === totalPages));

        const info = document.createElement('div');
        info.className = 'civitai-pagination-info';
        info.textContent = `Page ${currentPage} of ${totalPages} (${totalItems.toLocaleString()} models, ${currentLimit} per page)`;
        fragment.appendChild(info);

        this.searchPaginationContainer.innerHTML = '';
        this.searchPaginationContainer.appendChild(fragment);
    }

    // --- Event Handlers and State Management (delegated to handlers) ---
    setupEventListeners = () => setupEventListeners(this);
    getDefaultSettings = () => getDefaultSettings();
    loadAndApplySettings = () => loadAndApplySettings(this);
    loadSettingsFromCookie = () => loadSettingsFromCookie(this);
    saveSettingsToCookie = () => saveSettingsToCookie(this);
    applySettings = () => applySettings(this);
    handleSettingsSave = () => handleSettingsSave(this);
    handleDownloadSubmit = () => handleDownloadSubmit(this);
    handleSearchSubmit = () => handleSearchSubmit(this);
    fetchAndDisplayDownloadPreview = () => fetchAndDisplayDownloadPreview(this);
    debounceFetchDownloadPreview = (delay) => debounceFetchDownloadPreview(this, delay);
    startStatusUpdates = () => startStatusUpdates(this);
    stopStatusUpdates = () => stopStatusUpdates(this);
    updateStatus = () => updateStatus(this);
    handleCancelDownload = (downloadId) => handleCancelDownload(this, downloadId);
    handleRetryDownload = (downloadId, button) => handleRetryDownload(this, downloadId, button);
    handleOpenPath = (downloadId, button) => handleOpenPath(this, downloadId, button);
    handleClearHistory = () => handleClearHistory(this);
}
