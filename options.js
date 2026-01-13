// options.js for IPv4 Global Ticker Extension

document.addEventListener('DOMContentLoaded', function() {
    const excludedDomainsTextarea = document.getElementById('excludedDomains');
    const blockSizeFilterSelect = document.getElementById('blockSizeFilter');
    const rirFilterSelect = document.getElementById('rirFilter');
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
    for (let i = 24; i >= 14; i--) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `/${i}`;
        blockSizeFilterSelect.appendChild(option);
    }

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

    // Create block size options HTML
    function createBlockSizeOptions(selectedValue) {
        let options = '<option value="">All Sizes</option>';
        for (let i = 24; i >= 14; i--) {
            const selected = selectedValue === i.toString() ? 'selected' : '';
            options += `<option value="${i}" ${selected}>/${i}</option>`;
        }
        return options;
    }

    // Create RIR options HTML
    function createRirOptions(selectedValue) {
        const rirs = [
            { value: '', label: 'All RIRs' },
            { value: 'arin', label: 'ARIN' },
            { value: 'ripe', label: 'RIPE' },
            { value: 'apnic', label: 'APNIC' },
            { value: 'lacnic', label: 'LACNIC' },
            { value: 'afrinic', label: 'AFRINIC' }
        ];
        return rirs.map(rir => {
            const selected = selectedValue === rir.value ? 'selected' : '';
            return `<option value="${rir.value}" ${selected}>${rir.label}</option>`;
        }).join('');
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
                        <select class="rule-block-size" data-rule-id="${rule.id}">
                            ${createBlockSizeOptions(rule.blockSize)}
                        </select>
                    </div>
                    <div>
                        <label>RIR:</label>
                        <select class="rule-rir" data-rule-id="${rule.id}">
                            ${createRirOptions(rule.rir)}
                        </select>
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
        });

        // Add event listeners to new elements
        notifyRulesContainer.querySelectorAll('.notify-rule-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ruleId = e.target.dataset.ruleId;
                deleteNotifyRule(ruleId);
            });
        });

        notifyRulesContainer.querySelectorAll('.rule-block-size, .rule-rir, .rule-max-price, .rule-min-price').forEach(input => {
            input.addEventListener('change', (e) => {
                updateNotifyRule(e.target.dataset.ruleId, e.target);
            });
        });
    }

    // Add new notification rule
    function addNotifyRule() {
        const newRule = {
            id: generateRuleId(),
            blockSize: '',
            rir: '',
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

    // Update notification rule
    function updateNotifyRule(ruleId, inputElement) {
        const rule = notifyRules.find(r => r.id === ruleId);
        if (!rule) return;

        if (inputElement.classList.contains('rule-block-size')) {
            rule.blockSize = inputElement.value;
        } else if (inputElement.classList.contains('rule-rir')) {
            rule.rir = inputElement.value;
        } else if (inputElement.classList.contains('rule-max-price')) {
            rule.maxPrice = inputElement.value;
        } else if (inputElement.classList.contains('rule-min-price')) {
            rule.minPrice = inputElement.value;
        }

        saveSettings();
    }

    // Load saved settings when the options page opens
    function loadSettings() {
        if (chrome && chrome.storage && chrome.storage.local) {
            const keysToGet = [
                'excludedDomainsText',
                'selectedBlockSize',
                'selectedRir',
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
                blockSizeFilterSelect.value = items.selectedBlockSize || '';
                rirFilterSelect.value = items.selectedRir || '';
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
        const selectedBlockSize = blockSizeFilterSelect.value;
        const selectedRir = rirFilterSelect.value;
        const animationSpeedSetting = animationSpeedSlider.value;

        // Notify Me settings
        const notifyMeEnabled = notifyMeEnabledCheckbox.checked;
        const notifyMeSound = notifyMeSoundCheckbox.checked;
        const notifyMeSoundType = notifyMeSoundSelect.value;

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                excludedDomainsText: excludedDomains,
                selectedBlockSize: selectedBlockSize,
                selectedRir: selectedRir,
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
                        selectedBlockSize: selectedBlockSize,
                        selectedRir: selectedRir,
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
    if(blockSizeFilterSelect) blockSizeFilterSelect.addEventListener('change', saveSettings);
    if(rirFilterSelect) rirFilterSelect.addEventListener('change', saveSettings);
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