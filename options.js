// options.js for IPv4 Global Ticker Extension

document.addEventListener('DOMContentLoaded', function() {
    const excludedDomainsTextarea = document.getElementById('excludedDomains');
    const blockSizeFilterSelect = document.getElementById('blockSizeFilter');
    const rirFilterSelect = document.getElementById('rirFilter');
    const animationSpeedSlider = document.getElementById('animationSpeedSlider'); // New slider
    const speedLabel = document.getElementById('speedLabel'); // New label display
    const saveStatusDiv = document.getElementById('saveStatus');

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

    // Load saved settings when the options page opens
    function loadSettings() {
        if (chrome && chrome.storage && chrome.storage.local) {
            const keysToGet = [
                'excludedDomainsText',
                'selectedBlockSize',
                'selectedRir',
                'animationSpeedSetting' // New key for animation speed
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
                animationSpeedSlider.value = items.animationSpeedSetting !== undefined ? items.animationSpeedSetting : '2'; // Default to Normal (index 2)
                updateSpeedLabel(); // Update the label after loading
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
        const animationSpeedSetting = animationSpeedSlider.value; // Get selected speed setting

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                excludedDomainsText: excludedDomains,
                selectedBlockSize: selectedBlockSize,
                selectedRir: selectedRir,
                animationSpeedSetting: animationSpeedSetting // Save animation speed
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
                        animationSpeedSetting: animationSpeedSetting
                    });
                    updateSpeedLabel(); // Update label on save
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
    if(animationSpeedSlider) animationSpeedSlider.addEventListener('input', () => { // Use 'input' for live update
        updateSpeedLabel();
        saveSettings(); // Also save when slider is adjusted
    });

    // Load settings initially
    loadSettings();
});