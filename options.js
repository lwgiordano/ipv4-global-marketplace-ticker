// options.js for IPv4 Global Ticker Extension

document.addEventListener('DOMContentLoaded', function() {
    const excludedDomainsTextarea = document.getElementById('excludedDomains');
    const blockSizeFilterSelect = document.getElementById('blockSizeFilter');
    const rirFilterSelect = document.getElementById('rirFilter'); // New RIR filter select
    const saveStatusDiv = document.getElementById('saveStatus');

    // Populate block size dropdown (/24 down to /14)
    for (let i = 24; i >= 14; i--) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `/${i}`;
        blockSizeFilterSelect.appendChild(option);
    }

    // Load saved settings when the options page opens
    function loadSettings() {
        if (chrome && chrome.storage && chrome.storage.local) {
            // Keys to retrieve from storage
            const keysToGet = [
                'excludedDomainsText',
                'selectedBlockSize',
                'selectedRir' // New key for RIR filter
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
                rirFilterSelect.value = items.selectedRir || ''; // Load RIR filter
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
        const selectedRir = rirFilterSelect.value; // Get selected RIR

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                excludedDomainsText: excludedDomains,
                selectedBlockSize: selectedBlockSize,
                selectedRir: selectedRir // Save RIR filter
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
                        selectedRir: selectedRir
                    });
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
    if(rirFilterSelect) rirFilterSelect.addEventListener('change', saveSettings); // Event listener for RIR filter

    // Load settings initially
    loadSettings();
});
