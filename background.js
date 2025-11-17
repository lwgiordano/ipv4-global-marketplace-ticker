// Enhanced background service worker with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'openOptions') {
    console.log('[IPv4 BG] Received openOptions request');
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        console.error('[IPv4 BG] openOptionsPage failed:', chrome.runtime.lastError.message);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[IPv4 BG] openOptionsPage succeeded');
        sendResponse({ ok: true });
      }
    });
    // Return true to indicate we'll respond asynchronously
    return true;
  }

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
});