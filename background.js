// Enhanced background service worker with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetchData' && request.url) {
    // Make the network request from the background service worker
    fetch(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://auctions.ipv4.global',
        'Cache-Control': 'no-cache'
      },
      body: request.body
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok (${response.status})`);
      }
      return response.text();
    })
    .then(text => {
      sendResponse({ success: true, data: text });
    })
    .catch(error => {
      console.error('Error fetching data:', error);
      // Send a more detailed error message
      sendResponse({
        success: false,
        error: error.toString(),
        details: {
          message: error.message,
          time: new Date().toISOString()
        }
      });
    });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Handle opening the options page
  if (request.type === 'openOptions') {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            console.warn('Error opening options page:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true });
          }
        });
      } else {
        sendResponse({ success: false, error: 'openOptionsPage not available' });
      }
    } catch (error) {
      console.error('Error opening options page:', error);
      sendResponse({ success: false, error: error.toString() });
    }
    return true;
  }
});