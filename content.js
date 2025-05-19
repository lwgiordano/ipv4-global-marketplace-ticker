(function() {
  // EARLY EXIT CHECK - Run this first before anything else
  // Only run on proper HTML documents, skip resource files and frames
  if (!document || 
      !document.body || 
      document.documentElement.nodeName !== 'HTML' ||
      window !== window.top || // Skip frames/iframes
      window.location.pathname.match(/\.(ico|png|jpg|jpeg|gif|css|js|json|svg|xml|pdf)$/i)) {
    return; // Exit immediately for non-HTML pages or resource files
  }

  // CONFIGURATION
  const CONFIG = {
    refreshInterval: 60000, // 1 minute
    priorSalesApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/priorSales',
    newListingsApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/currentListing',
    animationSpeed: 50, // pixels per second
    debug: false, // Set to true for more verbose logging
    maxRetries: 3, // Maximum number of banner creation attempts
    recreationDelay: 5000, // Delay between recreation attempts (5 seconds)
    recreationMaxCount: 3, // Maximum number of times to recreate the banner
    mutationObserverEnabled: true, // Whether to use MutationObserver
    storageKey: 'ipv4BannerPosition', // Key for storing position in storage
    minimizedStateKey: 'ipv4BannerMinimized', // Key for storing minimized state
    widthKey: 'ipv4BannerWidth', // Key for storing width
    widthPercentKey: 'ipv4BannerWidthPercent', // Key for storing width as percentage of viewport
    maxWidthFlag: 'ipv4BannerIsMaxWidth', // Flag indicating banner was at max width
    leftPosKey: 'ipv4BannerLeftPos', // Key for storing left position
    viewModeKey: 'ipv4BannerViewMode', // Key for storing current view mode (priorSales or newListings)
    defaultWidth: 450, // Default banner width in px
    minWidth: 250, // Minimum width when resizing
    maxWidth: 2000, // Maximum width when resizing
    autoMinimizeWidth: 250, // Width at which banner auto-minimizes
    minIconSize: 16, // Size of icon when minimized
    edgeGap: 20, // Gap to maintain from screen edge
    minimizedSpacing: 2, // Space between elements when minimized
    normalSpacing: 6, // Space between elements when not minimized
    bannerHeight: 26, // Fixed banner height
    minimizeDelay: 300, // Delay before checking for overflow after expanding (ms)
    leftEdgeThreshold: 100, // Threshold for considering banner "at left edge"
    windowResizeThreshold: 200, // Threshold for significant window resize
    initializationLock: 'ipv4BannerInitLock', // Lock key to prevent multiple banners
    initLockTimeout: 30000, // Timeout for initialization lock (30 seconds)
    maxWidthTolerance: 10, // Pixel tolerance for considering a banner "max width"
    initialDragExpandWidth: 250, // Initial width when drag-expanding from minimized state
    minimizeAnimationDuration: 250, // Duration of minimize animation in ms
  };
  
  // VIEW MODES
  const VIEW_MODES = {
    PRIOR_SALES: 'priorSales',
    NEW_LISTINGS: 'newListings'
  };
  
  // STATE VARIABLES
  let bannerCreated = false;
  let animationStyleElement = null;
  let fetchIntervalId = null;
  let isDestroyed = false;
  let retryCount = 0;
  let recreationCount = 0;
  let lastRecreationTime = 0;
  let observer = null;
  let isMinimized = false;
  let isDragExpanding = false; // Flag to track if we're expanding via drag
  let hasFetchedData = false;
  let isDuringToggleTransition = false; // Flag to prevent multiple toggle operations
  let preMinimizeWidth = null; // Store width before minimizing for better restore
  let preMinimizeWidthPercent = null; // Store width percentage before minimizing
  let isAtMaxWidth = false; // Track if banner is at max width
  let initialViewportWidth = 0; // Track initial viewport width for resize detection
  let lastPositioningTime = 0; // Track when the banner was last positioned
  let currentViewMode = VIEW_MODES.PRIOR_SALES; // Default view mode
  let dragState = {
    isDragging: false,
    startY: 0,
    startX: 0,
    startTop: 0,
    startLeft: 0,
    startRight: 0,
    isHorizontalDrag: false,
    isVerticalDrag: false,
    startWidth: 0,
    isUsingTop: true,
    isUsingLeft: false,
    lastDragTime: 0,
    resizingDirection: null, // 'left' or 'right'
    initialClickX: 0,
    dragDistance: 0, // Track total drag distance for auto-minimize
    lastWidth: 0,     // Track width during drag for auto-minimize
    dragStartViewportX: 0, // Track x position relative to viewport on drag start
    wasNearLeftEdge: false, // Track if drag started near left edge
    draggedRightward: false, // Track if dragging rightward from left edge
    alwaysUseRight: true,    // Flag to force right-side positioning
    ignoreLeftPositioning: false, // Flag to prevent left positioning during drag
    expandMinX: 0, // X position where drag-expand started
    initialExpandWidth: CONFIG.initialDragExpandWidth, // Initial width for drag expansion
  };
  let resizeTimeout = null;
  let settingsLoaded = false;
  let currentSettings = {}; // Cached settings
  
  // LOGGING - Use safer console methods
  const log = {
    info: function(msg, ...args) {
      if (CONFIG.debug) console.log('[IPv4 Banner]', msg, ...args);
    },
    warn: function(msg, ...args) {
      console.warn('[IPv4 Banner]', msg, ...args);
    },
    error: function(msg, ...args) {
      console.error('[IPv4 Banner]', msg, ...args);
    }
  };
  
  // FALLBACK DATA
  const fallbackData = {
    [VIEW_MODES.PRIOR_SALES]: [
      { block: 19, region: "arin", pricePerAddress: "$29" },
      { block: 24, region: "arin", pricePerAddress: "$32.5" },
      { block: 19, region: "ripe", pricePerAddress: "$30" },
      { block: 22, region: "ripe", pricePerAddress: "$31.9" },
      { block: 22, region: "lacnic", pricePerAddress: "$34.5" },
      { block: 22, region: "arin", pricePerAddress: "$34" },
      { block: 24, region: "arin", pricePerAddress: "$36" }
    ],
    [VIEW_MODES.NEW_LISTINGS]: [
      { block: 24, region: "arin", askingPrice: "$35" },
      { block: 22, region: "ripe", askingPrice: "$31.5" },
      { block: 23, region: "apnic", askingPrice: "$32" },
      { block: 21, region: "arin", askingPrice: "$30" },
      { block: 24, region: "lacnic", askingPrice: "$33.5" },
      { block: 23, region: "arin", askingPrice: "$31" },
      { block: 22, region: "arin", askingPrice: "$29.5" }
    ]
  };

  // INITIALIZATION LOCK TO PREVENT MULTIPLE BANNERS
  async function acquireInitLock() {
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        // If Chrome APIs not available, use a different approach
        resolve(true);
        return;
      }
      
      chrome.storage.local.get([CONFIG.initializationLock], result => {
        const now = Date.now();
        const lockData = result[CONFIG.initializationLock];
        
        if (lockData && (now - lockData) < CONFIG.initLockTimeout) {
          // Lock exists and hasn't expired
          log.info('Another instance is initializing, waiting...');
          
          // Check again in a bit
          setTimeout(() => {
            acquireInitLock().then(acquired => resolve(acquired));
          }, 500);
          return;
        }
        
        // No valid lock, we can acquire it
        chrome.storage.local.set({ [CONFIG.initializationLock]: now }, () => {
          if (chrome.runtime.lastError) {
            log.warn('Error acquiring lock:', chrome.runtime.lastError);
            resolve(true); // Proceed anyway
          } else {
            log.info('Lock acquired');
            resolve(true);
          }
        });
      });
    });
  }
  
  // Release the initialization lock
  function releaseInitLock() {
    if (!isChromeAvailable()) return;
    
    chrome.storage.local.remove(CONFIG.initializationLock, () => {
      if (chrome.runtime.lastError) {
        log.warn('Error releasing lock:', chrome.runtime.lastError);
      } else {
        log.info('Lock released');
      }
    });
  }

  // IS CHROME EXTENSION CONTEXT AVAILABLE?
  function isChromeAvailable() {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.id && 
             chrome.runtime.sendMessage;
    } catch (e) {
      return false;
    }
  }
  
  // CHROME STORAGE API WRAPPER
  // Get all settings from storage
  async function getAllSettings() {
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        // Fallback to local cached settings if Chrome storage not available
        resolve(currentSettings);
        return;
      }
      
      chrome.storage.local.get(null, items => {
        if (chrome.runtime.lastError) {
          log.warn('Error reading all settings:', chrome.runtime.lastError);
          resolve(currentSettings);
        } else {
          currentSettings = items || {};
          settingsLoaded = true;
          resolve(currentSettings);
        }
      });
    });
  }
  
  // Get setting from storage
  async function getSetting(key, defaultValue) {
    // Return from cache if already loaded
    if (settingsLoaded && key in currentSettings) {
      return currentSettings[key];
    }
    
    // Not in cache, try to get from Chrome storage
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        resolve(defaultValue);
        return;
      }
      
      chrome.storage.local.get([key], result => {
        if (chrome.runtime.lastError) {
          log.warn(`Error reading setting ${key}:`, chrome.runtime.lastError);
          resolve(defaultValue);
        } else {
          const value = result[key];
          // Cache the result
          currentSettings[key] = value;
          resolve(value !== undefined ? value : defaultValue);
        }
      });
    });
  }
  
  // Save setting to storage
  async function saveSetting(key, value) {
    // Update cache immediately
    currentSettings[key] = value;
    
    // Try to save to Chrome storage
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        resolve();
        return;
      }
      
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          log.warn(`Error saving setting ${key}:`, chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }
  
  // Remove setting from storage
  async function removeSetting(key) {
    // Remove from cache immediately
    delete currentSettings[key];
    
    // Try to remove from Chrome storage
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        resolve();
        return;
      }
      
      chrome.storage.local.remove(key, () => {
        if (chrome.runtime.lastError) {
          log.warn(`Error removing setting ${key}:`, chrome.runtime.lastError);
        }
        resolve();
      });
    });
  }
  
  // VIEW MODE MANAGEMENT
  async function getSavedViewMode() {
    try {
      const mode = await getSetting(CONFIG.viewModeKey);
      if (mode === VIEW_MODES.PRIOR_SALES || mode === VIEW_MODES.NEW_LISTINGS) {
        return mode;
      }
    } catch (e) {
      log.warn('Error reading saved view mode:', e);
    }
    return VIEW_MODES.PRIOR_SALES; // Default to prior sales
  }
  
  async function saveViewMode(mode) {
    try {
      await saveSetting(CONFIG.viewModeKey, mode);
    } catch (e) {
      log.warn('Error saving view mode:', e);
    }
  }
  
  // Toggle between Prior Sales and New Listings
  async function toggleViewMode() {
    // Toggle the view mode
    currentViewMode = currentViewMode === VIEW_MODES.PRIOR_SALES ? 
                     VIEW_MODES.NEW_LISTINGS : 
                     VIEW_MODES.PRIOR_SALES;
    
    // Save the new view mode
    await saveViewMode(currentViewMode);
    
      // Update the title text
      const title = document.getElementById('ipv4-title');
      if (title) {
        title.innerHTML = currentViewMode === VIEW_MODES.PRIOR_SALES ? 
                          'Prior Sales:' : 
                          'New Listings:';
  
        // Update the title tooltip
              title.title = currentViewMode === VIEW_MODES.PRIOR_SALES ? 
                      "Click to switch to New Listings" : 
                      "Click to switch to Prior Sales";
      }
    
    // Fetch data with the new view mode
    fetchData();
  }
  
  // POSITION MANAGEMENT
  async function getSavedPosition() {
    try {
      const savedPos = await getSetting(CONFIG.storageKey);
      if (savedPos) {
        // Validate the position to ensure it's within viewport
        const viewportHeight = getViewportHeight();
        
        // Ensure top position is not below viewport
        if (savedPos.top) {
          const topValue = parseInt(savedPos.top);
          if (!isNaN(topValue) && topValue > viewportHeight - CONFIG.bannerHeight) {
            // Reset to a safe top value
            return { top: Math.max(0, viewportHeight - CONFIG.bannerHeight - 50) + 'px' };
          }
        }
        
        // Ensure bottom position is not above viewport
        if (savedPos.bottom) {
          const bottomValue = parseInt(savedPos.bottom);
          if (!isNaN(bottomValue) && bottomValue > viewportHeight - CONFIG.bannerHeight) {
            // Reset to a safe bottom value
            return { bottom: Math.max(0, viewportHeight - CONFIG.bannerHeight - 50) + 'px' };
          }
        }
        
        return savedPos;
      }
    } catch (e) {
      log.warn('Error reading saved position:', e);
    }
    return { top: '10px' }; // Default position at top right
  }
  
  async function savePosition(position) {
    try {
      // Validate position before saving
      const viewportHeight = getViewportHeight();
      
      // Make a copy of the position object
      const validatedPosition = {...position};
      
      // Ensure top position is within viewport
      if (validatedPosition.top) {
        const topValue = parseInt(validatedPosition.top);
        if (!isNaN(topValue)) {
          // Ensure it's not below viewport
          if (topValue > viewportHeight - CONFIG.bannerHeight) {
            validatedPosition.top = Math.max(0, viewportHeight - CONFIG.bannerHeight - 10) + 'px';
          }
          // Ensure it's not negative
          if (topValue < 0) {
            validatedPosition.top = '0px';
          }
        }
      }
      
      // Ensure bottom position is within viewport
      if (validatedPosition.bottom) {
        const bottomValue = parseInt(validatedPosition.bottom);
        if (!isNaN(bottomValue)) {
          // Ensure it's not above viewport
          if (bottomValue > viewportHeight - CONFIG.bannerHeight) {
            validatedPosition.bottom = Math.max(0, viewportHeight - CONFIG.bannerHeight - 10) + 'px';
          }
          // Ensure it's not negative
          if (bottomValue < 0) {
            validatedPosition.bottom = '0px';
          }
        }
      }
      
      await saveSetting(CONFIG.storageKey, validatedPosition);
    } catch (e) {
      log.warn('Error saving position:', e);
    }
  }
  
  // Clear saved left position to revert to right positioning
  async function clearLeftPosition() {
    try {
      await removeSetting(CONFIG.leftPosKey);
    } catch (e) {
      log.warn('Error clearing left position:', e);
    }
  }
  
  // LEFT POSITION MANAGEMENT
  async function getSavedLeftPosition() {
    // If we're forcing right positioning, always return null
    if (dragState.alwaysUseRight) {
      return null;
    }
    
    try {
      const savedPos = await getSetting(CONFIG.leftPosKey);
      if (savedPos !== null && savedPos !== undefined) {
        // Only return if it's a positive number
        const pos = parseInt(savedPos);
        if (!isNaN(pos) && pos >= 0) {
          return pos;
        }
      }
    } catch (e) {
      log.warn('Error reading saved left position:', e);
    }
    return null; // Default to null, will use right positioning
  }
  
  async function saveLeftPosition(position) {
    // If we're forcing right positioning, don't save left position
    if (dragState.alwaysUseRight) {
      await clearLeftPosition();
      return;
    }
    
    try {
      if (position === null || position < 0) {
        // Clear left position if null or negative
        await clearLeftPosition();
      } else {
        await saveSetting(CONFIG.leftPosKey, position.toString());
      }
    } catch (e) {
      log.warn('Error saving left position:', e);
    }
  }
  
  // WIDTH MANAGEMENT
  
  // Calculate width as percentage of viewport
  function calculateWidthPercentage(pixelWidth) {
    const viewportWidth = getViewportWidth();
    if (viewportWidth <= 0) return 50; // Default to 50% if unable to determine viewport width
    return Math.min(100, Math.max(1, (pixelWidth / viewportWidth) * 100));
  }
  
  // Check if width is at max width (or very close to it)
  function isWidthAtMax(width) {
    const maxWidth = calculateMaxBannerWidth();
    return Math.abs(width - maxWidth) <= CONFIG.maxWidthTolerance;
  }
  
  async function getSavedWidth() {
    try {
      // First check if we have a flag saying banner was at max width
      const wasAtMaxWidth = await getSetting(CONFIG.maxWidthFlag, false);
      if (wasAtMaxWidth) {
        isAtMaxWidth = true;
        return calculateMaxBannerWidth();
      }
      
      // Next try to get the width percentage
      const widthPercent = await getSetting(CONFIG.widthPercentKey);
      if (widthPercent !== null && widthPercent !== undefined) {
        const percent = parseFloat(widthPercent);
        if (!isNaN(percent) && percent > 0 && percent <= 100) {
          // Convert percentage to pixels based on current viewport
          const viewportWidth = getViewportWidth();
          const pixelWidth = Math.round((percent / 100) * viewportWidth);
          
          // Ensure the converted width is within bounds
          const validWidth = Math.min(calculateMaxBannerWidth(), 
                                      Math.max(CONFIG.minWidth, pixelWidth));
          return validWidth;
        }
      }
      
      // If no percentage, try to get absolute width
      const savedWidth = await getSetting(CONFIG.widthKey);
      if (savedWidth !== null && savedWidth !== undefined) {
        const width = parseInt(savedWidth);
        // Ensure saved width is reasonable and not too small
        if (!isNaN(width) && width >= CONFIG.minWidth && width <= CONFIG.maxWidth) {
          return width;
        }
      }
    } catch (e) {
      log.warn('Error reading saved width:', e);
    }
    
    // Default width if nothing valid found
    return CONFIG.defaultWidth;
  }
  
  async function saveWidth(width) {
    try {
      // Don't save widths that are too small
      if (width >= CONFIG.minWidth) {
        // Save absolute pixel width
        await saveSetting(CONFIG.widthKey, width.toString());
        
        // Also save as percentage of viewport for better cross-zoom handling
        const widthPercent = calculateWidthPercentage(width);
        await saveSetting(CONFIG.widthPercentKey, widthPercent.toString());
        
        // Check if this is max width (or very close to it)
        const isMaxWidth = isWidthAtMax(width);
        isAtMaxWidth = isMaxWidth;
        await saveSetting(CONFIG.maxWidthFlag, isMaxWidth);
        
        // Update in-memory width for better unminimize behavior
        preMinimizeWidth = width;
        preMinimizeWidthPercent = widthPercent;
      }
    } catch (e) {
      log.warn('Error saving width:', e);
    }
  }
  
  // SCREEN DIMENSIONS
  function getViewportWidth() {
    // Always use clientWidth to exclude scrollbar width
    return document.documentElement.clientWidth;
  }
  
  function getViewportHeight() {
    // Always use clientHeight to exclude scrollbar height
    return document.documentElement.clientHeight;
  }
  
  // Get scrollbar width
  function getScrollbarWidth() {
    // Calculate the difference between window inner width and client width
    // This is the width of the vertical scrollbar
    return window.innerWidth - document.documentElement.clientWidth;
  }
  
  // MINIMIZED STATE MANAGEMENT
  async function getSavedMinimizedState() {
    try {
      const state = await getSetting(CONFIG.minimizedStateKey);
      if (state !== null && state !== undefined) {
        return state === 'true' || state === true;
      }
    } catch (e) {
      log.warn('Error reading minimized state:', e);
    }
    return false; // Default to expanded
  }
  
  async function saveMinimizedState(state) {
    try {
      await saveSetting(CONFIG.minimizedStateKey, state.toString());
    } catch (e) {
      log.warn('Error saving minimized state:', e);
    }
  }
  
  // UTILITY FUNCTIONS
    function getTodayDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1;
    let dd = today.getDate();
    if (mm < 10) mm = '0' + mm;
    if (dd < 10) dd = '0' + dd;
    return `${yyyy}-${mm}-${dd}`;
  }

  function getTomorrowDate() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
  
    const yyyy = tomorrow.getFullYear();
    let mm = tomorrow.getMonth() + 1;
    let dd = tomorrow.getDate();
    if (mm < 10) mm = '0' + mm;
    if (dd < 10) dd = '0' + dd;
    return `${yyyy}-${mm}-${dd}`;
  }
  
  function getRequestBody() {
    if (currentViewMode === VIEW_MODES.PRIOR_SALES) {
      return {
        filter: {
          block: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8],
          region: ["arin", "apnic", "ripe", "afrinic", "lacnic"],
          period: {
            from: "2025-01-01",
            to: getTomorrowDate()
          }
        },
        sort: {
          property: "date",
          direction: "desc"
        },
        offset: 0,
        limit: 25
      };
    } else {
      return {
        filter: {
          block: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8],
          region: ["arin", "apnic", "ripe", "afrinic", "lacnic"]
        },
        sort: {
          property: "date",
          direction: "desc"
        },
        offset: 0,
        limit: 25
      };
    }
  }
  
  // Get current API endpoint based on view mode
  function getCurrentApiEndpoint() {
    return currentViewMode === VIEW_MODES.PRIOR_SALES ? 
           CONFIG.priorSalesApi : 
           CONFIG.newListingsApi;
  }
  
  // Calculate maximum banner width considering the edge gaps
  function calculateMaxBannerWidth() {
    const viewportWidth = getViewportWidth();
    // Ensure exactly the same gap on both sides
    return Math.max(CONFIG.minWidth, viewportWidth - (2 * CONFIG.edgeGap));
  }
  
  // START DRAG EXPANSION
  function startDragExpansion(banner, e) {
    if (!banner || !isMinimized) return false;
    
    // Set flag that we're now drag-expanding
    isDragExpanding = true;
    
    // Store the current mouse X position as reference
    dragState.expandMinX = e.clientX;
    
    // Remove any transitions for smooth drag expansion
    banner.style.transition = 'none';
    
    // Prepare the banner for expansion
    prepareBannerForExpansion(banner);
    
    // Set initial expansion width
    const initialWidth = CONFIG.initialDragExpandWidth;
    dragState.initialExpandWidth = initialWidth;
    banner.style.width = initialWidth + 'px';
    
    return true;
  }
  
  // Prepare banner for expansion from minimized state
  function prepareBannerForExpansion(banner) {
    // Remove minimized-specific styling
    banner.classList.remove('ipv4-minimized');
    banner.style.maxWidth = '';
    banner.style.minWidth = '';
    
    // Show elements that were hidden when minimized
    const title = document.getElementById('ipv4-title');
    const scrollContainer = document.getElementById('ipv4-scroll-container');
    
    if (title) title.style.display = '';
    if (scrollContainer) scrollContainer.style.display = '';
    
    // Change the toggle icon
    const toggleButton = document.getElementById('ipv4-toggle-button');
    if (toggleButton) {
      toggleButton.innerHTML = '▶';
      toggleButton.title = 'Minimize';
      toggleButton.style.marginLeft = `${CONFIG.normalSpacing}px`;
      toggleButton.style.fontFamily = 'Arial, "Courier New", monospace !important';
    }
    
    // Update logo to expanded state
    updateLogo(false);
  }
  
  // Handle ongoing drag expansion
  function handleDragExpansion(banner, e) {
    if (!banner || !isDragExpanding) return false;
    
    // Calculate how far we've dragged
    const deltaX = dragState.expandMinX - e.clientX;
    
    // Calculate the new width based on drag distance
    // Start from initialExpandWidth and expand based on drag distance
    let newWidth = dragState.initialExpandWidth + Math.abs(deltaX);
    
    // Enforce minimum and maximum width
    newWidth = Math.max(CONFIG.minWidth, newWidth);
    
    // Calculate maximum allowed width
    const viewportWidth = getViewportWidth();
    const maxAllowedWidth = viewportWidth - CONFIG.edgeGap - 
                          parseInt(window.getComputedStyle(banner).right);
    
    // Limit to max width to ensure exact edge gap
    newWidth = Math.min(newWidth, maxAllowedWidth);
    
    // Apply the new width
    banner.style.width = newWidth + 'px';
    
    // Track current width for finishing
    dragState.lastWidth = newWidth;
    
    return true;
  }
  
  // Complete drag expansion
  function finishDragExpansion(banner) {
    if (!banner || !isDragExpanding) return false;
    
    // First restore transition for smooth finish
    banner.style.transition = 'width 0.1s ease-out';
    
    // Get the final width and save it
    const finalWidth = Math.max(CONFIG.minWidth, dragState.lastWidth);
    banner.style.width = finalWidth + 'px';
    
    // Save width for future use
    saveWidth(finalWidth);
    
    // Update minimized state flags
    isMinimized = false;
    saveMinimizedState(false);
    
    // Reset drag expansion flag
    isDragExpanding = false;
    
    // If we expanded close to max width, snap to max width
    if (isWidthAtMax(finalWidth)) {
      const maxWidth = calculateMaxBannerWidth();
      banner.style.width = maxWidth + 'px';
      saveWidth(maxWidth);
    }
    
    // If we were at a very small width, still fetch data
    if (!hasFetchedData) {
      fetchData();
    }
    
    // Ensure the banner is in the viewport
    ensureBannerInViewport();
    
    // Ensure toggle button is visible
    ensureToggleButtonVisible(banner);
    
    // Remove transition after animation completes
    setTimeout(() => {
      if (banner) banner.style.transition = '';
    }, 100);
    
    return true;
  }
  
  // CANCEL DRAG EXPANSION
  function cancelDragExpansion(banner) {
    if (!banner || !isDragExpanding) return false;
    
    // Reset to minimized state
    isMinimized = true;
    
    // Update UI to reflect minimized state
    banner.classList.add('ipv4-minimized');
    
    // Hide elements when minimized
    const title = document.getElementById('ipv4-title');
    const scrollContainer = document.getElementById('ipv4-scroll-container');
    
    if (title) title.style.display = 'none';
    if (scrollContainer) scrollContainer.style.display = 'none';
    
    // Reset width to auto for minimized state
    banner.style.width = 'auto';
    banner.style.maxWidth = 'max-content';
    banner.style.minWidth = 'min-content';
    
    // Change the toggle icon back
    const toggleButton = document.getElementById('ipv4-toggle-button');
    if (toggleButton) {
      toggleButton.innerHTML = '◀';
      toggleButton.title = 'Expand';
      toggleButton.style.marginLeft = `${CONFIG.minimizedSpacing}px`;
      toggleButton.style.fontFamily = 'Arial, "Courier New", monospace !important';
    }
    
    // Update logo to minimized state
    updateLogo(true);
    
    // Reset drag expansion flag
    isDragExpanding = false;
    
    return true;
  }
  
  // ENFORCE LEFT EDGE GAP
  function enforceLeftEdgeGap(banner) {
    if (!banner) return false;
    
    // Skip if minimized or during drag expansion
    if (isMinimized || isDragExpanding) return false;
    
    const viewportWidth = getViewportWidth();
    const bannerWidth = banner.offsetWidth;
    const computedStyle = window.getComputedStyle(banner);
    const currentRight = computedStyle.right === 'auto' ? null : parseInt(computedStyle.right);
    
    // Calculate the implied left position when using right positioning
    if (currentRight !== null) {
      const impliedLeft = viewportWidth - bannerWidth - currentRight;
      
      // If the implied left position is less than the edge gap, adjust the width
      if (impliedLeft < CONFIG.edgeGap) {
        // Calculate new width to maintain exactly 20px gap on left
        const newWidth = viewportWidth - currentRight - CONFIG.edgeGap;
        
        // Only apply if the new width is greater than the minimum
        if (newWidth >= CONFIG.minWidth) {
          banner.style.width = newWidth + 'px';
          saveWidth(newWidth);
          return true; // Indicate we made an adjustment
        }
      }
    }
    
    return false; // No adjustment was made
  }

  // CHECK IF BANNER EXISTS AND IS VALID
  function bannerExists() {
    const banner = document.getElementById('ipv4-banner');
    return banner !== null;
  }
  
  // CHECK FOR CONTENT OVERFLOW
  function checkContentOverflow(banner) {
    if (!banner || isMinimized || isDuringToggleTransition || isDragExpanding) return false;
    
    const toggleButton = document.getElementById('ipv4-toggle-button');
    const title = document.getElementById('ipv4-title');
    const dragHandle = document.getElementById('ipv4-drag-handle');
    
    if (!toggleButton || !title || !dragHandle) return false;
    
    // Calculate the total width of all fixed elements
    const fixedWidth = dragHandle.offsetWidth + 
                      title.offsetWidth + 
                      toggleButton.offsetWidth +
                      40; // Extra padding, margins, etc.
    
    // Check if toggle button is at risk of becoming hidden
    if (banner.offsetWidth < fixedWidth + 20) {
      return true;
    }
    
    return false;
  }

  // CHECK IF BANNER IS NEAR LEFT EDGE
  function isNearLeftEdge(banner) {
    if (!banner) return false;
    
    const computedStyle = window.getComputedStyle(banner);
    const currentLeft = computedStyle.left === 'auto' ? null : parseInt(computedStyle.left);
    
    // Consider "near left edge" if left position exists and is less than threshold
    return currentLeft !== null && currentLeft <= CONFIG.leftEdgeThreshold;
  }
  
  // ENSURE BANNER DOESN'T EXCEED VIEWPORT BOUNDS
  function constrainBannerToViewport(banner) {
    if (!banner) return;
    
    // Skip during drag expansion
    if (isDragExpanding) return;
    
    const viewportWidth = getViewportWidth();
    const computedStyle = window.getComputedStyle(banner);
    const bannerWidth = banner.offsetWidth;
    const maxWidth = calculateMaxBannerWidth();
    
    // If we're forcing right positioning, always use right positioning
    if (dragState.alwaysUseRight) {
      positionToRightSide(banner);
      
      // Always enforce proper width to maintain both left and right gaps
      if (!isMinimized && bannerWidth > maxWidth) {
        banner.style.width = maxWidth + 'px';
        saveWidth(maxWidth);
      }
      
      // Always check and enforce left edge gap
      enforceLeftEdgeGap(banner);
      
      return;
    }
    
    // Handle left positioning
    if (dragState.isUsingLeft && !dragState.ignoreLeftPositioning) {
      const currentLeft = parseInt(computedStyle.left);
      
      // Ensure left edge constraint
      if (currentLeft < CONFIG.edgeGap) {
        banner.style.left = CONFIG.edgeGap + 'px';
      }
      
      // Ensure right edge constraint
      if (currentLeft + bannerWidth > viewportWidth - CONFIG.edgeGap) {
        // Either adjust width or switch to right positioning
        if (bannerWidth > CONFIG.minWidth * 1.5) {
          // Adjust width to fit
          const newWidth = viewportWidth - currentLeft - CONFIG.edgeGap;
          banner.style.width = newWidth + 'px';
          saveWidth(newWidth);
        } else {
          // Small banner, just switch to right positioning
          positionToRightSide(banner);
        }
      }
    } 
    // Handle right positioning
    else {
      const currentRight = parseInt(computedStyle.right);
      
      // Ensure right edge constraint
      if (currentRight < CONFIG.edgeGap) {
        banner.style.right = CONFIG.edgeGap + 'px';
      }
      
      // Calculate implied left position
      const impliedLeft = viewportWidth - bannerWidth - currentRight;
      
      // Ensure left edge constraint is exactly equal to edge gap
      if (impliedLeft < CONFIG.edgeGap && bannerWidth > CONFIG.minWidth) {
        // Adjust width to ensure exact equal gaps
        const newWidth = viewportWidth - currentRight - CONFIG.edgeGap;
        // Only apply if the new width is reasonable
        if (newWidth >= CONFIG.minWidth) {
          banner.style.width = newWidth + 'px';
          saveWidth(newWidth);
        }
      }
      
      // If the banner is too wide for the viewport, reduce its width
      if (bannerWidth > maxWidth) {
        banner.style.width = maxWidth + 'px';
        saveWidth(maxWidth);
      }
    }
  }
  
  // ENSURE TOGGLE BUTTON IS VISIBLE
  function ensureToggleButtonVisible(banner) {
    if (!banner) return;
    
    // Skip during drag expansion
    if (isDragExpanding) return;
    
    const toggleButton = document.getElementById('ipv4-toggle-button');
    if (!toggleButton) return;
    
    // Make sure toggle button is visible
    toggleButton.style.display = '';
    
    // If we're using left positioning, make sure toggle button is visible on the right
    if (dragState.isUsingLeft && !isMinimized && !dragState.ignoreLeftPositioning) {
      const toggleRect = toggleButton.getBoundingClientRect();
      const viewportWidth = getViewportWidth();
      
      // If toggle button is close to or past right edge, reduce banner width
      if (toggleRect.right > viewportWidth - 5) {
        const bannerWidth = banner.offsetWidth;
        const newWidth = bannerWidth - (toggleRect.right - viewportWidth + CONFIG.edgeGap);
        if (newWidth >= CONFIG.minWidth) {
          banner.style.width = newWidth + 'px';
        }
      }
    }
  }
  
  // POSITION BANNER TO RIGHT SIDE
  function positionToRightSide(banner) {
    if (!banner) return false;
    
    banner.style.left = 'auto';
    banner.style.right = CONFIG.edgeGap + 'px';
    dragState.isUsingLeft = false;
    clearLeftPosition();
    
    // Mark the time of this positioning
    lastPositioningTime = Date.now();
    
    return true;
  }

  // ENSURE BANNER IS WITHIN VIEWPORT
  function ensureBannerInViewport() {
    const banner = document.getElementById('ipv4-banner');
    if (!banner) return;
    
    // Skip during drag expansion
    if (isDragExpanding) return;
    
    // If we're forcing right positioning, always use right positioning
    if (dragState.alwaysUseRight) {
      positionToRightSide(banner);
      // Always enforce left edge gap
      enforceLeftEdgeGap(banner);
      return;
    }
    
    const viewportWidth = getViewportWidth();
    const viewportHeight = getViewportHeight();
    const bannerWidth = banner.offsetWidth;
    
    const computedStyle = window.getComputedStyle(banner);
    let positionAdjusted = false;
    
    // If minimized, always force right positioning
    if (isMinimized && dragState.isUsingLeft) {
      positionToRightSide(banner);
      positionAdjusted = true;
    }
    // Check if using left positioning
    else if (dragState.isUsingLeft && !dragState.ignoreLeftPositioning) {
      const currentLeft = parseInt(computedStyle.left);
      // If banner is too far left (partially off-screen)
      if (currentLeft < CONFIG.edgeGap) {
        banner.style.left = CONFIG.edgeGap + 'px';
        positionAdjusted = true;
      }
      // If banner is too far right (partially off-screen)
      else if (currentLeft + bannerWidth > viewportWidth - CONFIG.edgeGap) {
        // If expanded but would be off-screen, switch to right positioning
        positionToRightSide(banner);
        positionAdjusted = true;
      }
    } 
    // Check if using right positioning
    else {
      const currentRight = parseInt(computedStyle.right);
      // If banner is too far right (partially off-screen)
      if (currentRight < CONFIG.edgeGap) {
        banner.style.right = CONFIG.edgeGap + 'px';
        positionAdjusted = true;
      }
      
      // Check and enforce left edge gap
      if (!positionAdjusted) {
        if (enforceLeftEdgeGap(banner)) {
          positionAdjusted = true;
        }
      }
    }
    
    // Check vertical positioning - enhanced with buffer for better visibility
    const safetyBuffer = 10; // Extra pixels to keep banner visible
    
    if (dragState.isUsingTop) {
      const currentTop = parseInt(computedStyle.top);
      // If banner is too far down (add buffer)
      if (currentTop + CONFIG.bannerHeight + safetyBuffer > viewportHeight) {
        const newTop = Math.max(0, viewportHeight - CONFIG.bannerHeight - safetyBuffer);
        banner.style.top = newTop + 'px';
        positionAdjusted = true;
      }
      // If banner is too far up
      else if (currentTop < 0) {
        banner.style.top = '0px';
        positionAdjusted = true;
      }
    } else {
      const currentBottom = parseInt(computedStyle.bottom);
      // If banner is too far up (add buffer)
      if (currentBottom + CONFIG.bannerHeight + safetyBuffer > viewportHeight) {
        const newBottom = Math.max(0, viewportHeight - CONFIG.bannerHeight - safetyBuffer);
        banner.style.bottom = newBottom + 'px';
        positionAdjusted = true;
      }
      // If banner is too far down
      else if (currentBottom < 0) {
        banner.style.bottom = '0px';
        positionAdjusted = true;
      }
    }
    
    // Save adjusted position
    if (positionAdjusted) {
      // Save vertical position
      if (dragState.isUsingTop) {
        savePosition({ top: banner.style.top });
      } else {
        savePosition({ bottom: banner.style.bottom });
      }
    }
    
    // Apply final constraints - this enforces both left and right gaps
    constrainBannerToViewport(banner);
  }
  
  // TOGGLE MINIMIZED STATE
  function toggleMinimized(banner, force = null) {
    if (!banner || isDuringToggleTransition || isDragExpanding) return;
    
    // Set transition flag to prevent multiple rapid toggles
    isDuringToggleTransition = true;
    
    // Reset cursor - especially important when minimizing during drag
    document.body.style.cursor = '';
    // Also reset any cursor on the banner itself
    if (banner) banner.style.cursor = '';
    
    // Use forced state if provided
    const wasMinimized = isMinimized;
    if (force !== null) {
      isMinimized = force;
    } else {
      isMinimized = !isMinimized;
    }
    
    // Save minimized state
    saveMinimizedState(isMinimized);
    
    // Always ensure right positioning first
    positionToRightSide(banner);
    
    // If expanding from minimized
    if (!isMinimized) {
      // Save width before expanding for better restore
      preMinimizeWidth = null; // Reset this as we're expanding
      
      // Important: Set width to 0 first to ensure animation starts from the right side
      banner.style.width = '0';
      
      // Show elements before animation begins to ensure they're visible during expansion
      const title = document.getElementById('ipv4-title');
      const scrollContainer = document.getElementById('ipv4-scroll-container');
      
      if (title) title.style.display = '';
      if (scrollContainer) scrollContainer.style.display = '';
      
      // Remove minimized class before transition starts
      banner.classList.remove('ipv4-minimized');
      
      // Clean up any minimized-specific styles
      banner.style.maxWidth = '';
      banner.style.minWidth = '';
      
      // Change the toggle icon immediately
      const toggleButton = document.getElementById('ipv4-toggle-button');
      if (toggleButton) {
        toggleButton.innerHTML = '▶';
        toggleButton.title = 'Minimize';
        toggleButton.style.marginLeft = `${CONFIG.normalSpacing}px`;
        toggleButton.style.fontFamily = 'Arial, "Courier New", monospace !important';
      }
      
      // Update logo to expanded state immediately
      updateLogo(false);
      
      // Force layout reflow before applying transition
      void banner.offsetWidth;
      
      // Now apply transition and animate from right
      banner.style.transition = 'width 0.25s ease-out';
      
      // Use stored width from before minimization, or get saved width
      getSavedWidth().then(savedWidth => {
        // If there was a flag indicating banner was at max width, use max width
        if (isAtMaxWidth) {
          const maxWidth = calculateMaxBannerWidth();
          banner.style.width = maxWidth + 'px';
          saveWidth(maxWidth);
        } 
        // Otherwise, use the saved/stored width
        else {
          // Ensure the width respects viewport constraints
          const maxWidth = calculateMaxBannerWidth();
          const finalWidth = Math.min(savedWidth, maxWidth);
          
          banner.style.width = finalWidth + 'px';
          saveWidth(finalWidth);
        }
      });
    } else {
      // Save width before minimizing for better restore next time
      const currentWidth = banner.offsetWidth;
      if (currentWidth >= CONFIG.minWidth) {
        preMinimizeWidth = currentWidth;
        preMinimizeWidthPercent = calculateWidthPercentage(currentWidth);
        // Save this width to storage to ensure it's available in new tabs
        saveWidth(currentWidth);
      }
      
      // For minimizing, we need to animate from current width to minimized width
      
      // First get the minimized width (we need to measure this)
      const minimizedClone = banner.cloneNode(true);
      minimizedClone.style.position = 'absolute';
      minimizedClone.style.visibility = 'hidden';
      minimizedClone.style.width = 'auto';
      minimizedClone.style.maxWidth = 'max-content';
      minimizedClone.style.minWidth = 'min-content';
      minimizedClone.classList.add('ipv4-minimized');
      
      // Hide all content elements in the clone
      const cloneTitle = minimizedClone.querySelector('#ipv4-title');
      const cloneScroll = minimizedClone.querySelector('#ipv4-scroll-container');
      if (cloneTitle) cloneTitle.style.display = 'none';
      if (cloneScroll) cloneScroll.style.display = 'none';
      
      // Add to DOM to measure
      document.body.appendChild(minimizedClone);
      const minimizedWidth = minimizedClone.offsetWidth;
      document.body.removeChild(minimizedClone);
      
      // Get the actual elements in the real banner
      const title = document.getElementById('ipv4-title');
      const scrollContainer = document.getElementById('ipv4-scroll-container');
      const toggleButton = document.getElementById('ipv4-toggle-button');
            
      // Change the toggle icon immediately
      if (toggleButton) {
        toggleButton.innerHTML = '◀';
        toggleButton.title = 'Expand';
        toggleButton.style.marginLeft = `${CONFIG.minimizedSpacing}px`;
        toggleButton.style.fontFamily = 'Arial, "Courier New", monospace !important';
      }
      
      // Update logo to minimized state immediately
      updateLogo(true);
      
      // Now set up the animation
      banner.style.transition = `width ${CONFIG.minimizeAnimationDuration}ms ease-in`;
      
      // Apply overflow hidden to prevent content from spilling out during animation
      const originalOverflow = banner.style.overflow;
      banner.style.overflow = 'hidden';
      
      // Start the animation - set specific target width
      banner.style.width = minimizedWidth + 'px';
      
      // Add minimized class and hide elements after animation finishes
      setTimeout(() => {
        // Hide content elements after the animation is complete
        if (title) title.style.display = 'none';
        if (scrollContainer) scrollContainer.style.display = 'none';
        
        // Now set the final minimized state
        banner.style.width = 'auto';
        banner.style.maxWidth = 'max-content';
        banner.style.minWidth = 'min-content';
        banner.style.overflow = originalOverflow;
        banner.classList.add('ipv4-minimized');
      }, CONFIG.minimizeAnimationDuration);
    }
    
    // If expanding, trigger a data fetch to update the ticker
    if (!isMinimized && !hasFetchedData) {
      fetchData();
    }
    
    // Clear transition state after animation completes
    setTimeout(() => {
      if (banner) {
        banner.style.transition = '';
        
        // When expanding, check for overflow after transition completes
        if (!isMinimized) {
          // Delayed check for overflow to allow animation to complete
          setTimeout(() => {
            if (checkContentOverflow(banner)) {
              // If content would overflow after expanding, minimize again
              toggleMinimized(banner, true);
            }
          }, CONFIG.minimizeDelay);
        }
      }
      
      isDuringToggleTransition = false;
      
      // Final check to ensure banner is in viewport
      ensureBannerInViewport();
    }, CONFIG.minimizeAnimationDuration + 50); // Slightly longer than CSS transition
  }
  
  // UPDATE LOGO BASED ON MINIMIZED STATE
  function updateLogo(minimizedState) {
    const logoLink = document.getElementById('ipv4-logo-link');
    if (!logoLink) return;
    
    // Clear existing logo
    logoLink.innerHTML = '';
    
    // If Chrome API is available, use appropriate icon
    if (isChromeAvailable()) {
      try {
        const logo = document.createElement('img');
        logo.id = 'ipv4-logo';
        logo.alt = 'IPv4.Global Logo';
        
        if (minimizedState) {
          // Use 48x48 icon but display at 16x16 pixels when minimized
          logo.src = chrome.runtime.getURL('assets/icon-48x48.png');
          // Fixed width/height with proper vertical centering
          logo.style.cssText = 'height: 16px; width: 16px; flex-shrink: 0; object-fit: contain; vertical-align: middle; display: block;';
        } else {
          // Use regular logo when expanded
          logo.src = chrome.runtime.getURL('assets/logo.png');
          // Set fixed height but maintain aspect ratio
          // Make sure it's vertically centered
          logo.style.cssText = 'height: 16px; width: auto; flex-shrink: 0; object-fit: contain; vertical-align: middle; display: block;';
        }
        
        logo.onerror = () => {
          // If logo fails to load, replace with text
          logoLink.innerHTML = '';
          logoLink.appendChild(createTextLogo());
        };
        
        logoLink.appendChild(logo);
        return;
      } catch (e) {
        log.info('Failed to create image logo:', e);
      }
    }
    
    // Fallback to text logo
    logoLink.appendChild(createTextLogo());
  }
  
  // UPDATE ELEMENTS BASED ON MINIMIZED STATE
  async function updateMinimizedState(banner) {
    if (!banner) return;
    
    // Just skip this function during click expansion as we handle elements directly
    if (isDuringToggleTransition) {
      return;
    }
    
    const title = document.getElementById('ipv4-title');
    const scrollContainer = document.getElementById('ipv4-scroll-container');
    
    if (isMinimized) {
      // Hide elements when minimized
      if (title) title.style.display = 'none';
      if (scrollContainer) scrollContainer.style.display = 'none';
      
      // Add class for minimized state
      banner.classList.add('ipv4-minimized');
      
      // Force width to auto to prevent white space issues
      banner.style.width = 'auto';
      banner.style.maxWidth = 'max-content';
      banner.style.minWidth = 'min-content';
      
      // Always ensure right positioning for minimized state
      positionToRightSide(banner);
    } else {
      // Show elements when expanded
      if (title) title.style.display = '';
      if (scrollContainer) scrollContainer.style.display = '';
      
      // Remove minimized class
      banner.classList.remove('ipv4-minimized');
      
      // If banner was previously at max width, set it to max width again
      if (isAtMaxWidth) {
        const maxWidth = calculateMaxBannerWidth();
        banner.style.width = maxWidth + 'px';
        saveWidth(maxWidth);
      } 
      // Otherwise use the saved width (either pixel or percentage)
      else {
        // Get the width - either from preMinimizeWidth or from storage
        let savedWidth;
        
        // If we have the width percentage, use that first (better for zoom levels)
        if (preMinimizeWidthPercent !== null && preMinimizeWidthPercent > 0) {
          const viewportWidth = getViewportWidth();
          savedWidth = Math.round((preMinimizeWidthPercent / 100) * viewportWidth);
        } 
        // If we have pixel width, use that
        else if (preMinimizeWidth !== null && preMinimizeWidth >= CONFIG.minWidth) {
          savedWidth = preMinimizeWidth;
        } 
        // Otherwise get from storage
        else {
          savedWidth = await getSavedWidth();
        }
        
        const viewportWidth = getViewportWidth();
        const maxWidth = calculateMaxBannerWidth();
        
        // IMPORTANT: Use saved width but don't exceed max width
        const usableWidth = Math.min(savedWidth, maxWidth);
        
        // Clear any minimized-specific styles
        banner.style.maxWidth = '';
        banner.style.minWidth = '';
        
        // Apply appropriate width - this is the exact width the user had before minimizing
        banner.style.width = usableWidth + 'px';
        
        // Update saved width if we had to adjust it due to viewport constraints
        if (usableWidth !== savedWidth) {
          saveWidth(usableWidth);
        }
      }
      
      // Enforce left edge gap
      enforceLeftEdgeGap(banner);
    }
  }
  
  // HANDLE WINDOW RESIZE
  function handleWindowResize() {
    if (isDestroyed || !bannerExists()) return;
    
    // IMMEDIATE ACTION: Apply resize without debounce for major size changes
    const banner = document.getElementById('ipv4-banner');
    if (!banner) return;
    
    const currentViewportWidth = getViewportWidth();
    const currentWidth = banner.offsetWidth;
    const maxWidth = calculateMaxBannerWidth();
    
    // If banner was at max width, keep it at max width after resize
    if (isAtMaxWidth && !isMinimized) {
      banner.style.width = maxWidth + 'px';
      saveWidth(maxWidth);
      
      // Force re-check of left edge gap to ensure equal gaps
      enforceLeftEdgeGap(banner);
    }
    // CRITICAL: Immediately check if banner is too wide for the viewport
    else if (!isMinimized && currentWidth > maxWidth) {
      banner.style.width = maxWidth + 'px';
      saveWidth(maxWidth);
      
      // Force re-check of left edge gap to ensure equal gaps
      enforceLeftEdgeGap(banner);
    }
    
    // Use a debounce technique for fine-tuning and less drastic changes
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    
    resizeTimeout = setTimeout(() => {
      const banner = document.getElementById('ipv4-banner');
      if (!banner) return;
      
      const currentViewportWidth = getViewportWidth();
      const widthChange = Math.abs(currentViewportWidth - initialViewportWidth);
      const maxWidth = calculateMaxBannerWidth();
      const currentWidth = banner.offsetWidth;
      
      // For minimized state, always force right positioning
      if (isMinimized) {
        positionToRightSide(banner);
      }
      // If we're forcing right positioning, always use right positioning
      else if (dragState.alwaysUseRight) {
        positionToRightSide(banner);
        
        // If banner was at max width, ensure it remains at max width
        if (isAtMaxWidth) {
          banner.style.width = maxWidth + 'px';
          saveWidth(maxWidth);
        }
        // Always adjust width based on viewport when using right positioning
        else if (!isMinimized && currentWidth > maxWidth) {
          banner.style.width = maxWidth + 'px';
          saveWidth(maxWidth);
        }
        
        // Always ensure both left and right gaps are exactly equal
        enforceLeftEdgeGap(banner);
      }
      // If window has been resized significantly, reposition banner
      else if (widthChange > CONFIG.windowResizeThreshold) {
        // If banner is using left positioning and near left edge
        if (dragState.isUsingLeft && isNearLeftEdge(banner)) {
          // Switch to right-side positioning to avoid sticking to left edge
          positionToRightSide(banner);
        }
        
        // Update initial viewport width
        initialViewportWidth = currentViewportWidth;
        
        // If the window was resized smaller, adjust banner width
        if (currentViewportWidth < initialViewportWidth && !isMinimized) {
          if (currentWidth > maxWidth) {
            banner.style.width = maxWidth + 'px';
            saveWidth(maxWidth);
          }
        }
      }
      // Adjust width if needed based on viewport
      else if (!isMinimized) {
        // CRITICAL: Always enforce exact left edge gap
        enforceLeftEdgeGap(banner);
      }
      
      // Ensure banner stays in viewport
      ensureBannerInViewport();
      
      // Special case: if left-positioned banner gets too close to the right edge,
      // switch back to right-positioning
      if (dragState.isUsingLeft && !isMinimized && !dragState.ignoreLeftPositioning) {
        const currentLeft = parseInt(window.getComputedStyle(banner).left);
        const bannerWidth = banner.offsetWidth;
        
        if (currentLeft + bannerWidth > currentViewportWidth - CONFIG.edgeGap) {
          // Switch to right positioning
          positionToRightSide(banner);
        }
      }
      
      // Apply final constraints to ensure both left and right gaps
      constrainBannerToViewport(banner);
      
      // Ensure toggle button is visible
      ensureToggleButtonVisible(banner);
    }, 50); // Reduced from 200ms to 50ms for faster response
  }
  
  // Helper function to handle vertical dragging
  function handleVerticalDrag(e) {
    if (!dragState.isDragging || !dragState.isVerticalDrag) return;
    
    const banner = document.getElementById('ipv4-banner');
    if (!banner) return;
    
    const deltaY = e.clientY - dragState.startY;
    const viewportHeight = getViewportHeight();
    
    if (dragState.isUsingTop) {
      // If using top positioning
      let newTop = dragState.startPos + deltaY;
      
      // Prevent dragging past viewport bottom
      if (newTop > viewportHeight - CONFIG.bannerHeight) {
        newTop = viewportHeight - CONFIG.bannerHeight;
      }
      
      // Prevent dragging past top
      if (newTop < 0) {
        newTop = 0;
      }
      
      banner.style.top = newTop + 'px';
      banner.style.bottom = 'auto';
    } else {
      // If using bottom positioning
      let newBottom = dragState.startPos - deltaY;
      
      // Prevent dragging past viewport top
      if (newBottom > viewportHeight - CONFIG.bannerHeight) {
        newBottom = viewportHeight - CONFIG.bannerHeight;
      }
      
      // Prevent dragging past bottom
      if (newBottom < 0) {
        newBottom = 0;
      }
      
      banner.style.bottom = newBottom + 'px';
      banner.style.top = 'auto';
    }
  }
  
  // SETUP DRAG AND RESIZE FUNCTIONALITY
  function setupDragFunctionality(banner) {
    // Create drag handle with vertical dots
    const dragHandle = document.createElement('div');
    dragHandle.id = 'ipv4-drag-handle';
    dragHandle.style.cssText = `
      cursor: move;
      width: 16px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-right: 6px;
      position: relative;
    `;
    
    // Add tooltip to indicate both drag directions
    dragHandle.title = "Drag to move • Drag left/right to resize";
    
    // Create vertical dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 3px;
        height: 3px;
        background-color: #aaa;
        border-radius: 50%;
        margin: 1px 0;
      `;
      dragHandle.appendChild(dot);
    }
    
    // Insert at beginning of banner
    banner.insertBefore(dragHandle, banner.firstChild);
    
    // Mouse down event - start dragging
    dragHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      
      // Don't allow dragging during toggle transitions
      if (isDuringToggleTransition) return;
      
      dragState.isDragging = true;
      dragState.startY = e.clientY;
      dragState.startX = e.clientX;
      dragState.initialClickX = e.clientX; // Track initial click point
      dragState.lastDragTime = Date.now();
      dragState.resizingDirection = null;
      dragState.dragDistance = 0;
      dragState.draggedRightward = false;
      dragState.ignoreLeftPositioning = false; // Reset left positioning flag
      
      // Track viewport-relative position for edge detection
      dragState.dragStartViewportX = e.clientX; 
      
      // Check if banner is near left edge
      dragState.wasNearLeftEdge = isNearLeftEdge(banner);
      
      // Get current position
      const computedStyle = window.getComputedStyle(banner);
      const currentTop = computedStyle.top === 'auto' ? null : parseInt(computedStyle.top);
      const currentBottom = computedStyle.bottom === 'auto' ? null : parseInt(computedStyle.bottom);
      const currentRight = computedStyle.right === 'auto' ? null : parseInt(computedStyle.right);
      const currentLeft = computedStyle.left === 'auto' ? null : parseInt(computedStyle.left);
      
      // Store the position we're actually using (top or bottom)
      if (currentTop && currentTop !== 'auto') {
        dragState.isUsingTop = true;
        dragState.startPos = currentTop;
      } else {
        dragState.isUsingTop = false;
        dragState.startPos = currentBottom;
      }
      
      // Store left/right position for horizontal position
      dragState.startRight = currentRight === 'auto' ? null : currentRight;
      dragState.startLeft = currentLeft === 'auto' ? null : currentLeft;
      dragState.isUsingLeft = (currentLeft !== null && currentLeft !== 'auto');
      
      // Store current width for horizontal resizing
      dragState.startWidth = banner.offsetWidth;
      dragState.lastWidth = banner.offsetWidth;
      
      // Reset direction flags each time dragging starts
      dragState.isHorizontalDrag = false;
      dragState.isVerticalDrag = false;
      
      // Add event listeners for dragging
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Change cursor during drag
      document.body.style.cursor = 'move';
    });
    
    // Mouse move event - handle both vertical position and horizontal resize
    function handleMouseMove(e) {
      if (!dragState.isDragging) return;
      
      // If we're forcing right positioning, always use right positioning
      if (dragState.alwaysUseRight && !dragState.isUsingLeft) {
        // If we're dragging and we're supposed to be using right positioning,
        // enforce right positioning
        banner.style.left = 'auto';
        banner.style.right = CONFIG.edgeGap + 'px';
      }
      
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      
      // Accumulate drag distance for possible auto-minimize
      dragState.dragDistance += Math.abs(e.clientX - dragState.initialClickX);
      
      // Determine drag direction if not already determined
      if (!dragState.isHorizontalDrag && !dragState.isVerticalDrag) {
        if (absX > 5 || absY > 5) { // Small threshold to determine direction
          // If we're minimized, prioritize vertical dragging unless very clearly horizontal
          if (isMinimized && absX < absY * 2) {
            dragState.isHorizontalDrag = false;
            dragState.isVerticalDrag = true;
          } else {
            dragState.isHorizontalDrag = absX > absY;
            dragState.isVerticalDrag = !dragState.isHorizontalDrag;
          }
        }
      }
      
      // IMPORTANT: If we're minimized, deal with dragging differently
      if (isMinimized) {
        // If vertical drag, allow without expanding
        if (dragState.isVerticalDrag) {
          handleVerticalDrag(e);
          return;
        }
        
        // If horizontal drag to the left, handle smooth drag expansion
        if (dragState.isHorizontalDrag && deltaX < 0 && absX > 15) {
          // If not already drag-expanding, start
          if (!isDragExpanding) {
            startDragExpansion(banner, e);
          } 
          // Continue drag expansion
          else {
            handleDragExpansion(banner, e);
          }
          return;
        }
        
        // For all other cases, just allow dragging without expanding
        return;
      }
      
      // If we're in drag-expansion mode, handle it separately
      if (isDragExpanding) {
        handleDragExpansion(banner, e);
        return;
      }
      
      // Handle horizontal resize/positioning for non-minimized state
      if (dragState.isHorizontalDrag && !isMinimized) {
        // Ensure we have the most up-to-date viewport width
        const viewportWidth = getViewportWidth();
        
        // CRITICAL FIX: Always use right-side positioning for horizontal dragging
        // This ensures the banner is "stuck" to the right side of the screen
        if (!dragState.isUsingLeft && dragState.alwaysUseRight) {
          // Continue using right-side positioning
          
          // Only allow resizing, not repositioning
          if (deltaX < 0) {
            // DRAGGING LEFT = EXPAND WIDTH
            let newWidth = dragState.startWidth - deltaX;
            
            // Calculate max width that allows for exactly 20px left gap
            const maxAllowedWidth = viewportWidth - CONFIG.edgeGap - 
                                    parseInt(window.getComputedStyle(banner).right);
            
            // Hard limit to max width to ensure exact 20px left edge gap
            newWidth = Math.min(newWidth, maxAllowedWidth);
            
            // Enforce min width
            newWidth = Math.max(CONFIG.minWidth, newWidth);
            
            // Check if this puts us at max width
            isAtMaxWidth = isWidthAtMax(newWidth);
            
            // Apply width directly - maintain right positioning
            banner.style.width = newWidth + 'px';
            dragState.lastWidth = newWidth;
            
            // Always check left edge gap
            enforceLeftEdgeGap(banner);
          } else {
            // DRAGGING RIGHT = REDUCE WIDTH
            let newWidth = dragState.startWidth - deltaX;
            
            // Auto-minimize if width is small enough
            if (newWidth < CONFIG.autoMinimizeWidth) {
              preMinimizeWidth = dragState.startWidth;
              preMinimizeWidthPercent = calculateWidthPercentage(dragState.startWidth);
              // Reset drag cursors
              document.body.style.cursor = '';
              if (banner) banner.style.cursor = '';
              toggleMinimized(banner, true);
              dragState.isDragging = false;
              return;
            }
            
            // Enforce min width
            newWidth = Math.max(CONFIG.minWidth, newWidth);
            
            // Not at max width anymore since we're reducing it
            isAtMaxWidth = false;
            
            // Apply new width - maintain right positioning
            banner.style.width = newWidth + 'px';
            dragState.lastWidth = newWidth;
          }
          
          // Final check to ensure proper left edge gap
          enforceLeftEdgeGap(banner);
        }
        // We're using left positioning (should not happen with alwaysUseRight, but handle it anyway)
        else if (dragState.isUsingLeft && !dragState.ignoreLeftPositioning) {
          // For left positioning dragging, switch to right-side positioning
          // to enforce "sticking" to the right side
          positionToRightSide(banner);
          
          // Reset drag state to continue with right positioning
          dragState.isUsingLeft = false;
          dragState.ignoreLeftPositioning = true;
          
          // Reset start X to avoid jump
          dragState.startX = e.clientX;
          return;
        }
      }
      
      // Handle vertical position
      if (dragState.isVerticalDrag) {
        handleVerticalDrag(e);
      }
      
      // Update last drag time to track motion
      dragState.lastDragTime = Date.now();
      
      // Ensure toggle button is always visible
      ensureToggleButtonVisible(banner);
    }
    
    // Mouse up event - stop dragging
    function handleMouseUp(e) {
      if (!dragState.isDragging) return;
      
      // If we're in drag expansion mode, finish expansion
      if (isDragExpanding) {
        finishDragExpansion(banner);
      }
      // Normal drag handling
      else {
        // If this was a pure click (not a drag)
        const wasPureClick = Math.abs(e.clientX - dragState.initialClickX) < 3 && 
                            Date.now() - dragState.lastDragTime < 300;
        
        // IMPORTANT: We no longer expand on drag handle click
        // (Only expand on arrow button click, which has its own handler)
        
        // Save new width if we were doing horizontal drag and not minimized
        if (dragState.isHorizontalDrag && !isMinimized) {
          // Only save if width is reasonable
          const currentWidth = banner.offsetWidth;
          if (currentWidth >= CONFIG.minWidth) {
            saveWidth(currentWidth);
            // Also update preMinimizeWidth for better unminimize behavior
            preMinimizeWidth = currentWidth;
            preMinimizeWidthPercent = calculateWidthPercentage(currentWidth);
          }
        }
        
        // Save position if we were doing vertical drag
        if (dragState.isVerticalDrag) {
          const computedStyle = window.getComputedStyle(banner);
          if (dragState.isUsingTop) {
            savePosition({ top: computedStyle.top });
          } else {
            savePosition({ bottom: computedStyle.bottom });
          }
        }
      }
      
      // Reset drag state
      dragState.isDragging = false;
      dragState.isHorizontalDrag = false;
      dragState.isVerticalDrag = false;
      dragState.resizingDirection = null;
      dragState.dragDistance = 0;
      dragState.wasNearLeftEdge = false;
      dragState.draggedRightward = false;
      dragState.ignoreLeftPositioning = false;
      
      // Remove event listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Reset cursor
      document.body.style.cursor = '';
      document.documentElement.style.cursor = ''; // Reset html element cursor too
      if (banner) banner.style.cursor = '';
      
      // Final bounds check
      constrainBannerToViewport(banner);
      
      // Force check of left edge gap
      enforceLeftEdgeGap(banner);
      
      // Final check to ensure banner is in viewport
      ensureBannerInViewport();
      
      // Ensure toggle button is visible
      ensureToggleButtonVisible(banner);
      
      // If we're forcing right positioning, always use right positioning
      if (dragState.alwaysUseRight) {
        positionToRightSide(banner);
        // Make sure to enforce left edge gap
        enforceLeftEdgeGap(banner);
      }
    }
  }
  
  // BANNER CREATION
  async function createBanner() {
    // First check if banner already exists
    if (bannerCreated && bannerExists()) {
      return true;
    }
    
    // Reset flag if banner doesn't actually exist
    if (bannerCreated && !bannerExists()) {
      bannerCreated = false;
    }
    
    // Remove any partial banner elements that might exist
    const existingBanner = document.getElementById('ipv4-banner');
    if (existingBanner) {
      try {
        existingBanner.parentNode.removeChild(existingBanner);
      } catch (e) {
        log.warn('Could not remove existing partial banner:', e);
      }
    }
    
    try {
      // Load settings first to avoid race conditions
      await getAllSettings();
      
      // Store initial viewport width for resize detection
      initialViewportWidth = getViewportWidth();
      
      // Get saved view mode
      currentViewMode = await getSavedViewMode();
      
      // Get saved position
      const position = await getSavedPosition();
      
      // Get viewport dimensions and calculate max banner width
      const viewportWidth = getViewportWidth();
      const maxWidth = calculateMaxBannerWidth();
      
      // Check if banner was at max width
      isAtMaxWidth = await getSetting(CONFIG.maxWidthFlag, false);
      
      // Get saved width and ensure it's reasonable
      let savedWidth;
      
      // If it was at max width, use the current max width
      if (isAtMaxWidth) {
        savedWidth = maxWidth;
      } else {
        // Otherwise get the normal saved width
        savedWidth = await getSavedWidth();
      }
      
      // ENFORCE MAX WIDTH: Make sure saved width respects both left and right gaps
      savedWidth = Math.min(savedWidth, maxWidth);
      
      if (savedWidth < CONFIG.minWidth) {
        savedWidth = CONFIG.defaultWidth;
        // Still enforce max width even for default
        savedWidth = Math.min(savedWidth, maxWidth);
        await saveWidth(savedWidth);
      }
      
      // Initialize preMinimizeWidth with saved width
      preMinimizeWidth = savedWidth;
      preMinimizeWidthPercent = calculateWidthPercentage(savedWidth);
      
      // Get saved left position
      let savedLeft = await getSavedLeftPosition();
      
      // Get saved minimized state
      isMinimized = await getSavedMinimizedState();
      
      // If we're forcing right positioning, ignore saved left position
      if (dragState.alwaysUseRight) {
        savedLeft = null;
        await clearLeftPosition();
      }
      // For minimized state, always use right positioning
      else if (isMinimized) {
        savedLeft = null;
        await clearLeftPosition();
      }
      // Otherwise, validate left position if it exists
      else if (savedLeft !== null) {
        // Make sure savedLeft is not less than edgeGap
        if (savedLeft < CONFIG.edgeGap) {
          savedLeft = CONFIG.edgeGap;
        }
        
        // If saved position would place banner off-screen, reset it
        if (savedLeft > viewportWidth - CONFIG.minWidth) {
          savedLeft = null; // Will use right positioning
          await clearLeftPosition();
        }
        
        // If we're using left positioning, check if alwaysUseRight is true
        if (dragState.alwaysUseRight) {
          savedLeft = null;
          await clearLeftPosition();
        }
      }
      
      // Create banner container
      const banner = document.createElement('div');
      banner.id = 'ipv4-banner';
      
      // Base style for banner - critically using flex with nowrap
      let bannerStyle = `
        position: fixed;
        z-index: 2147483647;
        background-color: white;
        color: black;
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        padding: 4px 8px;
        box-sizing: border-box;
        box-shadow: 0 0 8px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
        font-size: 12px;
        border-radius: 4px;
        opacity: 0.95;
        height: ${CONFIG.bannerHeight}px;
        overflow: hidden;
      `;
      
      // Add width style differently based on minimized state
      if (isMinimized) {
        bannerStyle += `
          width: auto;
          min-width: min-content;
          max-width: max-content;
        `;
      } else {
        // For expanded state, ensure width doesn't exceed viewport
        // CRITICAL: Explicitly enforce the max width that respects both left and right gaps
        // IMPORTANT: Use exact saved width to respect user's last setting
        const usableWidth = isAtMaxWidth ? maxWidth : Math.min(savedWidth, maxWidth);
        bannerStyle += `width: ${usableWidth}px;`;
        // Save this back in case we had to reduce it
        await saveWidth(usableWidth);
        preMinimizeWidth = usableWidth;
        preMinimizeWidthPercent = calculateWidthPercentage(usableWidth);
      }
      
      // Apply horizontal positioning 
      // If alwaysUseRight is true, always use right positioning
      if (dragState.alwaysUseRight) {
        bannerStyle += `right: ${CONFIG.edgeGap}px; left: auto;`;
        dragState.isUsingLeft = false;
      }
      // For minimized state, ALWAYS force right positioning
      else if (isMinimized || savedLeft === null) {
        // Use right positioning
        bannerStyle += `right: ${CONFIG.edgeGap}px; left: auto;`;
        dragState.isUsingLeft = false;
      } else {
        // Use left positioning with specified gap
        bannerStyle += `left: ${savedLeft}px; right: auto;`;
        dragState.isUsingLeft = true;
      }
      
      // Apply vertical positioning
      if (position.top) {
        bannerStyle += `top: ${position.top}; bottom: auto;`;
        dragState.isUsingTop = true;
      } else {
        bannerStyle += `bottom: ${position.bottom}; top: auto;`;
        dragState.isUsingTop = false;
      }
      
      // Apply styles to banner
      banner.style.cssText = bannerStyle;
      
      // Apply minimized class if needed
      if (isMinimized) {
        banner.classList.add('ipv4-minimized');
      }
      
      // Create logo with compact styling
      const logoLink = document.createElement('a');
      logoLink.id = 'ipv4-logo-link';
      logoLink.href = 'https://auctions.ipv4.global';
      logoLink.target = '_blank';
      logoLink.style.cssText = 'text-decoration: none; display: flex; align-items: center; margin-right: 6px; flex-shrink: 0; height: 100%;';
      
      banner.appendChild(logoLink);
      
      // Create title - more compact
      const title = document.createElement('span');
      title.id = 'ipv4-title';
      title.title = currentViewMode === VIEW_MODES.PRIOR_SALES ? 
              "Click to switch to New Listings" : 
              "Click to switch to Prior Sales";
      title.style.cssText = `
        font-weight: bold;
        font-family: sans-serif;
        color: rgb(255, 255, 255);
        background-color: #0062ff;;
        font-size: 12px;
        margin-right: 0;
        padding: 10px;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: pointer;
        ${isMinimized ? 'display: none;' : ''}
      `;
      
      // Set title text based on current view mode
      title.innerHTML = currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales:' : 'New Listings:';
      
      // Add click event to toggle between modes
      title.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleViewMode();
      });
      
      banner.appendChild(title);
      
      // Create scroll container - inline with rest of content
      const scrollContainer = document.createElement('div');
      scrollContainer.id = 'ipv4-scroll-container';
      scrollContainer.style.cssText = `
        position: relative;
        flex: 1;
        min-width: 50px;
        height: 18px;
        overflow: hidden;
        display: flex;
        align-items: center;
        flex-shrink: 1;
        ${isMinimized ? 'display: none;' : ''}
      `;
      
      // Create scroll content
      const scrollContent = document.createElement('div');
      scrollContent.id = 'ipv4-scroll-content';
      scrollContent.style.cssText = `
        display: inline-block;
        white-space: nowrap;
        line-height: 18px;
        font-size: 12px;
      `;
      
      scrollContainer.appendChild(scrollContent);
      banner.appendChild(scrollContainer);
      
      // Add minimize/expand toggle button
      const toggleButton = document.createElement('div');
      toggleButton.id = 'ipv4-toggle-button';
      toggleButton.innerHTML = isMinimized ? '◀' : '▶';
      toggleButton.title = isMinimized ? 'Expand' : 'Minimize';
      toggleButton.style.cssText = `
        margin-left: ${isMinimized ? CONFIG.minimizedSpacing : CONFIG.normalSpacing}px;
        font-size: 10px;
        cursor: pointer;
        color: #999;
        flex-shrink: 0;
        font-family: Arial, "Courier New", monospace !important;
      `;
      toggleButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleMinimized(banner);
      };
      banner.appendChild(toggleButton);
      
      // Add inline styles for text elements and minimized state
      const itemStyles = document.createElement('style');
      itemStyles.textContent = `
        .prefix { color: #005398; font-weight: bold; }
        .registry { color: #0062ff; font-weight: bold; }
        .price { color: #13b5ea; font-weight: bold; }
        .ipv4-minimized { 
          width: auto !important; 
          max-width: max-content !important;
          min-width: min-content !important;
          background-color: white !important;
        }
      `;
      
      // Add banner to page
      try {
        document.body.appendChild(banner);
        document.head.appendChild(itemStyles);
        
        // Setup drag functionality
        setupDragFunctionality(banner);
        
        // Add logo based on state
        updateLogo(isMinimized);
          
        // Double check that elements were actually added
        const bannerAdded = document.getElementById('ipv4-banner');
          
        if (bannerAdded) {
          bannerCreated = true;
          log.info('Banner created successfully');
          
          // Add window resize handler
          window.addEventListener('resize', handleWindowResize);
          
          // CRITICAL: Always enforce left edge gap immediately after creation
          enforceLeftEdgeGap(banner);
          
          // Ensure banner is in viewport
          setTimeout(ensureBannerInViewport, 100);
          
          // Double-check left edge gap after a delay
          setTimeout(() => enforceLeftEdgeGap(banner), 200);
          
          // Release the initialization lock now that banner is created
          releaseInitLock();
        } else {
          log.warn('Banner creation verified failed');
          bannerCreated = false;
          releaseInitLock();
        }
      } catch (e) {
        log.error('Error adding banner to DOM:', e);
        bannerCreated = false;
        releaseInitLock();
      }
      
      // Return true optimistically, rendering will check if it succeeded
      return true;
    } catch (e) {
      log.error('Error creating banner:', e);
      releaseInitLock();
      return false;
    }
  }
  
  // CREATE TEXT LOGO
  function createTextLogo() {
    const logoText = document.createElement('span');
    logoText.textContent = 'IPv4.Global';
    logoText.style.cssText = `
      font-weight: bold;
      color: #13b5ea;
      font-size: 12px;
      white-space: nowrap;
      line-height: ${CONFIG.bannerHeight - 8}px;
      vertical-align: middle;
    `;
    return logoText;
  }
  
  // Helper function to get a valid price string with $ prefix
  function getValidPriceString(item, priceField) {
    if (!item) return '$??';
    
    // Check for nested property like 'price.perAddress'
    if (priceField.includes('.')) {
      const [mainField, subField] = priceField.split('.');
      if (item[mainField] && typeof item[mainField][subField] !== 'undefined') {
        const price = item[mainField][subField];
        const priceStr = price.toString();
        return priceStr.startsWith('$') ? priceStr : '$' + priceStr;
      }
    }
    
    // Direct property access
    if (typeof item[priceField] !== 'undefined') {
      const price = item[priceField];
      
      // Skip if price is actually null, undefined or empty string
      if (price === null || price === undefined || price === '') {
        return '';
      }
      
      const priceStr = price.toString();
      return priceStr.startsWith('$') ? priceStr : '$' + priceStr;
    }
    
    return ''; // Return empty string if price field not found
  }
  
  // RENDERING
  function renderItems(items) {
    try {
      if (isDestroyed) return;
      
      // Verify banner exists or try to create it
      if (!bannerExists()) {
        if (retryCount >= CONFIG.maxRetries) {
          log.warn(`Max retry count (${CONFIG.maxRetries}) reached for banner creation`);
          return;
        }
        
        log.info(`Attempting to create banner (attempt ${retryCount + 1})`);
        retryCount++;
        
        createBanner().then(created => {
          if (!created) {
            // Schedule another attempt soon
            setTimeout(() => renderItems(items), 500);
            return;
          }
          
          // Give time for banner to be fully attached to DOM
          setTimeout(() => renderItems(items), 100);
        });
        return;
      }
      
      // Skip content update if minimized
      if (isMinimized) {
        return;
      }
      
      // Track that we've fetched data
      hasFetchedData = true;
      
      // Reset retry count since banner now exists
      retryCount = 0;
      
      // Get scroll content element
      const scrollContent = document.getElementById('ipv4-scroll-content');
      if (!scrollContent) {
        log.warn('Scroll content element not found, retrying banner creation');
        bannerCreated = false;
        setTimeout(() => renderItems(items), 500);
        return;
      }
      
      // Format items for display based on view mode
      const htmlItems = items.map(item => {
        // Safety check to make sure item is valid
        if (!item || typeof item !== 'object') {
          return '';
        }
        
        // Get block - common to both modes
        const blockStr = typeof item.block === 'number' || typeof item.block === 'string' 
                       ? item.block.toString() 
                       : '';
        
        // Get region - common to both modes (make uppercase)
        const regionStr = item.region && typeof item.region === 'string'
                       ? item.region.toUpperCase()
                       : '';
        
        if (currentViewMode === VIEW_MODES.PRIOR_SALES) {
          // For Prior Sales, use pricePerAddress
          const priceStr = getValidPriceString(item, 'pricePerAddress');
          return `<span class="prefix">/${blockStr}</span> <span class="registry">${regionStr}</span> <span class="price">${priceStr}</span>`;
        } else {
          // For New Listings, try multiple possible price fields
          
          // Try these fields in order:
          const priceFieldsToTry = [
            'askingPrice',         // Original guess
            'price',               // Simple "price" field
            'pricePerAddress',     // Same as Prior Sales
            'listPrice',           // Another possibility
            'listingPrice',        // Another possibility
            'perAddress',          // Field name without "price" prefix
            'asking',              // Field name without "price" suffix
            'list',                // Field name without "price" suffix
            'price.perAddress',    // Possible nested structure
            'pricing.perAddress',  // Another possible nested structure
            'pricing.asking'       // Another possible nested structure
          ];
          
          // Try each field until we find a non-empty price
          let priceStr = '';
          for (const field of priceFieldsToTry) {
            priceStr = getValidPriceString(item, field);
            if (priceStr && priceStr !== '$') break;
          }
          
          // If we still don't have a price, log the item for debugging
          if (CONFIG.debug && (!priceStr || priceStr === '$')) {
            console.log('New Listing item missing price:', item);
            // Use a fallback price
            priceStr = '$??';
          }
          
          // Ensure we always have some price to display
          if (!priceStr || priceStr === '$') {
            priceStr = '$??';
          }
          
          return `<span class="prefix">/${blockStr}</span> <span class="registry">${regionStr}</span> <span class="price">${priceStr}</span>`;
        }
      });
      
      // Filter out any empty strings (in case of invalid items)
      const validItems = htmlItems.filter(item => item);
      
      // If we have no valid items to display, show a message
      if (validItems.length === 0) {
        const errorMsg = `<span class="registry">No ${currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales' : 'New Listings'} Data Available</span>`;
        scrollContent.innerHTML = errorMsg.repeat(10);
        return; // Exit early
      }
      
      // Join items with spacing
      const tickerText = validItems.join('&nbsp;&nbsp;&nbsp;&nbsp;') + '&nbsp;&nbsp;&nbsp;&nbsp;';
      
      // Set content with repetition for seamless looping
      scrollContent.innerHTML = tickerText.repeat(10);
      
      // Calculate proper animation duration
      let width = 1000; // Default width fallback
      try {
        // Measure content width
        const tempEl = document.createElement('div');
        tempEl.style.cssText = 'visibility: hidden; position: absolute; white-space: nowrap;';
        tempEl.innerHTML = tickerText;
        document.body.appendChild(tempEl);
        width = tempEl.scrollWidth;
        document.body.removeChild(tempEl);
        
      // If width is too small, use a minimum to ensure animation works
      if (width < 100) width = 1000;
      } catch (e) {
        log.warn('Error measuring width, using default:', e);
      }
      
      // Set up animation
      setupScrollAnimation(scrollContent, width);
      
      // Ensure banner is in viewport after rendering
      ensureBannerInViewport();
    } catch (e) {
      log.error('Error rendering items:', e);
    }
  }
  
  // ANIMATION
  function setupScrollAnimation(element, width) {
    try {
      if (!element || isDestroyed || isMinimized) return;
      
      // Clear any existing animation
      if (animationStyleElement && document.head.contains(animationStyleElement)) {
        try {
          document.head.removeChild(animationStyleElement);
        } catch (e) {
          // Style may be gone already
        }
      }
      
      // Create unique animation name
      const uniqueId = Math.floor(Math.random() * 1000000);
      const animationName = `scrollBanner_${uniqueId}`;
      
      // Calculate duration based on width
      const speed = CONFIG.animationSpeed * 0.8; // Slightly slower for better readability
      const duration = Math.max(width / speed, 10);
      
      // Create new animation style
      animationStyleElement = document.createElement('style');
      animationStyleElement.textContent = `
        @keyframes ${animationName} {
          0% { transform: translateX(0); }
          100% { transform: translateX(-${width}px); }
        }
        #ipv4-scroll-content {
          animation: ${animationName} ${duration}s linear infinite;
        }
        #ipv4-scroll-content:hover {
          animation-play-state: paused;
        }
      `;
      
      document.head.appendChild(animationStyleElement);
    } catch (e) {
      log.warn('Error creating animation, using fallback:', e);
      
      // Simple fallback animation as last resort
      try {
        element.style.transition = 'transform 60s linear';
        element.style.transform = 'translateX(0)';
        // Force reflow
        void element.offsetWidth;
        element.style.transform = 'translateX(-3000px)';
      } catch (e2) {
        log.warn('Animation fallback also failed:', e2);
      }
    }
  }
  
  // DATA FETCHING
  function fetchData() {
    if (isDestroyed) return;
    
    // Create banner if not already created
    if (!bannerExists()) {
      if (retryCount >= CONFIG.maxRetries) {
        log.warn(`Max retry count (${CONFIG.maxRetries}) reached for banner creation`);
        return;
      }
      
      log.info(`Attempting to create banner (attempt ${retryCount + 1})`);
      retryCount++;
      
      createBanner().then(created => {
        if (!created) {
          // Schedule another attempt soon
          setTimeout(fetchData, 500);
          return;
        }
      });
      return;
    }
    
    // Skip data fetching if minimized
    if (isMinimized) {
      return;
    }
    
    // Try to use chrome APIs if available
    if (isChromeAvailable()) {
      log.info('Fetching data via background script');
      fetchViaBackground();
    } else {
      log.info('Chrome not available, using fallback data');
      renderItems(fallbackData[currentViewMode]);
    }
  }
  
  // FETCH VIA BACKGROUND SCRIPT
  function fetchViaBackground() {
    try {
      chrome.runtime.sendMessage({
        type: 'fetchData',
        url: getCurrentApiEndpoint(),
        body: JSON.stringify(getRequestBody())
      }, response => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          log.warn('Runtime error:', chrome.runtime.lastError);
          renderItems(fallbackData[currentViewMode]);
          return;
        }
        
        // Process successful response
        if (response && response.success && response.data) {
          try {
            const data = JSON.parse(response.data);
            if (data && Array.isArray(data.items) && data.items.length > 0) {
              renderItems(data.items);
              return;
            }
          } catch (e) {
            log.warn('Error parsing API response:', e);
          }
        } else if (response && response.error) {
          log.warn('API error:', response.error);
        }
        
        // Default to fallback if anything fails
        log.info('Using fallback data due to API or parsing issues');
        renderItems(fallbackData[currentViewMode]);
      });
    } catch (e) {
      log.warn('Error sending message to background script:', e);
      renderItems(fallbackData[currentViewMode]);
    }
  }
  
  // SETUP MUTATION OBSERVER
  function setupMutationObserver() {
    if (!CONFIG.mutationObserverEnabled || isDestroyed || observer) return;
    
    try {
      // Create observer to detect if the banner is removed from the DOM
      observer = new MutationObserver(mutations => {
        if (isDestroyed) return;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const banner = document.getElementById('ipv4-banner');
            
            // If banner existed but now doesn't, recreate it
            if (bannerCreated && !banner) {
              // Avoid recreating too frequently
              const now = Date.now();
              if (recreationCount >= CONFIG.recreationMaxCount) {
                log.warn(`Banner was removed ${recreationCount} times, giving up recreation`);
                return;
              }
              
              if (now - lastRecreationTime < CONFIG.recreationDelay) {
                // If last recreation was too recent, schedule for later
                setTimeout(() => {
                  if (!bannerExists() && !isDestroyed) {
                    log.warn(`Banner was removed from DOM, recreating (attempt ${recreationCount + 1})`);
                    recreationCount++;
                    lastRecreationTime = Date.now();
                    createBanner();
                    fetchData();
                  }
                }, CONFIG.recreationDelay);
              } else {
                // Recreate now
                log.warn(`Banner was removed from DOM, recreating (attempt ${recreationCount + 1})`);
                recreationCount++;
                lastRecreationTime = now;
                createBanner();
                fetchData();
              }
              return;
            }
          }
        }
      });
      
      // Observe document.body for child removals
      observer.observe(document.body, { 
        childList: true,
        subtree: false
      });
    } catch (e) {
      log.warn('Error setting up MutationObserver:', e);
    }
  }
  
  // INITIALIZATION
  async function initialize() {
    log.info('Initializing banner');
    
    // First acquire initialization lock to prevent multiple instances
    const lockAcquired = await acquireInitLock();
    if (!lockAcquired) {
      log.warn('Could not acquire initialization lock, aborting');
      return;
    }
    
    // If banner already exists, don't create another
    if (bannerExists()) {
      log.warn('Banner already exists, aborting initialization');
      releaseInitLock();
      return;
    }
    
    try {
      // Store initial viewport width for resize detection
      initialViewportWidth = getViewportWidth();
      
      // Load settings to ensure they're ready
      await getAllSettings();
      
      // Load saved view mode
      currentViewMode = await getSavedViewMode();
      
      // Create banner
      await createBanner();
      
      // Setup observer to detect if banner is removed
      setTimeout(setupMutationObserver, 1000);
      
      // Fetch initial data after a short delay to ensure banner is ready
      setTimeout(fetchData, 100);
      
      // Set up refresh interval
      fetchIntervalId = setInterval(fetchData, CONFIG.refreshInterval);
      
      // Apply left edge gap checking after a slight delay to ensure banner is fully rendered
      setTimeout(() => {
        const banner = document.getElementById('ipv4-banner');
        if (banner) {
          enforceLeftEdgeGap(banner);
        }
      }, 500);
      
      // Set up safe cleanup with various events
      addCleanupListeners();
    } catch (e) {
      log.error('Error during initialization:', e);
      releaseInitLock();
    }
  }
  
  // ADD CLEANUP LISTENERS
  function addCleanupListeners() {
    try {
      // Modern event for page navigation
      window.addEventListener('pagehide', function() {
        cleanup(false); // false = don't remove elements, just clean resources
      });
      
      // Alternative events that might work in different browsers
      window.addEventListener('beforeunload', function() {
        cleanup(false); // false = don't remove elements, just clean resources
      });
      
      // DON'T clean up on visibilitychange - this was causing the disappearing issue
      // Just do nothing when tab visibility changes
    } catch (e) {
      log.warn('Error setting cleanup listeners:', e);
    }
  }
  
  // CLEANUP - with optional full cleanup flag
  function cleanup(fullCleanup) {
    log.info('Cleaning up resources');
    
    if (isDestroyed) return;
    
    // Only set destroyed if doing full cleanup
    if (fullCleanup) {
      isDestroyed = true;
    }
    
    // Clear interval
    if (fetchIntervalId) {
      clearInterval(fetchIntervalId);
      fetchIntervalId = null;
    }
    
    // Remove style element
    if (animationStyleElement && document.head.contains(animationStyleElement)) {
      try {
        document.head.removeChild(animationStyleElement);
      } catch (e) {
        // Already removed
      }
    }
    
    // Only remove the banner if doing full cleanup
    if (fullCleanup) {
      try {
        const banner = document.getElementById('ipv4-banner');
        if (banner && banner.parentNode) {
          banner.parentNode.removeChild(banner);
        }
      } catch (e) {
        log.warn('Error removing banner:', e);
      }
    }
    
    // Remove resize event listener
    window.removeEventListener('resize', handleWindowResize);
    
    // Stop observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    // Release the initialization lock
    releaseInitLock();
  }
  
  // START THE EXTENSION
  // Wait for document to be fully loaded
  if (document.readyState === 'complete') {
    initialize();
  } else {
    window.addEventListener('load', initialize);
  }
})();