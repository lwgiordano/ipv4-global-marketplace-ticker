// options.js for IPv4 Global Ticker Extension

document.addEventListener('DOMContentLoaded', function() {
    const excludedDomainsTextarea = document.getElementById('excludedDomains');
    const blockSizeDropdown = document.getElementById('blockSizeDropdown');
    const rirDropdown = document.getElementById('rirDropdown');
    const animationSpeedSlider = document.getElementById('animationSpeedSlider');
    const speedLabel = document.getElementById('speedLabel');
    const saveStatusDiv = document.getElementById('saveStatus');

    // Notify Me elements
    const notifyMeEnabledCheckbox = document.getElementById('notifyMeEnabled');
    const notifyMeOptionsDiv = document.getElementById('notifyMeOptions');
    const notifyMeSoundCheckbox = document.getElementById('notifyMeSound');
    const notifyMeSoundSelect = document.getElementById('notifyMeSoundSelect');
    const notifyRulesContainer = document.getElementById('notifyRulesContainer');
    const noRulesMsg = document.getElementById('noRulesMsg');
    const addRuleBtn = document.getElementById('addRuleBtn');

    let notifyRules = [];

    const speedSettings = [
        { label: "Very Slow", display: "Very Slow (0.25x)", multiplier: 0.25 },
        { label: "Slow", display: "Slow (0.5x)", multiplier: 0.5 },
        { label: "Normal", display: "Normal (1x)", multiplier: 1.0 },
        { label: "Fast", display: "Fast (1.5x)", multiplier: 1.5 },
        { label: "Very Fast", display: "Very Fast (2x)", multiplier: 2.0 }
    ];

    // Populate block size dropdown (/24 down to /14)
    function initializeBlockSizeDropdown(dropdown) {
        const optionsContainer = dropdown.querySelector('.multi-select-options');
        for (let i = 24; i >= 14; i--) {
            const label = document.createElement('label');
            label.className = 'checkbox-option';
            label.innerHTML = `
                <input type="checkbox" value="${i}">
                <span>/${i}</span>
            `;
            optionsContainer.appendChild(label);
        }
    }

    // Initialize multi-select dropdown functionality
    function initializeMultiSelectDropdown(dropdown, onChange) {
        const header = dropdown.querySelector('.multi-select-header');
        const options = dropdown.querySelector('.multi-select-options');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');

        // Toggle dropdown
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.multi-select-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            dropdown.classList.toggle('open');
        });

        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();

                if (checkbox === allCheckbox) {
                    // If "All" is checked, uncheck others
                    if (checkbox.checked) {
                        checkboxes.forEach(cb => {
                            if (cb !== allCheckbox) cb.checked = false;
                        });
                    }
                } else {
                    // If any other is checked, uncheck "All"
                    if (checkbox.checked) {
                        allCheckbox.checked = false;
                    }

                    // If none are checked, check "All"
                    const anyChecked = Array.from(checkboxes).some(cb => cb !== allCheckbox && cb.checked);
                    if (!anyChecked) {
                        allCheckbox.checked = true;
                    }
                }

                updateDropdownText(dropdown);
                if (onChange) onChange();
            });
        });

        // Prevent dropdown from closing when clicking inside options
        options.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Update dropdown display text based on selections
    function updateDropdownText(dropdown) {
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');
        const selectedText = dropdown.querySelector('.selected-text');

        const selected = Array.from(checkboxes).filter(cb => cb.checked && cb !== allCheckbox);

        if (selected.length === 0 || allCheckbox.checked) {
            const isBlockSize = dropdown.id === 'blockSizeDropdown' || dropdown.classList.contains('rule-block-size-dropdown');
            selectedText.textContent = isBlockSize ? 'All Sizes' : 'All RIRs';
        } else {
            // Show comma-separated values
            const labels = selected.map(cb => cb.nextElementSibling.textContent);
            selectedText.textContent = labels.join(', ');
        }
    }

    // Get selected values from dropdown as array
    function getSelectedValues(dropdown) {
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');

        if (allCheckbox && allCheckbox.checked) {
            return [];
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked && cb.value !== 'all')
            .map(cb => cb.value);
    }

    // Set selected values in dropdown from array
    function setSelectedValues(dropdown, values) {
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');

        if (!values || values.length === 0) {
            // Select "All" and uncheck others
            if (allCheckbox) allCheckbox.checked = true;
            checkboxes.forEach(cb => {
                if (cb !== allCheckbox) cb.checked = false;
            });
        } else {
            // Uncheck "All" and check specific values
            if (allCheckbox) allCheckbox.checked = false;
            checkboxes.forEach(cb => {
                if (cb !== allCheckbox) {
                    cb.checked = values.includes(cb.value);
                }
            });
        }
        updateDropdownText(dropdown);
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => d.classList.remove('open'));
    });

    // Initialize global dropdowns
    initializeBlockSizeDropdown(blockSizeDropdown);
    initializeMultiSelectDropdown(blockSizeDropdown, saveSettings);
    initializeMultiSelectDropdown(rirDropdown, saveSettings);

    // Update speed label based on slider value
    function updateSpeedLabel() {
        const sliderValue = parseInt(animationSpeedSlider.value, 10);
        if (speedSettings[sliderValue]) {
            speedLabel.textContent = speedSettings[sliderValue].display;
        }
    }

    // Toggle notify options visibility
    function updateNotifyOptionsVisibility() {
        if (notifyMeEnabledCheckbox.checked) {
            notifyMeOptionsDiv.style.display = 'flex';
        } else {
            notifyMeOptionsDiv.style.display = 'none';
        }
    }

    // Generate unique ID for rules
    function generateRuleId() {
        return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Create block size multi-select dropdown HTML
    function createBlockSizeDropdownHTML(ruleId) {
        let optionsHTML = `
            <label class="checkbox-option">
                <input type="checkbox" value="all" checked>
                <span>All Sizes</span>
            </label>
            <div class="checkbox-divider"></div>
        `;
        for (let i = 24; i >= 14; i--) {
            optionsHTML += `
                <label class="checkbox-option">
                    <input type="checkbox" value="${i}">
                    <span>/${i}</span>
                </label>
            `;
        }
        return `
            <div class="multi-select-dropdown rule-block-size-dropdown" data-rule-id="${ruleId}">
                <div class="multi-select-header">
                    <span class="selected-text">All Sizes</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="multi-select-options">
                    ${optionsHTML}
                </div>
            </div>
        `;
    }

    // Create RIR multi-select dropdown HTML
    function createRirDropdownHTML(ruleId) {
        const rirs = [
            { value: 'arin', label: 'ARIN' },
            { value: 'ripe', label: 'RIPE' },
            { value: 'apnic', label: 'APNIC' },
            { value: 'lacnic', label: 'LACNIC' },
            { value: 'afrinic', label: 'AFRINIC' }
        ];
        let optionsHTML = `
            <label class="checkbox-option">
                <input type="checkbox" value="all" checked>
                <span>All RIRs</span>
            </label>
            <div class="checkbox-divider"></div>
        `;
        rirs.forEach(rir => {
            optionsHTML += `
                <label class="checkbox-option">
                    <input type="checkbox" value="${rir.value}">
                    <span>${rir.label}</span>
                </label>
            `;
        });
        return `
            <div class="multi-select-dropdown rule-rir-dropdown" data-rule-id="${ruleId}">
                <div class="multi-select-header">
                    <span class="selected-text">All RIRs</span>
                    <span class="dropdown-arrow">▼</span>
                </div>
                <div class="multi-select-options">
                    ${optionsHTML}
                </div>
            </div>
        `;
    }

    // Render notification rules
    function renderNotifyRules() {
        // Remove existing rule elements (but not the noRulesMsg)
        const existingRules = notifyRulesContainer.querySelectorAll('.notify-rule');
        existingRules.forEach(el => el.remove());

        if (notifyRules.length === 0) {
            noRulesMsg.style.display = 'block';
            return;
        }

        noRulesMsg.style.display = 'none';

        notifyRules.forEach((rule, index) => {
            const ruleEl = document.createElement('div');
            ruleEl.className = 'notify-rule';
            ruleEl.dataset.ruleId = rule.id;
            ruleEl.innerHTML = `
                <div class="notify-rule-header">
                    <span>Rule ${index + 1}</span>
                    <button type="button" class="notify-rule-delete" data-rule-id="${rule.id}">Delete</button>
                </div>
                <div class="notify-rule-filters">
                    <div>
                        <label>Block Size:</label>
                        ${createBlockSizeDropdownHTML(rule.id)}
                    </div>
                    <div>
                        <label>RIR:</label>
                        ${createRirDropdownHTML(rule.id)}
                    </div>
                    <div>
                        <label>Max Price ($/IP):</label>
                        <input type="number" class="rule-max-price" data-rule-id="${rule.id}"
                               value="${rule.maxPrice || ''}" placeholder="Any" min="0" step="0.01">
                    </div>
                    <div>
                        <label>Min Price ($/IP):</label>
                        <input type="number" class="rule-min-price" data-rule-id="${rule.id}"
                               value="${rule.minPrice || ''}" placeholder="Any" min="0" step="0.01">
                    </div>
                </div>
            `;
            notifyRulesContainer.appendChild(ruleEl);

            // Set initial values for the multi-select dropdowns
            const blockSizeDropdown = ruleEl.querySelector('.rule-block-size-dropdown');
            const rirDropdownEl = ruleEl.querySelector('.rule-rir-dropdown');

            // Convert stored values (could be string or array) to array
            const blockSizeValues = rule.blockSizes || (rule.blockSize ? [rule.blockSize] : []);
            const rirValues = rule.rirs || (rule.rir ? [rule.rir] : []);

            setSelectedValues(blockSizeDropdown, blockSizeValues);
            setSelectedValues(rirDropdownEl, rirValues);

            // Initialize multi-select functionality for this rule's dropdowns
            initializeRuleDropdown(blockSizeDropdown, rule.id);
            initializeRuleDropdown(rirDropdownEl, rule.id);
        });

        // Add event listeners to delete buttons
        notifyRulesContainer.querySelectorAll('.notify-rule-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ruleId = e.target.dataset.ruleId;
                deleteNotifyRule(ruleId);
            });
        });

        // Add event listeners to price inputs
        notifyRulesContainer.querySelectorAll('.rule-max-price, .rule-min-price').forEach(input => {
            input.addEventListener('change', (e) => {
                updateNotifyRulePrice(e.target.dataset.ruleId, e.target);
            });
        });
    }

    // Initialize multi-select dropdown for a notification rule
    function initializeRuleDropdown(dropdown, ruleId) {
        const header = dropdown.querySelector('.multi-select-header');
        const options = dropdown.querySelector('.multi-select-options');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = dropdown.querySelector('input[value="all"]');

        // Toggle dropdown
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.multi-select-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            dropdown.classList.toggle('open');
        });

        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();

                if (checkbox === allCheckbox) {
                    if (checkbox.checked) {
                        checkboxes.forEach(cb => {
                            if (cb !== allCheckbox) cb.checked = false;
                        });
                    }
                } else {
                    if (checkbox.checked) {
                        allCheckbox.checked = false;
                    }
                    const anyChecked = Array.from(checkboxes).some(cb => cb !== allCheckbox && cb.checked);
                    if (!anyChecked) {
                        allCheckbox.checked = true;
                    }
                }

                updateDropdownText(dropdown);
                updateNotifyRuleFromDropdown(ruleId, dropdown);
            });
        });

        // Prevent dropdown from closing when clicking inside options
        options.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Update notify rule from dropdown change
    function updateNotifyRuleFromDropdown(ruleId, dropdown) {
        const rule = notifyRules.find(r => r.id === ruleId);
        if (!rule) return;

        const values = getSelectedValues(dropdown);

        if (dropdown.classList.contains('rule-block-size-dropdown')) {
            rule.blockSizes = values;
            // Keep legacy field for backwards compatibility
            rule.blockSize = values.length === 1 ? values[0] : '';
        } else if (dropdown.classList.contains('rule-rir-dropdown')) {
            rule.rirs = values;
            // Keep legacy field for backwards compatibility
            rule.rir = values.length === 1 ? values[0] : '';
        }

        saveSettings();
    }

    // Update notify rule price fields
    function updateNotifyRulePrice(ruleId, inputElement) {
        const rule = notifyRules.find(r => r.id === ruleId);
        if (!rule) return;

        if (inputElement.classList.contains('rule-max-price')) {
            rule.maxPrice = inputElement.value;
        } else if (inputElement.classList.contains('rule-min-price')) {
            rule.minPrice = inputElement.value;
        }

        saveSettings();
    }

    // Add new notification rule
    function addNotifyRule() {
        const newRule = {
            id: generateRuleId(),
            blockSizes: [],
            rirs: [],
            blockSize: '',  // Legacy field for backwards compatibility
            rir: '',        // Legacy field for backwards compatibility
            maxPrice: '',
            minPrice: ''
        };
        notifyRules.push(newRule);
        renderNotifyRules();
        saveSettings();
    }

    // Delete notification rule
    function deleteNotifyRule(ruleId) {
        notifyRules = notifyRules.filter(rule => rule.id !== ruleId);
        renderNotifyRules();
        saveSettings();

        // Also clear dismissed notifications history for this rule
        chrome.storage.local.get(['notifyMeDismissed'], (result) => {
            const dismissed = result.notifyMeDismissed || {};
            if (dismissed[ruleId]) {
                delete dismissed[ruleId];
                chrome.storage.local.set({ notifyMeDismissed: dismissed });
            }
        });
    }


    // Load saved settings when the options page opens
    function loadSettings() {
        if (chrome && chrome.storage && chrome.storage.local) {
            const keysToGet = [
                'excludedDomainsText',
                'selectedBlockSize',
                'selectedBlockSizes',
                'selectedRir',
                'selectedRirs',
                'animationSpeedSetting',
                'notifyMeEnabled',
                'notifyMeSound',
                'notifyMeSoundType',
                'notifyMeRules'
            ];

            chrome.storage.local.get(keysToGet, function(items) {
                if (chrome.runtime.lastError) {
                    console.error("Error loading settings:", chrome.runtime.lastError.message);
                    saveStatusDiv.textContent = "Error loading settings.";
                    saveStatusDiv.style.color = "red";
                    return;
                }
                excludedDomainsTextarea.value = items.excludedDomainsText || '';

                // Load block sizes (new array format takes precedence over legacy single value)
                let blockSizeValues = items.selectedBlockSizes || [];
                if (blockSizeValues.length === 0 && items.selectedBlockSize) {
                    blockSizeValues = [items.selectedBlockSize];
                }
                setSelectedValues(blockSizeDropdown, blockSizeValues);

                // Load RIRs (new array format takes precedence over legacy single value)
                let rirValues = items.selectedRirs || [];
                if (rirValues.length === 0 && items.selectedRir) {
                    rirValues = [items.selectedRir];
                }
                setSelectedValues(rirDropdown, rirValues);

                animationSpeedSlider.value = items.animationSpeedSetting !== undefined ? items.animationSpeedSetting : '2';
                updateSpeedLabel();

                // Load Notify Me settings
                notifyMeEnabledCheckbox.checked = items.notifyMeEnabled || false;
                notifyMeSoundCheckbox.checked = items.notifyMeSound !== false; // Default true
                notifyMeSoundSelect.value = items.notifyMeSoundType || 'chime';
                notifyRules = items.notifyMeRules || [];

                updateNotifyOptionsVisibility();
                renderNotifyRules();

                console.log("Settings loaded:", items);
            });
        } else {
            console.error("chrome.storage.local is not available.");
            saveStatusDiv.textContent = "Storage API not available.";
            saveStatusDiv.style.color = "red";
        }
    }

    // Save settings when they are changed
    function saveSettings() {
        const excludedDomains = excludedDomainsTextarea.value;
        const selectedBlockSizes = getSelectedValues(blockSizeDropdown);
        const selectedRirs = getSelectedValues(rirDropdown);
        const animationSpeedSetting = animationSpeedSlider.value;

        // Legacy single-value fields for backwards compatibility
        const selectedBlockSize = selectedBlockSizes.length === 1 ? selectedBlockSizes[0] : '';
        const selectedRir = selectedRirs.length === 1 ? selectedRirs[0] : '';

        // Notify Me settings
        const notifyMeEnabled = notifyMeEnabledCheckbox.checked;
        const notifyMeSound = notifyMeSoundCheckbox.checked;
        const notifyMeSoundType = notifyMeSoundSelect.value;

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                excludedDomainsText: excludedDomains,
                selectedBlockSize: selectedBlockSize,
                selectedBlockSizes: selectedBlockSizes,
                selectedRir: selectedRir,
                selectedRirs: selectedRirs,
                animationSpeedSetting: animationSpeedSetting,
                notifyMeEnabled: notifyMeEnabled,
                notifyMeSound: notifyMeSound,
                notifyMeSoundType: notifyMeSoundType,
                notifyMeRules: notifyRules
            }, function() {
                if (chrome.runtime.lastError) {
                    console.error("Error saving settings:", chrome.runtime.lastError.message);
                    saveStatusDiv.textContent = "Error saving settings!";
                    saveStatusDiv.style.color = "red";
                } else {
                    saveStatusDiv.textContent = 'Options saved!';
                    saveStatusDiv.style.color = 'green';
                    console.log("Settings saved:", {
                        excludedDomainsText: excludedDomains,
                        selectedBlockSizes: selectedBlockSizes,
                        selectedRirs: selectedRirs,
                        animationSpeedSetting: animationSpeedSetting,
                        notifyMeEnabled: notifyMeEnabled,
                        notifyMeSound: notifyMeSound,
                        notifyMeSoundType: notifyMeSoundType,
                        notifyMeRules: notifyRules
                    });
                    updateSpeedLabel();
                    setTimeout(() => { saveStatusDiv.textContent = ''; }, 2000);
                }
            });
        } else {
            console.error("chrome.storage.local is not available for saving.");
            saveStatusDiv.textContent = "Storage API not available for saving.";
            saveStatusDiv.style.color = "red";
        }
    }

    // Add event listeners to save on change
    if(excludedDomainsTextarea) excludedDomainsTextarea.addEventListener('input', saveSettings);
    // Multi-select dropdowns have their own event listeners set in initializeMultiSelectDropdown
    if(animationSpeedSlider) animationSpeedSlider.addEventListener('input', () => {
        updateSpeedLabel();
        saveSettings();
    });

    // Notify Me event listeners
    if(notifyMeEnabledCheckbox) {
        notifyMeEnabledCheckbox.addEventListener('change', () => {
            updateNotifyOptionsVisibility();
            saveSettings();
        });
    }
    if(notifyMeSoundCheckbox) notifyMeSoundCheckbox.addEventListener('change', saveSettings);
    if(notifyMeSoundSelect) notifyMeSoundSelect.addEventListener('change', saveSettings);
    if(addRuleBtn) addRuleBtn.addEventListener('click', addNotifyRule);

    // Load settings initially
    loadSettings();
});