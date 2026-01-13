// content.js (v33.3 - Fix for getValidPriceString and other regressions)
(async function() { 
  console.log('[IPv4 Banner] content.js script executing (v33.3)...');

  const CONFIG = {
    refreshInterval: 60000,
    priorSalesApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/priorSales',
    newListingsApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/currentListing',
    animationBaseSpeedFactor: 50, 
    debug: true,
    maxRetries: 3,
    recreationDelay: 5000,
    recreationMaxCount: 3,
    mutationObserverEnabled: true,
    storageKey: 'ipv4BannerPosition',
    minimizedStateKey: 'ipv4BannerMinimized',
    widthKey: 'ipv4BannerWidth',
    widthPercentKey: 'ipv4BannerWidthPercent',
    maxWidthFlag: 'ipv4BannerIsMaxWidth',
    leftPosKey: 'ipv4BannerLeftPos',
    viewModeKey: 'ipv4BannerViewMode',
    defaultWidth: 450,
    minWidth: 250,
    maxWidth: 2000,
    autoMinimizeWidth: 250,
    minIconSize: 16,
    edgeGap: 20,
    minimizedSpacing: 2, 
    normalSpacing: 6, 
    bannerHeight: 26,
    minimizeDelay: 300,
    leftEdgeThreshold: 100,
    windowResizeThreshold: 200,
    initializationLock: 'ipv4BannerInitLock',
    initLockTimeout: 30000,
    maxWidthTolerance: 10,
    initialDragExpandWidth: 250,
    minimizeAnimationDuration: 250,
    overflowCheckExtraPadding: 40,
    excludedDomainsStorageKey: 'excludedDomainsText',
    blockSizeFilterStorageKey: 'selectedBlockSize',
    rirFilterStorageKey: 'selectedRir',
    animationSpeedSettingKey: 'animationSpeedSetting',
    // Notify Me keys
    notifyMeEnabledKey: 'notifyMeEnabled',
    notifyMeSoundKey: 'notifyMeSound',
    notifyMeSoundTypeKey: 'notifyMeSoundType',
    notifyMeRulesKey: 'notifyMeRules',
    notifyMeDismissedKey: 'notifyMeDismissed'
  };
  const log = {
    info: function(msg, ...args) { if (CONFIG.debug) console.log('[IPv4 Banner]', msg, ...args); },
    warn: function(msg, ...args) { console.warn('[IPv4 Banner]', msg, ...args); },
    error: function(msg, ...args) { console.error('[IPv4 Banner]', msg, ...args); }
  };
  log.info('CONFIG and log object defined.');

  const speedMultipliers = [0.25, 0.5, 1.0, 1.5, 2.0];

  let excluded = false;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    log.info('Checking for excluded domains...');
    try {
      const items = await new Promise((resolve, reject) => {
        chrome.storage.local.get([CONFIG.excludedDomainsStorageKey], result => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
      const excludedDomainsText = items[CONFIG.excludedDomainsStorageKey] || '';
      if (excludedDomainsText.trim() !== '') {
        const excludedDomains = excludedDomainsText.split('\n').map(d => d.trim().toLowerCase()).filter(d => d.length > 0);
        const currentHostname = window.location.hostname.toLowerCase();
        for (const domain of excludedDomains) {
          if (currentHostname === domain || currentHostname.endsWith('.' + domain)) {
            log.info(`MATCH! Current domain (${currentHostname}) is excluded by rule: ${domain}. Banner will not load.`);
            excluded = true;
            break;
          }
        }
      }
      if (!excluded) { log.info('Domain is NOT excluded.'); }
    } catch (error) {
      log.warn('[IPv4 Banner] Error checking excluded domains:', error.message);
    }
  } else {
    log.info('[IPv4 Banner] Chrome storage API not available for excluded domain check.');
  }
  if (excluded) {
    log.info('[IPv4 Banner] FINAL DECISION: Domain excluded. Exiting script.');
    return;
  }

  if (!document || !document.body || document.documentElement.nodeName !== 'HTML' || window !== window.top || window.location.pathname.match(/\.(ico|png|jpg|jpeg|gif|css|js|json|svg|xml|pdf)$/i)) {
    log.info('[IPv4 Banner] Early exit: Not a suitable page or frame.');
    return;
  }
  log.info('[IPv4 Banner] Early exit check for page type passed.');


  const VIEW_MODES = { PRIOR_SALES: 'priorSales', NEW_LISTINGS: 'newListings' };
  let bannerCreated = false; let animationStyleElement = null; let fetchIntervalId = null; let isDestroyed = false; let retryCount = 0; let recreationCount = 0; let lastRecreationTime = 0; let observer = null; let isMinimized = false; let isDragExpanding = false; let hasFetchedData = false; let isDuringToggleTransition = false; let preMinimizeWidth = null; let preMinimizeWidthPercent = null; let isAtMaxWidth = false; let initialViewportWidth = 0; let lastPositioningTime = 0; let currentViewMode = VIEW_MODES.PRIOR_SALES;
  let dragState = { isDragging: false, startY: 0, startX: 0, startTop: 0, startLeft: 0, startRight: 0, isHorizontalDrag: false, isVerticalDrag: false, startWidth: 0, isUsingTop: true, isUsingLeft: false, lastDragTime: 0, resizingDirection: null, initialClickX: 0, dragDistance: 0, lastWidth: 0, dragStartViewportX: 0, wasNearLeftEdge: false, draggedRightward: false, alwaysUseRight: true, ignoreLeftPositioning: false, expandMinX: 0, initialExpandWidth: CONFIG.initialDragExpandWidth, };
  let resizeTimeout = null; let settingsLoaded = false; let currentSettings = {};
  let isFetchingData = false;
  let isGearSubmenuOpen = false;
  let notifyBannerVisible = false;
  let dismissedNotifications = {}; // Maps rule IDs to sets of dismissed auction IDs
  let notificationIntervalId = null;

  const fallbackData = { [VIEW_MODES.PRIOR_SALES]: [ { block: 19, region: "arin", pricePerAddress: "$29" }, { block: 24, region: "arin", pricePerAddress: "$32.5" },{ block: 19, region: "ripe", pricePerAddress: "$30" }, { block: 22, region: "ripe", pricePerAddress: "$31.9" },{ block: 22, region: "lacnic", pricePerAddress: "$34.5" }, { block: 22, region: "arin", pricePerAddress: "$34" },{ block: 24, region: "arin", pricePerAddress: "$36" } ], [VIEW_MODES.NEW_LISTINGS]: [ { block: 24, region: "arin", askingPrice: "$35" }, { block: 22, region: "ripe", askingPrice: "$31.5" }, { block: 23, region: "apnic", askingPrice: "$32" }, { block: 21, region: "arin", askingPrice: "$30" }, { block: 24, region: "lacnic", askingPrice: "$33.5" }, { block: 23, region: "arin", askingPrice: "$31" }, { block: 22, region: "arin", askingPrice: "$29.5" } ] };

  // --- HELPER FUNCTIONS ---
  function getAuctionId(item) {
    // Try multiple possible field names for auction ID
    const possibleFields = ['auctionId', 'auction_id', 'id', 'listingId', 'listing_id', '_id'];
    for (const field of possibleFields) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
        return item[field].toString();
      }
    }
    return null;
  }
  function isChromeAvailable() { try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage; } catch (e) { return false; } }
  async function getAllSettings() { return new Promise(resolve => { if (!isChromeAvailable()) { resolve(currentSettings); return; } chrome.storage.local.get(null, items => { if (chrome.runtime.lastError) { log.warn('Error reading all settings:', chrome.runtime.lastError.message); resolve(currentSettings); } else { currentSettings = items || {}; settingsLoaded = true; resolve(currentSettings); } }); }); }
  async function getSetting(key, defaultValue) { if (settingsLoaded && key in currentSettings) return currentSettings[key]; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(defaultValue); return; } chrome.storage.local.get([key], result => { if (chrome.runtime.lastError) { log.warn(`Error reading setting ${key}:`, chrome.runtime.lastError.message); resolve(defaultValue); } else { const value = result[key]; currentSettings[key] = value; resolve(value !== undefined ? value : defaultValue); } }); }); }
  async function saveSetting(key, value) { currentSettings[key] = value; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(); return; } chrome.storage.local.set({ [key]: value }, () => { if (chrome.runtime.lastError) log.warn(`Error saving setting ${key}:`, chrome.runtime.lastError.message); resolve(); }); }); }
  async function removeSetting(key) { delete currentSettings[key]; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(); return; } chrome.storage.local.remove(key, () => { if (chrome.runtime.lastError) log.warn(`Error removing setting ${key}:`, chrome.runtime.lastError.message); resolve(); }); }); }
  async function acquireInitLock() { return new Promise(resolve => { if (!isChromeAvailable()) { log.info("Chrome API not available, skipping lock mechanism."); resolve(true); return; } chrome.storage.local.get([CONFIG.initializationLock], result => { if (chrome.runtime.lastError) { log.error('CRITICAL (GET_LOCK_FAIL): Error GETTING lock state:', chrome.runtime.lastError.message); resolve(false); return; } const now = Date.now(); const lockData = result[CONFIG.initializationLock]; if (lockData && (now - lockData) < CONFIG.initLockTimeout) { const expiresIn = Math.round((CONFIG.initLockTimeout - (now - lockData)) / 1000); log.info(`Lock held, expires in approx. ${expiresIn}s. Retrying.`); setTimeout(() => { acquireInitLock().then(acquired => resolve(acquired)); }, 750); return; } chrome.storage.local.set({ [CONFIG.initializationLock]: now }, () => { if (chrome.runtime.lastError) { log.error('CRITICAL (SET_LOCK_FAIL): Failed to SET new lock:', chrome.runtime.lastError.message); resolve(false); } else { log.info('Lock acquired at', new Date(now).toLocaleTimeString()); resolve(true); } }); }); }); }
  function releaseInitLock() { if (!isChromeAvailable()) return; log.info("Releasing init lock."); chrome.storage.local.remove(CONFIG.initializationLock, () => { if (chrome.runtime.lastError) log.warn('Error releasing lock:', chrome.runtime.lastError.message); else log.info('Lock released.'); }); }
  async function getSavedViewMode() { try { const mode = await getSetting(CONFIG.viewModeKey); if (mode === VIEW_MODES.PRIOR_SALES || mode === VIEW_MODES.NEW_LISTINGS) return mode; } catch (e) { log.warn('Error reading view mode:', e); } return VIEW_MODES.PRIOR_SALES; }
  async function saveViewMode(mode) { try { await saveSetting(CONFIG.viewModeKey, mode); } catch (e) { log.warn('Error saving view mode:', e); } }
  async function toggleViewMode() {
    if (isFetchingData) { log.info("View mode toggle ignored, fetch in progress."); return; }
    currentViewMode = currentViewMode === VIEW_MODES.PRIOR_SALES ? VIEW_MODES.NEW_LISTINGS : VIEW_MODES.PRIOR_SALES;
    await saveViewMode(currentViewMode);
    const titleEl = document.getElementById('ipv4-title');
    if (titleEl) {
      titleEl.innerHTML = currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales:' : 'New Listings:';
      titleEl.title = currentViewMode === VIEW_MODES.PRIOR_SALES ? "Click to switch to New Listings" : "Click to switch to Prior Sales";
    }
    log.info("View mode toggled, fetching data for:", currentViewMode); hasFetchedData = false; fetchData();
  }
  async function getSavedPosition() { try { const savedPos = await getSetting(CONFIG.storageKey); if (savedPos) { const vh = getViewportHeight(); if (savedPos.top) { const tv = parseInt(savedPos.top); if (!isNaN(tv) && tv > vh - CONFIG.bannerHeight) return { top: Math.max(0, vh - CONFIG.bannerHeight - 50) + 'px' }; } if (savedPos.bottom) { const bv = parseInt(savedPos.bottom); if (!isNaN(bv) && bv > vh - CONFIG.bannerHeight) return { bottom: Math.max(0, vh - CONFIG.bannerHeight - 50) + 'px' }; } return savedPos; } } catch (e) { log.warn('Error reading pos:', e); } return { top: '10px' }; }
  async function savePosition(pos) { try { const vh = getViewportHeight(); const vp = {...pos}; if (vp.top) { const tv = parseInt(vp.top); if (!isNaN(tv)) { if (tv > vh - CONFIG.bannerHeight) vp.top = Math.max(0, vh - CONFIG.bannerHeight - 10) + 'px'; if (tv < 0) vp.top = '0px'; }} if (vp.bottom) { const bv = parseInt(vp.bottom); if (!isNaN(bv)) { if (bv > vh - CONFIG.bannerHeight) vp.bottom = Math.max(0, vh - CONFIG.bannerHeight - 10) + 'px'; if (bv < 0) vp.bottom = '0px'; }} await saveSetting(CONFIG.storageKey, vp); } catch (e) { log.warn('Error saving pos:', e); } }
  async function clearLeftPosition() { try { await removeSetting(CONFIG.leftPosKey); } catch (e) { log.warn('Error clear left pos:', e); } }
  async function getSavedLeftPosition() { if (dragState.alwaysUseRight) return null; try { const sp = await getSetting(CONFIG.leftPosKey); if (sp !== null && sp !== undefined) { const p = parseInt(sp); if (!isNaN(p) && p >= 0) return p; }} catch (e) { log.warn('Error read left pos:', e); } return null; }
  async function saveLeftPosition(pos) { if (dragState.alwaysUseRight) { await clearLeftPosition(); return; } try { if (pos === null || pos < 0) await clearLeftPosition(); else await saveSetting(CONFIG.leftPosKey, pos.toString()); } catch (e) { log.warn('Error save left pos:', e); }}
  function calculateWidthPercentage(pw) { const vw = getViewportWidth(); if (vw <= 0) return 50; return Math.min(100, Math.max(1, (pw / vw) * 100)); }
  function isWidthAtMax(w) { return Math.abs(w - calculateMaxBannerWidth()) <= CONFIG.maxWidthTolerance; }
  async function getSavedWidth() { try { if (await getSetting(CONFIG.maxWidthFlag, false)) { isAtMaxWidth = true; return calculateMaxBannerWidth(); } const wp = await getSetting(CONFIG.widthPercentKey); if (wp !== null && wp !== undefined) { const p = parseFloat(wp); if (!isNaN(p) && p > 0 && p <= 100) { const pxw = Math.round((p / 100) * getViewportWidth()); return Math.min(calculateMaxBannerWidth(), Math.max(CONFIG.minWidth, pxw)); }} const sw = await getSetting(CONFIG.widthKey); if (sw !== null && sw !== undefined) { const w = parseInt(sw); if (!isNaN(w) && w >= CONFIG.minWidth && w <= CONFIG.maxWidth) return w; }} catch (e) { log.warn('Error read width:', e); } return calculateMaxBannerWidth(); }
  async function saveWidth(w) { try { if (w >= CONFIG.minWidth) { await saveSetting(CONFIG.widthKey, w.toString()); const wp = calculateWidthPercentage(w); await saveSetting(CONFIG.widthPercentKey, wp.toString()); const imw = isWidthAtMax(w); isAtMaxWidth = imw; await saveSetting(CONFIG.maxWidthFlag, imw); preMinimizeWidth = w; preMinimizeWidthPercent = wp; }} catch (e) { log.warn('Error save width:', e); } }
  function getViewportWidth() { return document.documentElement.clientWidth; }
  function getViewportHeight() { return document.documentElement.clientHeight; }
  function getScrollbarWidth() { return window.innerWidth - document.documentElement.clientWidth; }
  async function getSavedMinimizedState() { try { const s = await getSetting(CONFIG.minimizedStateKey); if (s !== null && s !== undefined) return s === 'true' || s === true; } catch (e) { log.warn('Error read minimized state:', e); } return false; }
  async function saveMinimizedState(s) { try { await saveSetting(CONFIG.minimizedStateKey, s.toString()); } catch (e) { log.warn('Error save minimized state:', e); } }
  function getTodayDate() { const t = new Date(); const y = t.getFullYear(); let m = t.getMonth() + 1; let d = t.getDate(); if (m < 10) m = '0' + m; if (d < 10) d = '0' + d; return `${y}-${m}-${d}`; }
  function getTomorrowDate() { const t = new Date(); const tm = new Date(t); tm.setDate(t.getDate() + 1); const y = tm.getFullYear(); let m = tm.getMonth() + 1; let d = tm.getDate(); if (m < 10) m = '0' + m; if (d < 10) d = '0' + d; return `${y}-${m}-${d}`; }
  function getStartOfCurrentYearDate() { return `${new Date().getFullYear()}-01-01`; }
  async function getRequestBody() { log.info("Constructing request body for mode:", currentViewMode); let selectedBlockSize = null; let selectedRir = null; if (isChromeAvailable()) { try { const items = await new Promise((resolve, reject) => { chrome.storage.local.get([CONFIG.blockSizeFilterStorageKey, CONFIG.rirFilterStorageKey], result => { if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve(result); }); }); selectedBlockSize = items[CONFIG.blockSizeFilterStorageKey]; selectedRir = items[CONFIG.rirFilterStorageKey]; log.info("Retrieved from storage:", {selectedBlockSize, selectedRir}); } catch (error) { log.warn("Error getting filters from storage:", error.message); } } let blockFilter = [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8]; if (selectedBlockSize && selectedBlockSize !== "") { const size = parseInt(selectedBlockSize); if (!isNaN(size) && size >= 8 && size <= 24) { blockFilter = [size]; log.info("Applying block size filter:", size); } else { log.warn("Invalid selectedBlockSize, using default block filter:", selectedBlockSize); } } else { log.info("No specific block size selected or 'All Sizes', using default block filter."); } let rirFilter = ["arin", "apnic", "ripe", "afrinic", "lacnic"]; if (selectedRir && selectedRir !== "") { rirFilter = [selectedRir.toLowerCase()]; log.info("Applying RIR filter:", selectedRir); } else { log.info("No specific RIR selected or 'All RIRs', using default RIR filter."); } if (currentViewMode === VIEW_MODES.PRIOR_SALES) { return { filter: { block: blockFilter, region: rirFilter, period: { from: getStartOfCurrentYearDate(), to: getTomorrowDate() }}, sort: { property: "date", direction: "desc" }, offset: 0, limit: 25 }; } else { return { filter: { block: blockFilter, region: rirFilter}, sort: { property: "date", direction: "desc" }, offset: 0, limit: 25 }; } }
  function getCurrentApiEndpoint() { return currentViewMode === VIEW_MODES.PRIOR_SALES ? CONFIG.priorSalesApi : CONFIG.newListingsApi; }
  function calculateMaxBannerWidth() { return Math.max(CONFIG.minWidth, getViewportWidth() - (2 * CONFIG.edgeGap)); }
  
  // --- Element Creation Functions ---
  function _createDragHandleElement() {
    const dh = document.createElement('div');
    dh.id = 'ipv4-drag-handle';
    for (let i=0;i<3;i++) {
      const d=document.createElement('div');
      dh.appendChild(d);
    }
    dh.title = "Drag to move • Drag left/right to resize • Double-click to minimize/expand";
    dh.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const banner = document.getElementById('ipv4-banner');
        if (banner) {
            toggleMinimized(banner);
        }
    });
    return dh;
  }
  function _createLogoLinkElement() { const ll = document.createElement('a'); ll.id = 'ipv4-logo-link'; ll.href = 'https://auctions.ipv4.global'; ll.target = '_blank'; return ll;}
  function _createTitleElement(initialViewMode) { const t = document.createElement('span'); t.id = 'ipv4-title'; t.classList.add('banner-title-style'); t.title = initialViewMode === VIEW_MODES.PRIOR_SALES ? "Click to switch to New Listings" : "Click to switch to Prior Sales"; t.innerHTML = initialViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales:' : 'New Listings:'; const vp = 4; t.style.lineHeight = `${CONFIG.bannerHeight - vp}px`; t.addEventListener('click', (e) => {e.preventDefault();e.stopPropagation(); if(!isDuringToggleTransition && !isDragExpanding) toggleViewMode();}); return t;}
  function _createScrollContainerElement() { const sc = document.createElement('div'); sc.id = 'ipv4-scroll-container'; const scc = document.createElement('div'); scc.id = 'ipv4-scroll-content'; sc.appendChild(scc); return sc;}

  function _createGearButtonElement() {
    const gearButton = document.createElement('div');
    gearButton.id = 'ipv4-gear-button';
    gearButton.innerHTML = '<span class="hamburger-icon"></span>';
    gearButton.title = 'Menu';
    gearButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleGearSubmenu();
    });
    return gearButton;
  }

  function _ensureGearSubmenuElement() {
    let submenu = document.getElementById('ipv4-gear-submenu');
    if (!submenu) {
      submenu = document.createElement('div');
      submenu.id = 'ipv4-gear-submenu';
      submenu.style.display = 'none';
      document.body.appendChild(submenu);
    }
    return submenu;
  }

  function positionGearSubmenu() {
    const submenu = _ensureGearSubmenuElement();
    const gearButton = document.getElementById('ipv4-gear-button');
    if (!gearButton) return;

    const gearRect = gearButton.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();

    // Prefer below the button, but flip above if needed
    let top = gearRect.bottom + 4;
    if (top + submenuRect.height > window.innerHeight - 4) {
      top = Math.max(4, gearRect.top - submenuRect.height - 4);
    }

    // Align right edge of menu with right edge of button
    let left = gearRect.right - submenuRect.width;
    if (left < 4) left = 4;

    submenu.style.top = `${top}px`;
    submenu.style.left = `${left}px`;
    submenu.style.right = 'auto';
    submenu.style.bottom = 'auto';
  }

  function handleClickOutsideGearSubmenu(e) {
    const submenu = document.getElementById('ipv4-gear-submenu');
    const gearButton = document.getElementById('ipv4-gear-button');
    if (!submenu || !gearButton) return;

    if (!submenu.contains(e.target) && !gearButton.contains(e.target)) {
      submenu.style.display = 'none';
      isGearSubmenuOpen = false;
      document.removeEventListener('click', handleClickOutsideGearSubmenu, true);
    }
  }

  // ENSURED DEFINITIONS FOR createTextLogo and updateLogo
  function createTextLogo() {
    const logoText = document.createElement('span');
    logoText.textContent = 'IPv4.Global';
    logoText.style.cssText = `font-weight:bold;color:#13b5ea;font-size:12px;white-space:nowrap;line-height:${CONFIG.bannerHeight - 8}px;vertical-align:middle;`;
    return logoText;
  }

  function updateLogo(minimizedState) {
    const logoLink = document.getElementById('ipv4-logo-link');
    if (!logoLink) {
        log.warn("updateLogo: ipv4-logo-link not found");
        return;
    }
    logoLink.innerHTML = ''; 
    if (isChromeAvailable()) {
        try {
            const logo = document.createElement('img');
            logo.id = 'ipv4-logo';
            logo.alt = 'IPv4.Global Logo';
            if (minimizedState) {
                logo.src = chrome.runtime.getURL('assets/icon-48x48.png');
                logo.style.height = `${CONFIG.minIconSize}px`;
                logo.style.width = `${CONFIG.minIconSize}px`;
            } else {
                logo.src = chrome.runtime.getURL('assets/logo.png');
                logo.style.height = '16px';
                logo.style.width = 'auto';
            }
            logo.onerror = () => {
                log.warn("Image load error for:", logo.src, "Falling back to text logo.");
                logoLink.innerHTML = ''; 
                logoLink.appendChild(createTextLogo());
            };
            logoLink.appendChild(logo);
        } catch (e) {
            log.warn('Failed to create image logo element:', e);
            if (logoLink) logoLink.appendChild(createTextLogo()); 
        }
    } else {
        log.info("Chrome API not available for logo, using text logo.");
        if (logoLink) logoLink.appendChild(createTextLogo()); 
    }
  }
  
  // ENSURED DEFINITION FOR getValidPriceString (used in renderItems)
  function getValidPriceString(item, priceField) {
    if(!item) return '$??';
    if(priceField.includes('.')){
        const[mainField, subField] = priceField.split('.');
        if(item[mainField] && typeof item[mainField][subField] !== 'undefined'){
            const price = item[mainField][subField].toString();
            return price.startsWith('$') ? price : '$'+price;
        }
    }
    if(typeof item[priceField] !== 'undefined'){
        const price = item[priceField];
        if (price === null || price === undefined || price === '') return ''; // Handle null or empty string for price
        const priceStr = price.toString();
        return priceStr.startsWith('$') ? priceStr : '$'+priceStr;
    }
    return ''; // Return empty if price field or nested price field is not found
  }

  // --- NOTIFICATION FUNCTIONS ---
  function parsePrice(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return null;
    const cleaned = priceStr.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  async function loadDismissedNotifications() {
    try {
      const data = await getSetting(CONFIG.notifyMeDismissedKey, {});
      dismissedNotifications = data || {};
      log.info('Loaded dismissed notifications:', dismissedNotifications);
    } catch (e) {
      log.warn('Error loading dismissed notifications:', e);
      dismissedNotifications = {};
    }
  }

  async function saveDismissedNotifications() {
    try {
      await saveSetting(CONFIG.notifyMeDismissedKey, dismissedNotifications);
    } catch (e) {
      log.warn('Error saving dismissed notifications:', e);
    }
  }

  function isNotificationDismissed(ruleId, auctionId) {
    if (!dismissedNotifications[ruleId]) return false;
    return dismissedNotifications[ruleId].includes(auctionId);
  }

  function dismissNotification(ruleId, auctionId) {
    if (!dismissedNotifications[ruleId]) {
      dismissedNotifications[ruleId] = [];
    }
    if (!dismissedNotifications[ruleId].includes(auctionId)) {
      dismissedNotifications[ruleId].push(auctionId);
      saveDismissedNotifications();
    }
  }

  function itemMatchesRule(item, rule) {
    // Check block size
    if (rule.blockSize && rule.blockSize !== '') {
      const ruleBlockSize = parseInt(rule.blockSize);
      const itemBlockSize = parseInt(item.block);
      if (ruleBlockSize !== itemBlockSize) return false;
    }

    // Check RIR
    if (rule.rir && rule.rir !== '') {
      const itemRir = (item.region || '').toLowerCase();
      if (rule.rir.toLowerCase() !== itemRir) return false;
    }

    // Get item price
    const priceFieldsToTry = ['askingPrice', 'price', 'pricePerAddress', 'listPrice', 'listingPrice', 'perAddress'];
    let priceStr = '';
    for (const field of priceFieldsToTry) {
      priceStr = getValidPriceString(item, field);
      if (priceStr && priceStr !== '$') break;
    }
    const itemPrice = parsePrice(priceStr);

    // Check max price
    if (rule.maxPrice && rule.maxPrice !== '') {
      const maxPrice = parseFloat(rule.maxPrice);
      if (itemPrice !== null && !isNaN(maxPrice) && itemPrice > maxPrice) return false;
    }

    // Check min price
    if (rule.minPrice && rule.minPrice !== '') {
      const minPrice = parseFloat(rule.minPrice);
      if (itemPrice !== null && !isNaN(minPrice) && itemPrice < minPrice) return false;
    }

    return true;
  }

  function createNotifyBanner() {
    let banner = document.getElementById('ipv4-notify-banner');
    if (banner) return banner;

    const tickerBanner = document.getElementById('ipv4-banner');
    if (!tickerBanner) return null;

    banner = document.createElement('div');
    banner.id = 'ipv4-notify-banner';
    banner.innerHTML = `
      <div id="ipv4-notify-header">
        <span id="ipv4-notify-title">New Listing Match!</span>
      </div>
      <div id="ipv4-notify-content">
        <div id="ipv4-notify-items"></div>
        <div id="ipv4-notify-count"></div>
      </div>
    `;
    document.body.appendChild(banner);

    return banner;
  }

  function positionNotifyBanner() {
    const notifyBanner = document.getElementById('ipv4-notify-banner');
    const tickerBanner = document.getElementById('ipv4-banner');
    if (!notifyBanner || !tickerBanner) return;

    const tickerRect = tickerBanner.getBoundingClientRect();
    const tickerStyle = window.getComputedStyle(tickerBanner);
    const notifyHeight = notifyBanner.offsetHeight || 150;
    const viewportHeight = window.innerHeight;

    // Match ticker's right position
    notifyBanner.style.right = tickerStyle.right;

    // Check space above and below
    const spaceAbove = tickerRect.top;
    const spaceBelow = viewportHeight - tickerRect.bottom;

    // Position based on available space
    if (spaceAbove >= notifyHeight + 10) {
      // Enough room above - position above
      notifyBanner.style.bottom = (viewportHeight - tickerRect.top + 8) + 'px';
      notifyBanner.style.top = 'auto';
    } else if (spaceBelow >= notifyHeight + 10) {
      // Not enough room above but enough below - position below
      notifyBanner.style.top = (tickerRect.bottom + 8) + 'px';
      notifyBanner.style.bottom = 'auto';
    } else {
      // Not enough room either way - position above anyway
      notifyBanner.style.bottom = (viewportHeight - tickerRect.top + 8) + 'px';
      notifyBanner.style.top = 'auto';
    }
  }

  function removeNotifyItem(itemEl, ruleId, auctionId) {
    // Dismiss this notification so it doesn't appear again
    if (ruleId && auctionId) {
      dismissNotification(ruleId, auctionId);
    }
    // Remove the item from DOM
    itemEl.remove();
    // Check if banner should be hidden (no items left)
    const banner = document.getElementById('ipv4-notify-banner');
    const itemsContainer = banner ? banner.querySelector('#ipv4-notify-items') : null;
    if (itemsContainer && itemsContainer.children.length === 0) {
      hideNotifyBanner();
    }
  }

  function showNotifyBanner(matchingItems, matchedRules) {
    const banner = createNotifyBanner();
    if (!banner) return;

    const itemsContainer = banner.querySelector('#ipv4-notify-items');
    const countEl = banner.querySelector('#ipv4-notify-count');

    if (!itemsContainer) return;

    itemsContainer.innerHTML = '';

    // Show up to 3 items
    const displayItems = matchingItems.slice(0, 3);
    displayItems.forEach(({ item, ruleId, auctionId }) => {
      const priceFieldsToTry = ['askingPrice', 'price', 'pricePerAddress', 'listPrice'];
      let priceStr = '';
      for (const field of priceFieldsToTry) {
        priceStr = getValidPriceString(item, field);
        if (priceStr && priceStr !== '$') break;
      }

      const itemEl = document.createElement('div');
      itemEl.className = 'ipv4-notify-item';
      itemEl.innerHTML = `
        <div class="ipv4-notify-item-info">
          <span>/${item.block || '?'}</span>
          <span>${(item.region || '').toUpperCase()}</span>
          <span>${priceStr || '$?'}</span>
        </div>
        <div class="ipv4-notify-item-actions">
          ${auctionId ? `<a href="https://auctions.ipv4.global/auction/${auctionId}" target="_blank" class="ipv4-notify-item-link">View</a>` : ''}
          <button class="ipv4-notify-item-close" data-rule-id="${ruleId}" data-auction-id="${auctionId}">×</button>
        </div>
      `;

      // Add click handler to dismiss when viewing
      const link = itemEl.querySelector('.ipv4-notify-item-link');
      if (link) {
        link.addEventListener('click', () => {
          if (ruleId && auctionId) dismissNotification(ruleId, auctionId);
        });
      }

      // Add click handler for individual X button
      const closeBtn = itemEl.querySelector('.ipv4-notify-item-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          removeNotifyItem(itemEl, ruleId, auctionId);
        });
      }

      itemsContainer.appendChild(itemEl);
    });

    // Show count if more items
    if (matchingItems.length > 3) {
      countEl.textContent = `+${matchingItems.length - 3} more matching listings`;
      countEl.style.display = 'block';
    } else {
      countEl.style.display = 'none';
    }

    banner.classList.add('ipv4-notify-visible');
    notifyBannerVisible = true;
    positionNotifyBanner();
  }

  function hideNotifyBanner() {
    const banner = document.getElementById('ipv4-notify-banner');
    if (banner) {
      banner.classList.remove('ipv4-notify-visible');
      // Dismiss all currently displayed items using close button data
      const closeButtons = banner.querySelectorAll('.ipv4-notify-item-close');
      closeButtons.forEach(btn => {
        const rid = btn.dataset.ruleId;
        const aid = btn.dataset.auctionId;
        if (rid && aid) dismissNotification(rid, aid);
      });
    }
    notifyBannerVisible = false;
  }

  async function playNotificationSound() {
    try {
      const soundEnabled = await getSetting(CONFIG.notifyMeSoundKey, true);
      if (!soundEnabled) return;

      const soundType = await getSetting(CONFIG.notifyMeSoundTypeKey, 'chime');

      // Create audio context for generating sounds
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Simple beep/chime sound generation
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Different sound types
      switch (soundType) {
        case 'bell':
          oscillator.frequency.value = 830;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 0.5);
          break;
        case 'alert':
          oscillator.frequency.value = 440;
          oscillator.type = 'square';
          gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 0.3);
          break;
        case 'chime':
        default:
          oscillator.frequency.value = 587; // D5
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 0.4);
          // Second tone for chime
          setTimeout(() => {
            try {
              const osc2 = audioCtx.createOscillator();
              const gain2 = audioCtx.createGain();
              osc2.connect(gain2);
              gain2.connect(audioCtx.destination);
              osc2.frequency.value = 880; // A5
              osc2.type = 'sine';
              gain2.gain.setValueAtTime(0.25, audioCtx.currentTime);
              gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
              osc2.start(audioCtx.currentTime);
              osc2.stop(audioCtx.currentTime + 0.3);
            } catch (e) {}
          }, 150);
          break;
      }
    } catch (e) {
      log.warn('Error playing notification sound:', e);
    }
  }

  async function checkNotifications(items) {
    if (!items || items.length === 0) {
      log.info('checkNotifications: No items to check');
      return;
    }

    log.info('checkNotifications: Checking', items.length, 'items');

    try {
      const enabled = await getSetting(CONFIG.notifyMeEnabledKey, false);
      if (!enabled) {
        log.info('Notifications disabled');
        return;
      }

      const rules = await getSetting(CONFIG.notifyMeRulesKey, []);
      log.info('Notification rules:', rules);
      if (!rules || rules.length === 0) {
        log.info('No notification rules configured');
        return;
      }

      // Load dismissed notifications if not already loaded
      if (Object.keys(dismissedNotifications).length === 0) {
        await loadDismissedNotifications();
      }

      const matchingItems = [];
      const matchedRules = new Set();

      for (const item of items) {
        const auctionId = getAuctionId(item) || `item_${item.block}_${item.region}_${Date.now()}`;

        for (const rule of rules) {
          // Skip if already dismissed for this rule
          if (isNotificationDismissed(rule.id, auctionId)) {
            log.info('Item already dismissed:', auctionId);
            continue;
          }

          const matches = itemMatchesRule(item, rule);
          log.info('Item match check:', { item: { block: item.block, region: item.region, price: item.askingPrice || item.pricePerAddress }, rule, matches });

          if (matches) {
            matchingItems.push({ item, ruleId: rule.id, auctionId });
            matchedRules.add(rule.id);
            break; // Only match one rule per item
          }
        }
      }

      log.info('Matching items found:', matchingItems.length);

      if (matchingItems.length > 0) {
        log.info(`Found ${matchingItems.length} matching items for notifications`);
        showNotifyBanner(matchingItems, matchedRules);
        playNotificationSound();
      }
    } catch (e) {
      log.error('Error checking notifications:', e);
    }
  }

  // Fetch new listings specifically for notification checking
  async function fetchNewListingsForNotifications() {
    log.info('fetchNewListingsForNotifications called');

    const enabled = await getSetting(CONFIG.notifyMeEnabledKey, false);
    log.info('Notifications enabled:', enabled);
    if (!enabled) return;

    const rules = await getSetting(CONFIG.notifyMeRulesKey, []);
    log.info('Notification rules count:', rules ? rules.length : 0);
    if (!rules || rules.length === 0) return;

    if (!isChromeAvailable()) {
      log.warn('Chrome not available for notification fetch');
      return;
    }

    try {
      // Build request body for new listings (no period filter)
      const requestBody = {
        filter: {
          block: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8],
          region: ["arin", "apnic", "ripe", "afrinic", "lacnic"]
        },
        sort: { property: "date", direction: "desc" },
        offset: 0,
        limit: 50
      };

      log.info('Sending notification fetch request to:', CONFIG.newListingsApi);

      chrome.runtime.sendMessage({
        type: 'fetchData',
        url: CONFIG.newListingsApi,
        body: JSON.stringify(requestBody)
      }, r => {
        try {
          if (chrome.runtime.lastError) {
            log.warn('Notification fetch error:', chrome.runtime.lastError.message);
            return;
          }
          log.info('Notification fetch response:', r ? 'success=' + r.success : 'null');
          if (r && r.success && r.data) {
            const d = JSON.parse(r.data);
            if (d && Array.isArray(d.items)) {
              log.info('Notification check: Got', d.items.length, 'new listings');
              if (d.items.length > 0) {
                log.info('First item sample:', JSON.stringify(d.items[0]).substring(0, 200));
                checkNotifications(d.items);
              }
            } else {
              log.warn('No items array in response:', d);
            }
          } else {
            log.warn('Invalid response:', r);
          }
        } catch (e) {
          log.error('Error in notification fetch callback:', e);
        }
      });
    } catch (e) {
      log.error('Error fetching for notifications:', e);
    }
  }

  // --- UI Update and Interaction Functions ---
  function prepareBannerForExpansion(b) { 
    log.info("Preparing banner for expansion"); 
    b.classList.remove('ipv4-banner-minimized'); 
    b.style.width='';b.style.maxWidth='';b.style.minWidth=''; 
    const t=document.getElementById('ipv4-title'); 
    const sc=document.getElementById('ipv4-scroll-container'); 
    if(t)t.classList.remove('ipv4-element-hidden'); 
    if(sc)sc.classList.remove('ipv4-element-hidden'); 
    updateLogo(false); 
    updateGearSubmenu(); 
  }
  function startDragExpansion(b,e) {log.info("Starting drag expansion"); if(!b||!isMinimized){log.warn("Cannot start drag expansion"); return false;} isDragExpanding=true; dragState.expandMinX=e.clientX; b.style.transition='none'; prepareBannerForExpansion(b); const iw=Math.max(CONFIG.minWidth,CONFIG.initialDragExpandWidth); dragState.initialExpandWidth=iw; b.style.width=iw+'px'; log.info("Drag expansion started, initial width:",iw); return true;}
  function handleDragExpansion(b,e) {if(!b||!isDragExpanding)return false; const dX=dragState.expandMinX-e.clientX; let nW=dragState.initialExpandWidth+dX; nW=Math.max(CONFIG.minWidth,nW); const vW=getViewportWidth(); const brE=parseInt(window.getComputedStyle(b).right); const maW=vW-CONFIG.edgeGap-brE; nW=Math.min(nW,maW); b.style.width=nW+'px'; dragState.lastWidth=nW; return true;}
  function finishDragExpansion(b) {log.info("Finishing drag expansion"); if(!b||!isDragExpanding)return false; b.style.transition='width 0.1s ease-out'; const fW=Math.max(CONFIG.minWidth,dragState.lastWidth); b.style.width=fW+'px'; log.info("Drag finished, width:",fW); saveWidth(fW); isMinimized=false; saveMinimizedState(false); isDragExpanding=false; if(isWidthAtMax(fW)){const mW=calculateMaxBannerWidth();b.style.width=mW+'px';saveWidth(mW);} if(!hasFetchedData){log.info("Fetching data post-drag");fetchData();} ensureBannerInViewport(b); updateGearSubmenu(); setTimeout(()=>{if(b)b.style.transition='';},100); return true;}
  function cancelDragExpansion(b) {log.info("Cancelling drag expansion"); if(!b||!isDragExpanding)return false; isMinimized=true; saveMinimizedState(true); b.classList.add('ipv4-banner-minimized');b.style.width=''; const t=document.getElementById('ipv4-title');const sc=document.getElementById('ipv4-scroll-container'); if(t)t.classList.add('ipv4-element-hidden');if(sc)sc.classList.add('ipv4-element-hidden'); updateLogo(true); updateGearSubmenu(); isDragExpanding=false;return true;}
  function enforceLeftEdgeGap(b){if(!b||isMinimized||isDragExpanding)return false;const vW=getViewportWidth();const bW=b.offsetWidth;const cs=window.getComputedStyle(b);const cR=cs.right==='auto'?null:parseInt(cs.right);if(cR!==null){const iL=vW-bW-cR;if(iL<CONFIG.edgeGap){const nW=vW-cR-CONFIG.edgeGap;if(nW>=CONFIG.minWidth){b.style.width=nW+'px';saveWidth(nW);return true;}}}return false;}
  function bannerExists(){ const banner = document.getElementById('ipv4-banner'); return banner !== null && document.body.contains(banner); }
  function checkContentOverflow(b){if(!b||isMinimized||isDuringToggleTransition||isDragExpanding)return false; const t=document.getElementById('ipv4-title');const dh=document.getElementById('ipv4-drag-handle'); const gearBtn = document.getElementById('ipv4-gear-button'); if(!t||!dh||!gearBtn)return false;const fW=dh.offsetWidth+t.offsetWidth+gearBtn.offsetWidth+CONFIG.overflowCheckExtraPadding;if(b.offsetWidth<fW+20)return true;return false;}
  function isNearLeftEdge(b){if(!b)return false;const cs=window.getComputedStyle(b);const cL=cs.left==='auto'?null:parseInt(cs.left);return cL!==null&&cL<=CONFIG.leftEdgeThreshold;}
  function constrainBannerToViewport(b){}
  function positionToRightSide(b){if(!b)return false;b.style.left='auto';b.style.right=CONFIG.edgeGap+'px';dragState.isUsingLeft=false;clearLeftPosition();lastPositioningTime=Date.now();return true;}
  function ensureBannerInViewport(banner){ if(!banner) banner = document.getElementById('ipv4-banner'); if(!banner) return; /* ... */ }

  function toggleGearSubmenu(forceOpen) {
    const submenu = _ensureGearSubmenuElement();

    const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : !isGearSubmenuOpen;
    if (!shouldOpen) {
      submenu.style.display = 'none';
      isGearSubmenuOpen = false;
      document.removeEventListener('click', handleClickOutsideGearSubmenu, true);
      return;
    }

    updateGearSubmenu();
    submenu.style.display = 'block';
    positionGearSubmenu();
    isGearSubmenuOpen = true;

    // Close when clicking anywhere else (delayed to avoid immediate closure)
    setTimeout(() => {
      document.addEventListener('click', handleClickOutsideGearSubmenu, true);
    }, 10);
  }

  function updateGearSubmenu() {
    const submenu = _ensureGearSubmenuElement();
    submenu.innerHTML = '';

    // 1) Minimize / Expand
    const toggleItem = document.createElement('div');
    toggleItem.textContent = isMinimized ? 'Expand' : 'Minimize';
    toggleItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const banner = document.getElementById('ipv4-banner');
      if (banner) {
        toggleMinimized(banner);
      }
      toggleGearSubmenu(false);
    });
    submenu.appendChild(toggleItem);

    // 2) Options
    const optionsItem = document.createElement('div');
    optionsItem.textContent = 'Options';
    optionsItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleGearSubmenu(false);

      // Open options page via background script
      if (isChromeAvailable()) {
        try {
          chrome.runtime.sendMessage({ type: 'openOptions' }, (response) => {
            if (chrome.runtime.lastError) {
              log.error('[IPv4 Banner] Error sending openOptions message:', chrome.runtime.lastError.message);
            } else if (!response || response.ok === false) {
              log.warn('[IPv4 Banner] openOptionsPage reported failure:', response && response.error);
            } else {
              log.info('[IPv4 Banner] openOptionsPage triggered via background.');
            }
          });
        } catch (err) {
          log.error('[IPv4 Banner] Exception while requesting options page:', err);
        }
      } else {
        log.warn('[IPv4 Banner] Chrome API not available, cannot open options page');
      }
    });
    submenu.appendChild(optionsItem);

    // 3) Analyze
    const analysisItem = document.createElement('div');
    analysisItem.textContent = 'Analyze';
    analysisItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleGearSubmenu(false);

      // Open analysis page via background script
      if (isChromeAvailable()) {
        try {
          chrome.runtime.sendMessage({ type: 'openAnalysis' }, (response) => {
            if (chrome.runtime.lastError) {
              log.error('[IPv4 Banner] Error sending openAnalysis message:', chrome.runtime.lastError.message);
            } else if (!response || response.ok === false) {
              log.warn('[IPv4 Banner] openAnalysis reported failure:', response && response.error);
            } else {
              log.info('[IPv4 Banner] openAnalysis triggered via background.');
            }
          });
        } catch (err) {
          log.error('[IPv4 Banner] Exception while requesting analysis page:', err);
        }
      } else {
        log.warn('[IPv4 Banner] Chrome API not available, cannot open analysis page');
      }
    });
    submenu.appendChild(analysisItem);

    // 4) Close
    const closeItem = document.createElement('div');
    closeItem.textContent = 'Close';
    closeItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleGearSubmenu(false);

      // Fully clean up the banner on this page
      try {
        cleanup(true, { type: 'manualClose' });
      } catch (err) {
        log.warn('[IPv4 Banner] Error during manual Close cleanup:', err);
        // Fallback: just remove the banner node if cleanup blew up
        const banner = document.getElementById('ipv4-banner');
        if (banner && banner.parentNode) {
          banner.parentNode.removeChild(banner);
        }
      }
    });
    submenu.appendChild(closeItem);
  }

  function toggleMinimized(banner, force = null) { 
    if (!banner || isDuringToggleTransition || isDragExpanding) {
        log.warn("toggleMinimized called but prerequisites not met or already in transition/dragExpanding.");
        return;
    }
    log.info("Toggling minimized. Force:", force, "Current:", isMinimized); 
    isDuringToggleTransition = true; 
    
    if (isGearSubmenuOpen) toggleGearSubmenu();

    const oldIsMinimized = isMinimized;
    if (force !== null) { isMinimized = force; } 
    else { isMinimized = !isMinimized; }
    
    if (oldIsMinimized !== isMinimized) { 
        saveMinimizedState(isMinimized);
    }
    log.info("New isMinimized state:", isMinimized); 

    if (dragState.alwaysUseRight || isMinimized) { positionToRightSide(banner); } 
    
    const titleEl = document.getElementById('ipv4-title'); 
    const scrollContainer = document.getElementById('ipv4-scroll-container'); 
    
    updateLogo(isMinimized); // This was the problem - needs to be defined
    updateGearSubmenu(); 

    if (!isMinimized) { 
        log.info("Expanding banner"); 
        banner.classList.remove('ipv4-banner-minimized'); 
        if (titleEl) titleEl.classList.remove('ipv4-element-hidden'); 
        if (scrollContainer) scrollContainer.classList.remove('ipv4-element-hidden'); 
        
        let currentMinimizedWidth = banner.offsetWidth; 
        if (currentMinimizedWidth < CONFIG.minWidth / 3 || currentMinimizedWidth > CONFIG.minWidth ) { 
            const dragHandleWidth = document.getElementById('ipv4-drag-handle')?.offsetWidth || 16; 
            const logoLinkWidth = document.getElementById('ipv4-logo-link')?.offsetWidth || CONFIG.minIconSize + 4;
            const gearBtnWidth = document.getElementById('ipv4-gear-button')?.offsetWidth || 24; 
            currentMinimizedWidth = dragHandleWidth + logoLinkWidth + gearBtnWidth + (CONFIG.minimizedSpacing * 2) + CONFIG.normalSpacing + 8;
        }
        banner.style.width = currentMinimizedWidth + 'px'; 
        log.info("Start expand animation from width:", currentMinimizedWidth); 
        void banner.offsetWidth; 
        banner.style.transition = 'width ' + CONFIG.minimizeAnimationDuration + 'ms ease-out'; 
        getSavedWidth().then(sw => { 
            const mtu = calculateMaxBannerWidth(); 
            let fw = isAtMaxWidth ? mtu : Math.min(sw, mtu); 
            if (preMinimizeWidth && !isAtMaxWidth && preMinimizeWidth >= CONFIG.minWidth) { 
                fw = Math.min(preMinimizeWidth, mtu); 
            } 
            fw = Math.max(CONFIG.minWidth, fw); 
            banner.style.width = fw + 'px'; 
            log.info("Expanding to target width:", fw); 
            if (banner.offsetWidth !== fw) saveWidth(fw);
        }); 
        if (!hasFetchedData) { 
            log.info("Fetching data on expand as hasFetchedData is false."); 
            setTimeout(fetchData, 50); 
        } else {log.info("Already hasFetchedData, not fetching on expand.");} 
    } else { 
        log.info("Minimizing banner"); 
        const cw = banner.offsetWidth; 
        if (cw >= CONFIG.minWidth && oldIsMinimized === false) { 
            preMinimizeWidth = cw; 
            preMinimizeWidthPercent = calculateWidthPercentage(cw); 
            saveWidth(cw); 
        } 
        banner.style.width = cw + 'px'; 
        banner.offsetHeight; 
        banner.style.transition = 'width ' + CONFIG.minimizeAnimationDuration + 'ms ease-in'; 
        
        const dhw = document.getElementById('ipv4-drag-handle')?.offsetWidth || 16; 
        const llw = document.getElementById('ipv4-logo-link')?.offsetWidth || CONFIG.minIconSize; 
        const gbW = document.getElementById('ipv4-gear-button')?.offsetWidth || 24; 
        const amcw = dhw + llw + gbW + (CONFIG.minimizedSpacing * 2) + (CONFIG.normalSpacing) ; 
        
        banner.style.width = amcw + 'px'; 
        log.info("Minimizing: animating to width approx:", amcw); 
        setTimeout(() => { 
            banner.classList.add('ipv4-banner-minimized'); 
            if (titleEl) titleEl.classList.add('ipv4-element-hidden'); 
            if (scrollContainer) scrollContainer.classList.add('ipv4-element-hidden'); 
            banner.style.width = ''; 
        }, CONFIG.minimizeAnimationDuration); 
    } 
    setTimeout(() => { 
        if (banner) banner.style.transition = ''; 
        if (!isMinimized) { 
            setTimeout(() => { 
                if (checkContentOverflow(banner)) { 
                    log.info("Content overflow after expand, minimizing again."); 
                    toggleMinimized(banner, true); 
                } 
            }, CONFIG.minimizeDelay); 
        } 
        isDuringToggleTransition = false; 
        ensureBannerInViewport(banner); 
        log.info("Toggle minimized transition complete."); 
    }, CONFIG.minimizeAnimationDuration + 50); 
  }

  async function updateMinimizedState(banner) { 
      if(!banner||isDuringToggleTransition)return; 
      const t=document.getElementById('ipv4-title');
      const sc=document.getElementById('ipv4-scroll-container'); 
      banner.classList.toggle('ipv4-banner-minimized',isMinimized);
      if(t)t.classList.toggle('ipv4-element-hidden',isMinimized);
      if(sc)sc.classList.toggle('ipv4-element-hidden',isMinimized); 
      if(!isMinimized){
          let tw;
          if(isAtMaxWidth){tw=calculateMaxBannerWidth();}
          else{let sw;if(preMinimizeWidthPercent!==null&&preMinimizeWidthPercent>0){sw=Math.round((preMinimizeWidthPercent/100)*getViewportWidth());}else if(preMinimizeWidth!==null&&preMinimizeWidth>=CONFIG.minWidth){sw=preMinimizeWidth;}else{sw=await getSavedWidth();}tw=Math.min(sw,calculateMaxBannerWidth());}
          banner.style.width=tw+'px';
          if(banner.style.width!==tw+'px'){saveWidth(tw);}enforceLeftEdgeGap(banner);
      } else {
          banner.style.width=''; 
          positionToRightSide(banner);
      } 
      updateGearSubmenu();
    }
  function handleWindowResize() { if(isDestroyed||!bannerExists())return;const b=document.getElementById('ipv4-banner');if(!b)return;const cVW=getViewportWidth();const cW=b.offsetWidth;const mW=calculateMaxBannerWidth();if(isAtMaxWidth&&!isMinimized){b.style.width=mW+'px';saveWidth(mW);enforceLeftEdgeGap(b);}else if(!isMinimized&&cW>mW){b.style.width=mW+'px';saveWidth(mW);enforceLeftEdgeGap(b);}if(resizeTimeout)clearTimeout(resizeTimeout);resizeTimeout=setTimeout(()=>{const bn=document.getElementById('ipv4-banner');if(!bn)return;const curVW=getViewportWidth();const wChg=Math.abs(curVW-initialViewportWidth);const maxW=calculateMaxBannerWidth();const curW=bn.offsetWidth;if(isMinimized){positionToRightSide(bn);}else if(dragState.alwaysUseRight){positionToRightSide(bn);if(isAtMaxWidth){bn.style.width=maxW+'px';saveWidth(maxW);}else if(!isMinimized&&curW>maxW){bn.style.width=maxW+'px';saveWidth(maxW);}enforceLeftEdgeGap(bn);}else if(wChg>CONFIG.windowResizeThreshold){if(dragState.isUsingLeft&&isNearLeftEdge(bn)){positionToRightSide(bn);}initialViewportWidth=curVW;if(curVW<initialViewportWidth&&!isMinimized){if(curW>maxW){bn.style.width=maxW+'px';saveWidth(maxW);}}}else if(!isMinimized){enforceLeftEdgeGap(bn);}ensureBannerInViewport(bn);if(dragState.isUsingLeft&&!isMinimized&&!dragState.ignoreLeftPositioning){const cL=parseInt(window.getComputedStyle(bn).left);const bW=bn.offsetWidth;if(cL+bW>curVW-CONFIG.edgeGap){positionToRightSide(bn);}}constrainBannerToViewport(bn);updateGearSubmenu();},50);}
  
  function setupDragFunctionality(banner) {
    const dragHandle = document.getElementById('ipv4-drag-handle');
    if (!dragHandle) { log.error("Drag handle #ipv4-drag-handle not found!"); return; }

    dragHandle.addEventListener('mousedown', function(e) {
      e.preventDefault(); if (isDuringToggleTransition) return;
      if (isGearSubmenuOpen) toggleGearSubmenu(); 

      dragState.isDragging = true; 
      dragState.startY = e.clientY;dragState.startX = e.clientX;dragState.initialClickX = e.clientX;dragState.lastDragTime = Date.now(); const cs=window.getComputedStyle(banner);const ct=cs.top==='auto'?null:parseInt(cs.top);const cb=cs.bottom==='auto'?null:parseInt(cs.bottom);const cr=cs.right==='auto'?null:parseInt(cs.right);const cl=cs.left==='auto'?null:parseInt(cs.left);dragState.isUsingTop=(ct!==null&&ct!=='auto');dragState.startPos=dragState.isUsingTop?ct:cb;dragState.startRight=cr;dragState.startLeft=cl;dragState.isUsingLeft=(cl!==null&&cl!=='auto'&&!dragState.alwaysUseRight);dragState.startWidth=banner.offsetWidth;dragState.lastWidth=banner.offsetWidth;dragState.isHorizontalDrag=false;dragState.isVerticalDrag=false;
      
      dragHandle.style.cursor = 'grabbing'; 
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) { if(!dragState.isDragging)return;const deltaX = e.clientX - dragState.startX; const deltaY = e.clientY - dragState.startY; const absX = Math.abs(deltaX); const absY = Math.abs(deltaY); dragState.dragDistance+=Math.abs(e.clientX-dragState.initialClickX);if(!dragState.isHorizontalDrag&&!dragState.isVerticalDrag){if(absX>5||absY>5){if(isMinimized){dragState.isHorizontalDrag=absX>absY*1.5;dragState.isVerticalDrag=!dragState.isHorizontalDrag;}else{dragState.isHorizontalDrag=absX>absY;dragState.isVerticalDrag=!dragState.isHorizontalDrag;}log.info("Drag dir:",{H:dragState.isHorizontalDrag,V:dragState.isVerticalDrag});}}if(isMinimized){if(dragState.isVerticalDrag){handleVerticalDrag(e);return;}if(dragState.isHorizontalDrag&&deltaX<0&&absX>10){if(!isDragExpanding){startDragExpansion(banner,e);}else{handleDragExpansion(banner,e);}return;}return;}if(isDragExpanding){handleDragExpansion(banner,e);return;}if(dragState.isHorizontalDrag&&!isMinimized){const viewportWidth=getViewportWidth();if(dragState.alwaysUseRight||!dragState.isUsingLeft){let newWidth=dragState.startWidth-deltaX;if(deltaX>0&&newWidth<CONFIG.autoMinimizeWidth){log.info("Auto-minimizing (drag right).");preMinimizeWidth=dragState.startWidth;preMinimizeWidthPercent=calculateWidthPercentage(dragState.startWidth);if(dragHandle) dragHandle.style.cursor='auto';toggleMinimized(banner,true);dragState.isDragging=false;return;}const bannerRightPosition=dragState.startRight!==null?dragState.startRight:CONFIG.edgeGap;const maxAllowedWidth=viewportWidth-CONFIG.edgeGap-bannerRightPosition;newWidth=Math.min(newWidth,maxAllowedWidth);newWidth=Math.max(CONFIG.minWidth,newWidth);isAtMaxWidth=isWidthAtMax(newWidth);banner.style.width=newWidth+'px';dragState.lastWidth=newWidth;}else if(dragState.isUsingLeft&&!dragState.ignoreLeftPositioning){let newWidth=dragState.startWidth+deltaX;if(deltaX<0&&newWidth<CONFIG.autoMinimizeWidth){if(dragHandle) dragHandle.style.cursor='auto';toggleMinimized(banner,true);dragState.isDragging=false;return;}newWidth=Math.max(CONFIG.minWidth,newWidth);const bannerLeftPosition=dragState.startLeft!==null?dragState.startLeft:CONFIG.edgeGap;const maxAllowedWidth=viewportWidth-CONFIG.edgeGap-bannerLeftPosition;newWidth=Math.min(newWidth,maxAllowedWidth);banner.style.width=newWidth+'px';dragState.lastWidth=banner.offsetWidth;}}if(dragState.isVerticalDrag){handleVerticalDrag(e);}dragState.lastDragTime=Date.now(); }
    function handleVerticalDrag(e) { if(!dragState.isDragging||!dragState.isVerticalDrag)return;const b=document.getElementById('ipv4-banner');if(!b)return;const dY=e.clientY-dragState.startY;const vH=getViewportHeight();if(dragState.isUsingTop){let nT=dragState.startPos+dY;nT=Math.max(0,Math.min(nT,vH-CONFIG.bannerHeight));b.style.top=nT+'px';b.style.bottom='auto';}else{let nB=dragState.startPos-dY;nB=Math.max(0,Math.min(nB,vH-CONFIG.bannerHeight));b.style.bottom=nB+'px';b.style.top='auto';}}

    function handleMouseUp(e) {
      if (!dragState.isDragging) return;
      if (dragHandle) dragHandle.style.cursor = ''; 
      
      if (isDragExpanding) { finishDragExpansion(banner); } else { if (dragState.isHorizontalDrag && !isMinimized) { const currentWidth = banner.offsetWidth; if (currentWidth >= CONFIG.minWidth) saveWidth(currentWidth); } if (dragState.isVerticalDrag) { const cs = window.getComputedStyle(banner); if (dragState.isUsingTop) savePosition({ top: cs.top }); else savePosition({ bottom: cs.bottom }); } } dragState.isDragging = false;dragState.isHorizontalDrag = false;dragState.isVerticalDrag = false; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); constrainBannerToViewport(banner); enforceLeftEdgeGap(banner); ensureBannerInViewport(banner); if (dragState.alwaysUseRight) positionToRightSide(banner);
    }
  }

  async function createBanner() {
    log.info("createBanner called..."); 
    if (bannerCreated && bannerExists()) { log.info("Banner already exists."); return true; }
    if (bannerCreated && !bannerExists()) { log.info("Flag true but no banner, resetting."); bannerCreated = false; }
    const exB = document.getElementById('ipv4-banner');
    if (exB) { try { exB.parentNode.removeChild(exB); log.info("Removed remnant banner."); } catch (e) { log.warn('Could not remove remnant banner:', e); } }

    try {
      await getAllSettings();
      initialViewportWidth = getViewportWidth();
      currentViewMode = await getSavedViewMode();
      const pos = await getSavedPosition();
      isMinimized = await getSavedMinimizedState();
      log.info("Initial states from storage:", { currentViewMode, isMinimized });
      let sW = await getSavedWidth();
      const mW = calculateMaxBannerWidth();
      sW = Math.min(sW, mW);
      if (sW < CONFIG.minWidth) sW = Math.min(CONFIG.defaultWidth, mW);
      if (isMinimized && preMinimizeWidth === null) preMinimizeWidth = sW;
      let sL = await getSavedLeftPosition();
      const vW = getViewportWidth();
      if (dragState.alwaysUseRight || isMinimized) sL = null;
      else if (sL !== null) { sL = Math.max(CONFIG.edgeGap, sL); if (sL > vW - CONFIG.minWidth) { sL = null; await clearLeftPosition(); }}

      const b = document.createElement('div');
      b.id = 'ipv4-banner';
      b.classList.add('ipv4-banner-base');
      b.style.height = `${CONFIG.bannerHeight}px`;
      if (isMinimized) b.classList.add('ipv4-banner-minimized'); else b.style.width = `${sW}px`;
      if (dragState.alwaysUseRight || isMinimized || sL === null) { b.style.right = `${CONFIG.edgeGap}px`; b.style.left = 'auto'; dragState.isUsingLeft = false; }
      else { b.style.left = `${sL}px`; b.style.right = 'auto'; dragState.isUsingLeft = true; }
      if (pos.top) { b.style.top = pos.top; b.style.bottom = 'auto'; dragState.isUsingTop = true; }
      else { b.style.bottom = pos.bottom||'10px'; b.style.top = 'auto'; dragState.isUsingTop = false; }

      const dhE = _createDragHandleElement(); b.appendChild(dhE);
      const llE = _createLogoLinkElement(); b.appendChild(llE);
      const tE = _createTitleElement(currentViewMode); b.appendChild(tE);
      const scE = _createScrollContainerElement(); b.appendChild(scE);
      const gearBtnE = _createGearButtonElement(); b.appendChild(gearBtnE);

      // Ensure the submenu element exists (it will be attached to <body>)
      _ensureGearSubmenuElement(); 


      tE.classList.toggle('ipv4-element-hidden', isMinimized);
      scE.classList.toggle('ipv4-element-hidden', isMinimized);

      document.body.appendChild(b);
      log.info("Banner appended to body.");
      setupDragFunctionality(b); 
      updateLogo(isMinimized); 
      updateGearSubmenu();

      if (document.getElementById('ipv4-banner')) {
        bannerCreated = true;
        log.info('Banner fully created and verified in DOM.');
        window.addEventListener('resize', handleWindowResize);
        enforceLeftEdgeGap(b);
        setTimeout(ensureBannerInViewport, 100, b);
        setTimeout(() => { const bn=document.getElementById('ipv4-banner'); if(bn)enforceLeftEdgeGap(bn);}, 200);
        releaseInitLock();
        if (!isMinimized) {
          log.info("createBanner: Banner is expanded. Queueing initial fetchData.");
          hasFetchedData = false; 
          setTimeout(fetchData, 50);
        } else {
          log.info("createBanner: Banner is minimized. Initial data fetch deferred.");
          hasFetchedData = false; 
        }
        return true;
      } else {
        log.error('Banner supposedly appended but not found by ID immediately after creation!');
        bannerCreated = false;
        releaseInitLock();
        return false;
      }
    } catch (e) {
      log.error('Error in createBanner:', e, e.stack); 
      bannerCreated = false;
      releaseInitLock();
      return false;
    }
  }
  
  function renderItems(items) {
    log.info("renderItems called with items count:", items ? items.length : 'null');
    try {
        if (isDestroyed) { log.info("renderItems: isDestroyed, returning."); return; }
        const banner = document.getElementById('ipv4-banner');
        if (!banner) { log.warn('renderItems: Banner not found. Triggering fetchData for potential recreate.'); bannerCreated = false; fetchData(); return; }
        
        if (isMinimized && !isDragExpanding) { 
            log.info("renderItems: Banner is minimized and not drag-expanding, not rendering items."); 
            const scrollContentClear = document.getElementById('ipv4-scroll-content');
            if (scrollContentClear) scrollContentClear.innerHTML = '';
            return; 
        } 
        
        const scrollContent = document.getElementById('ipv4-scroll-content');
        if (!scrollContent) { log.error('CRITICAL: Scroll content element #ipv4-scroll-content not found! Cannot render items.'); bannerCreated = false; return; }

        const scrollContainerElement = document.getElementById('ipv4-scroll-container');
        if (!scrollContainerElement) { log.error('CRITICAL: Scroll container #ipv4-scroll-container not found for width measurement!'); return; }
        
        let containerWidth = scrollContainerElement.offsetWidth;
        if (isMinimized && isDragExpanding) {
            const estimatedBannerWidth = preMinimizeWidth || CONFIG.defaultWidth;
            const dragHandleWidth = document.getElementById('ipv4-drag-handle')?.offsetWidth || 16;
            const logoWidth = document.getElementById('ipv4-logo-link')?.offsetWidth || 30;
            const titleWidth = document.getElementById('ipv4-title')?.offsetWidth || 80; 
            const gearWidth = document.getElementById('ipv4-gear-button')?.offsetWidth || 24;
            containerWidth = estimatedBannerWidth - dragHandleWidth - logoWidth - titleWidth - gearWidth - (CONFIG.normalSpacing * 4);
            if (containerWidth < CONFIG.minWidth / 2) containerWidth = CONFIG.minWidth / 2; 
        } else if (isMinimized) { 
             containerWidth = CONFIG.defaultWidth; 
        }

        const MIN_REPETITIONS = 10; 
        const SAFE_MULTIPLIER = 3;  

        let singleUnitText;
        let isNoDataOrError = false;

        if (!items || items.length === 0) {
            const noDataMessageType = currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales' : 'New Listings';
            singleUnitText = `<span class="registry">No ${noDataMessageType} Data Available</span>&nbsp;&nbsp;&nbsp;&nbsp;`; 
            isNoDataOrError = true;
        } else {
            const htmlItems = items.map(item => {
                if (!item || typeof item !== 'object') return '';
                const blockStr = (typeof item.block === 'number' || typeof item.block === 'string') ? item.block.toString() : '';
                const regionStr = (item.region && typeof item.region === 'string') ? item.region.toUpperCase() : '';
                let priceStr;
                if (currentViewMode === VIEW_MODES.PRIOR_SALES) {
                    priceStr = getValidPriceString(item, 'pricePerAddress'); // Ensure getValidPriceString is defined
                } else {
                    const priceFieldsToTry = ['askingPrice', 'price', 'pricePerAddress', 'listPrice', 'listingPrice', 'perAddress', 'asking', 'list', 'price.perAddress', 'pricing.perAddress', 'pricing.asking'];
                    priceStr = '';
                    for (const field of priceFieldsToTry) { priceStr = getValidPriceString(item, field); if (priceStr && priceStr !== "$") break; }
                    if (CONFIG.debug && (!priceStr || priceStr === "$")) { log.warn('New Listing item missing price or only "$":', item); }
                    if (!priceStr || priceStr === "$") priceStr = '$??';
                }

                // Get auction ID and create link if available
                const auctionId = getAuctionId(item);
                const itemContent = `<span class="prefix">/${blockStr}</span> <span class="registry">${regionStr}</span> <span class="price">${priceStr}</span>`;

                if (auctionId) {
                    return `<a href="https://auctions.ipv4.global/auction/${auctionId}" target="_blank" class="ticker-link">${itemContent}</a>`;
                } else {
                    return itemContent;
                }
            });
            const validItems = htmlItems.filter(item => item);

            if (validItems.length === 0) {
                const noDataMessageType = currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales' : 'New Listings';
                singleUnitText = `<span class="registry">No ${noDataMessageType} Data Available</span>&nbsp;&nbsp;&nbsp;&nbsp;`; 
                isNoDataOrError = true;
            } else {
                hasFetchedData = true;
                retryCount = 0;
                singleUnitText = validItems.join('&nbsp;&nbsp;&nbsp;&nbsp;') + '&nbsp;&nbsp;&nbsp;&nbsp;';
            }
        }

        let unitWidth;
        const tempEl = document.createElement('div');
        tempEl.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font-size:12px;font-family:Arial,sans-serif;';
        tempEl.innerHTML = singleUnitText; 
        document.body.appendChild(tempEl);
        unitWidth = tempEl.scrollWidth;
        document.body.removeChild(tempEl);

        if (unitWidth < 10 && isNoDataOrError) unitWidth = 200; 
        else if (unitWidth < 10) unitWidth = 100; 

        let repetitions = MIN_REPETITIONS;
        const effectiveContainerWidth = containerWidth > 0 ? containerWidth : CONFIG.defaultWidth; 

        if (effectiveContainerWidth > 0 && unitWidth > 0) {
            repetitions = Math.max(MIN_REPETITIONS, Math.ceil((effectiveContainerWidth * SAFE_MULTIPLIER) / unitWidth) + 2); 
        }
        
        scrollContent.innerHTML = singleUnitText.repeat(repetitions);
        log.info(`RenderItems: UnitWidth=${unitWidth}, ContainerWidth=${containerWidth} (Effective: ${effectiveContainerWidth}), Repetitions=${repetitions}`);
        
        setupScrollAnimation(scrollContent, unitWidth); 
        
        if (!isNoDataOrError) {
            ensureBannerInViewport(banner); 
            log.info("Items rendered and animation setup complete.");
        }
    } catch (e) {
        log.error('Error in renderItems:', e, e.stack);
    }
  }

  async function setupScrollAnimation(element, width) { 
    try {
        if (!element || isDestroyed || (isMinimized && !isDragExpanding)) return;
        if (animationStyleElement && document.head.contains(animationStyleElement)) {
            try { document.head.removeChild(animationStyleElement); } catch (e) {}
        }
        const uid = Math.floor(Math.random() * 1000000);
        const an = `scrollBanner_${uid}`;

        let speedSettingValue = await getSetting(CONFIG.animationSpeedSettingKey, '2'); 
        speedSettingValue = parseInt(speedSettingValue, 10);
        if (isNaN(speedSettingValue) || speedSettingValue < 0 || speedSettingValue >= speedMultipliers.length) {
            speedSettingValue = 2; 
        }
        const currentSpeedMultiplier = speedMultipliers[speedSettingValue];
        
        const spd = (CONFIG.animationBaseSpeedFactor * 0.8) * currentSpeedMultiplier;
        let dur = (width > 0 && spd > 0) ? (width / spd) : 10; 
        if (dur <= 0.05 && width > 0) dur = 0.05; 
        else if (dur <=0) dur = 10; 

        log.info(`SetupScrollAnimation: unitWidth=${width}, baseSpeedFactor=${CONFIG.animationBaseSpeedFactor}, speedMultiplier=${currentSpeedMultiplier}, effectiveSpd=${spd}, duration=${dur}s`);

        animationStyleElement = document.createElement('style');
        animationStyleElement.textContent = `
            @keyframes ${an} {
                0% { transform: translateX(0); }
                100% { transform: translateX(-${width}px); }
            }
            #ipv4-scroll-content {
                animation: ${an} ${dur}s linear infinite;
            }
            #ipv4-scroll-content:hover {
                animation-play-state: paused;
            }`;
        document.head.appendChild(animationStyleElement);
    } catch (e) {
        log.warn('Error in setupScrollAnimation:', e);
        try {
            element.style.transition = 'transform 60s linear'; 
            element.style.transform = 'translateX(0)';
            void element.offsetWidth;
            element.style.transform = 'translateX(-3000px)';
        } catch (e2) {
            log.warn('Animation fallback failed:', e2);
        }
    }
}

  async function fetchData() {
    log.info("fetchData called. States:", {isDestroyed, bannerExists: bannerExists(), bannerCreated, isMinimized, isFetchingData});
    const titleElForFetch = document.getElementById('ipv4-title');
    if (isDestroyed) return; 
    if (isFetchingData) { return; }
    if (!bannerExists() || !bannerCreated) {
      if (retryCount >= CONFIG.maxRetries) { log.warn(`Max retries (${CONFIG.maxRetries}) for banner create.`); return; }
      log.info(`Banner not ready, create attempt ${retryCount + 1}`); retryCount++; bannerCreated = false;
      createBanner().then(cr=>{if(cr){log.info("Banner created from fetchData.");}else{log.warn("Banner creation failed.");}});return;
    }
    if (isMinimized && hasFetchedData && !isDragExpanding) { log.info("fetchData: Minimized, hasData, deferring."); return; }
    isFetchingData = true;
    if (titleElForFetch) { titleElForFetch.style.pointerEvents = 'none'; }
    log.info("Proceeding to fetch data.");
    const reEnableTitleClick = () => { if (titleElForFetch) { titleElForFetch.style.pointerEvents = 'auto'; } };
    if (isChromeAvailable()) {
      try {
        const requestBody = await getRequestBody();
        fetchViaBackground(requestBody, reEnableTitleClick);
      } catch (error) {
        log.error("Error constructing request body:", error);
        renderItems(fallbackData[currentViewMode]);
        isFetchingData = false;
        reEnableTitleClick();
      }
    } else {
      log.info('Chrome n/a, using fallback fetch.');
      renderItems(fallbackData[currentViewMode]);
      isFetchingData = false;
      reEnableTitleClick();
    }
  }
  function fetchViaBackground(requestBodyObject, callbackOnFinish) {
    log.info("Fetching data via background script for URL:", getCurrentApiEndpoint());
    chrome.runtime.sendMessage({type:'fetchData',url:getCurrentApiEndpoint(),body:JSON.stringify(requestBodyObject)}, r => {
      try {
        if(chrome.runtime.lastError) {
          log.warn('Runtime err from bg:', chrome.runtime.lastError.message);
          renderItems(fallbackData[currentViewMode]);
          return;
        }
        if(r && r.success && r.data) {
          log.info("Success from bg. Raw data snippet:", r.data.substring(0,200));
          try {
            const d = JSON.parse(r.data);
            log.info("Parsed data from bg:", d);
            if(d && Array.isArray(d.items)) {
              if(d.items.length > 0) {
                log.info("Parsed items count:", d.items.length);
                renderItems(d.items);
                // Check notifications only for New Listings view
                if (currentViewMode === VIEW_MODES.NEW_LISTINGS) {
                  checkNotifications(d.items);
                }
              } else {
                log.info("Parsed items empty. Rendering 'No Data'.");
                renderItems([]);
              }
              return;
            }
            log.warn('Parsed data.items not array or missing:', d);
            renderItems([]);
          } catch(e) {
            log.error('Error parsing API resp JSON:', e, "Raw data:", r.data);
            renderItems([]);
          }
        } else if(r && r.error) {
          log.warn('API error from bg:', r.error, "Details:", r.details);
          renderItems(fallbackData[currentViewMode]);
        } else {
          log.warn('Unknown resp from bg:', r);
          renderItems(fallbackData[currentViewMode]);
        }
      } finally {
        isFetchingData = false;
        if (callbackOnFinish) callbackOnFinish();
        log.info("isFetchingData flag reset to false in fetchViaBackground callback.");
      }
    });
  }
  async function initialize() { log.info('Initializing banner script...'); const lockAcquired = await acquireInitLock(); if (!lockAcquired) { log.warn('Could not acquire init lock. Aborted.'); return; } log.info("Init lock acquired."); const oldBanner = document.getElementById('ipv4-banner'); if (oldBanner) { log.warn('Old banner found. Removing.'); try { oldBanner.parentNode.removeChild(oldBanner); bannerCreated = false; } catch(e) { log.error("Error removing old banner:", e); }} try { initialViewportWidth = getViewportWidth(); log.info("Getting settings..."); await getAllSettings(); currentViewMode = await getSavedViewMode(); isMinimized = await getSavedMinimizedState(); log.info("Pre-creation states:", { currentViewMode, isMinimized }); log.info("Creating banner..."); const created = await createBanner(); if (created) { log.info("Banner created successfully in initialize."); if (!isMinimized && hasFetchedData) { const scrollContent = document.getElementById('ipv4-scroll-content'); if (scrollContent && scrollContent.innerHTML !== '') { let contentWidth = 1000; const tempEl = document.createElement('div'); tempEl.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font-size:12px;font-family:Arial,sans-serif;'; const uniqueTickerText = scrollContent.innerHTML.split('&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(10))[0] + '&nbsp;&nbsp;&nbsp;&nbsp;'; tempEl.innerHTML = uniqueTickerText; document.body.appendChild(tempEl); contentWidth = tempEl.scrollWidth; document.body.removeChild(tempEl); if (contentWidth < 100) contentWidth = 1000; log.info("Re-applying animation with updated speed post-initialize."); setupScrollAnimation(scrollContent, contentWidth); } } setTimeout(setupMutationObserver, 1000); if (fetchIntervalId) clearInterval(fetchIntervalId); fetchIntervalId = setInterval(fetchData, CONFIG.refreshInterval); log.info(`Refresh interval set: ${CONFIG.refreshInterval / 1000}s.`); if (notificationIntervalId) clearInterval(notificationIntervalId); notificationIntervalId = setInterval(fetchNewListingsForNotifications, CONFIG.refreshInterval); setTimeout(fetchNewListingsForNotifications, 3000); log.info('Notification check interval set.'); setTimeout(() => { const b = document.getElementById('ipv4-banner'); if (b) { log.info("Final position check."); enforceLeftEdgeGap(b); ensureBannerInViewport(b); }}, 500); } else { log.error("Initialization failed: createBanner() returned false."); releaseInitLock(); } addCleanupListeners(); } catch (e) { log.error('CRITICAL ERROR during main initialization:', e, e.stack); releaseInitLock(); } }
  function setupMutationObserver() { if(!CONFIG.mutationObserverEnabled||isDestroyed||observer)return;try{observer=new MutationObserver(m=>{if(isDestroyed)return;for(const mu of m){if(mu.type==='childList'){const b=document.getElementById('ipv4-banner');if(bannerCreated&&!b && !isDestroyed ){const n=Date.now();if(recreationCount>=CONFIG.recreationMaxCount){log.warn(`Banner removed ${recreationCount} times, giving up.`);return;}if(n-lastRecreationTime<CONFIG.recreationDelay){setTimeout(()=>{if(!bannerExists()&&!isDestroyed){log.warn(`Banner removed, recreating (attempt ${recreationCount+1}) delayed`);recreationCount++;lastRecreationTime=Date.now();createBanner().then(ok => { if(ok && !isMinimized && bannerExists()) fetchData(); });}},CONFIG.recreationDelay);}else{log.warn(`Banner removed, recreating (attempt ${recreationCount+1})`);recreationCount++;lastRecreationTime=n;createBanner().then(ok => { if(ok && !isMinimized && bannerExists()) fetchData(); });}}return;}}});observer.observe(document.body,{childList:true,subtree:false});log.info("MutationObserver setup.");}catch(e){log.warn('Error setup MutationObserver:',e);}}
  function addCleanupListeners() { try{window.addEventListener('pagehide',function(event){cleanup(false, event);});window.addEventListener('beforeunload',function(event){cleanup(false, event);});log.info("Cleanup listeners added.");}catch(e){log.warn('Error setup cleanup listeners:',e);}}
  function cleanup(fullCleanup = false, event = null) { 
    log.info('Cleaning up resources. Full cleanup:', fullCleanup, "Event type:", event ? event.type : "N/A"); 
    
    if (fullCleanup && isDestroyed && bannerCreated === false) return; 
    
    if (isDestroyed && !fullCleanup) { 
        if (observer) { observer.disconnect(); observer = null; } 
        return;
    }

    if (fetchIntervalId) { clearInterval(fetchIntervalId); fetchIntervalId = null; }
    if (notificationIntervalId) { clearInterval(notificationIntervalId); notificationIntervalId = null; } 
    if (animationStyleElement && animationStyleElement.parentNode) { try { animationStyleElement.parentNode.removeChild(animationStyleElement); } catch(e){} animationStyleElement = null; } 
    window.removeEventListener('resize', handleWindowResize); 
    if (observer) { observer.disconnect(); observer = null; } 
    
    const banner = document.getElementById('ipv4-banner');
    const submenu = document.getElementById('ipv4-gear-submenu');
    if (fullCleanup) {
        isDestroyed = true;
        if (banner && banner.parentNode) {
            try { banner.parentNode.removeChild(banner); log.info("Banner removed from DOM due to full cleanup."); }
            catch (e) { log.warn('Error removing banner during full cleanup:', e); }
        }
        if (submenu && submenu.parentNode) {
            try { submenu.parentNode.removeChild(submenu); log.info("Submenu removed from DOM due to full cleanup."); }
            catch (e) { log.warn('Error removing submenu during full cleanup:', e); }
        }
        bannerCreated = false;
        releaseInitLock();
    } else if (banner && event && (event.type === 'pagehide' || event.type === 'beforeunload')) {
        log.info(`Cleanup for ${event.type}: Not removing banner from DOM, observer disconnected.`);
    }
  }

  log.info("Preparing to initialize based on document.readyState...");
  if (document.readyState === 'complete') { log.info("Document already complete. Initializing..."); try { initialize(); } catch (e) { log.error("ERROR CALLING initialize() directly (doc complete):", e.message, e.stack); }
  } else { log.info("Document not complete. Adding event listener for 'load'."); window.addEventListener('load', () => { log.info("Window 'load' event fired. Attempting to call initialize()..."); try { initialize(); } catch (e) { log.error("ERROR CALLING initialize() from 'load' event listener:", e.message, e.stack); try { let errorPingDiv = document.createElement('div'); errorPingDiv.id = 'ipv4_banner_load_error_ping'; errorPingDiv.textContent = 'LOAD LISTENER ERROR PING'; errorPingDiv.style.position = 'fixed'; errorPingDiv.style.top = '20px'; errorPingDiv.style.left = '0px'; errorPingDiv.style.backgroundColor = 'red'; errorPingDiv.style.color = 'white'; errorPingDiv.style.zIndex = '2147483647'; if(document.body) document.body.appendChild(errorPingDiv); } catch (pingError) { console.error("Could not even add error ping div:", pingError); } } log.info("Callback for 'load' event finished."); });
  }
})();