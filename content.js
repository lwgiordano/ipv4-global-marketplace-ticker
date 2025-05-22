(async function() { // Make the IIFE async to use await for storage
  // Initial log to confirm script start
  console.log('[IPv4 Banner] content.js script executing (v19 - enhanced lock debug)...');

  // CONFIGURATION
  const CONFIG = {
    refreshInterval: 60000,
    priorSalesApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/priorSales',
    newListingsApi: 'https://y1dq7hifob.execute-api.eu-west-1.amazonaws.com/prod/api/currentListing',
    animationSpeed: 50,
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
    rirFilterStorageKey: 'selectedRir'
  };
  const log = {
    info: function(msg, ...args) { if (CONFIG.debug) console.log('[IPv4 Banner]', msg, ...args); },
    warn: function(msg, ...args) { console.warn('[IPv4 Banner]', msg, ...args); },
    error: function(msg, ...args) { console.error('[IPv4 Banner]', msg, ...args); }
  };
  log.info('CONFIG and log object defined.');


  // --- Early check for excluded domain ---
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
  // --- End of excluded domain check ---

  // EARLY EXIT CHECK for page type
  log.info('Performing early exit check for page type...');
  if (!document || !document.body || document.documentElement.nodeName !== 'HTML' || window !== window.top || window.location.pathname.match(/\.(ico|png|jpg|jpeg|gif|css|js|json|svg|xml|pdf)$/i)) {
    log.info('[IPv4 Banner] Early exit: Not a suitable page or frame.');
    return;
  }
  log.info('[IPv4 Banner] Early exit check for page type passed.');

  // VIEW MODES & STATE VARIABLES
  const VIEW_MODES = { PRIOR_SALES: 'priorSales', NEW_LISTINGS: 'newListings' };
  let bannerCreated = false; let animationStyleElement = null; let fetchIntervalId = null; let isDestroyed = false; let retryCount = 0; let recreationCount = 0; let lastRecreationTime = 0; let observer = null; let isMinimized = false; let isDragExpanding = false; let hasFetchedData = false; let isDuringToggleTransition = false; let preMinimizeWidth = null; let preMinimizeWidthPercent = null; let isAtMaxWidth = false; let initialViewportWidth = 0; let lastPositioningTime = 0; let currentViewMode = VIEW_MODES.PRIOR_SALES;
  let dragState = { isDragging: false, startY: 0, startX: 0, startTop: 0, startLeft: 0, startRight: 0, isHorizontalDrag: false, isVerticalDrag: false, startWidth: 0, isUsingTop: true, isUsingLeft: false, lastDragTime: 0, resizingDirection: null, initialClickX: 0, dragDistance: 0, lastWidth: 0, dragStartViewportX: 0, wasNearLeftEdge: false, draggedRightward: false, alwaysUseRight: true, ignoreLeftPositioning: false, expandMinX: 0, initialExpandWidth: CONFIG.initialDragExpandWidth, };
  let resizeTimeout = null; let settingsLoaded = false; let currentSettings = {};
  let isFetchingData = false;
  log.info('State variables defined.');

  const fallbackData = { [VIEW_MODES.PRIOR_SALES]: [ { block: 19, region: "arin", pricePerAddress: "$29" }, { block: 24, region: "arin", pricePerAddress: "$32.5" },{ block: 19, region: "ripe", pricePerAddress: "$30" }, { block: 22, region: "ripe", pricePerAddress: "$31.9" },{ block: 22, region: "lacnic", pricePerAddress: "$34.5" }, { block: 22, region: "arin", pricePerAddress: "$34" },{ block: 24, region: "arin", pricePerAddress: "$36" } ], [VIEW_MODES.NEW_LISTINGS]: [ { block: 24, region: "arin", askingPrice: "$35" }, { block: 22, region: "ripe", askingPrice: "$31.5" }, { block: 23, region: "apnic", askingPrice: "$32" }, { block: 21, region: "arin", askingPrice: "$30" }, { block: 24, region: "lacnic", askingPrice: "$33.5" }, { block: 23, region: "arin", askingPrice: "$31" }, { block: 22, region: "arin", askingPrice: "$29.5" } ] };
  log.info('Fallback data defined.');


  // --- HELPER FUNCTIONS ---
  function isChromeAvailable() { try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage; } catch (e) { return false; } }
  async function getAllSettings() { return new Promise(resolve => { if (!isChromeAvailable()) { resolve(currentSettings); return; } chrome.storage.local.get(null, items => { if (chrome.runtime.lastError) { log.warn('Error reading all settings:', chrome.runtime.lastError.message); resolve(currentSettings); } else { currentSettings = items || {}; settingsLoaded = true; resolve(currentSettings); } }); }); }
  async function getSetting(key, defaultValue) { if (settingsLoaded && key in currentSettings) return currentSettings[key]; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(defaultValue); return; } chrome.storage.local.get([key], result => { if (chrome.runtime.lastError) { log.warn(`Error reading setting ${key}:`, chrome.runtime.lastError.message); resolve(defaultValue); } else { const value = result[key]; currentSettings[key] = value; resolve(value !== undefined ? value : defaultValue); } }); }); }
  async function saveSetting(key, value) { currentSettings[key] = value; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(); return; } chrome.storage.local.set({ [key]: value }, () => { if (chrome.runtime.lastError) log.warn(`Error saving setting ${key}:`, chrome.runtime.lastError.message); resolve(); }); }); }
  async function removeSetting(key) { delete currentSettings[key]; return new Promise(resolve => { if (!isChromeAvailable()) { resolve(); return; } chrome.storage.local.remove(key, () => { if (chrome.runtime.lastError) log.warn(`Error removing setting ${key}:`, chrome.runtime.lastError.message); resolve(); }); }); }

  async function acquireInitLock() {
    return new Promise(resolve => {
      if (!isChromeAvailable()) {
        log.info("Chrome API not available, skipping lock mechanism.");
        resolve(true);
        return;
      }
      chrome.storage.local.get([CONFIG.initializationLock], result => {
        if (chrome.runtime.lastError) {
          log.error('CRITICAL (GET_LOCK_FAIL): Error GETTING lock state from chrome.storage.local:', chrome.runtime.lastError.message);
          log.warn('acquireInitLock resolving FALSE due to GET_LOCK_FAIL.'); // Explicit log
          resolve(false);
          return;
        }
        const now = Date.now();
        const lockData = result[CONFIG.initializationLock];
        if (lockData && (now - lockData) < CONFIG.initLockTimeout) {
          const expiresIn = Math.round((CONFIG.initLockTimeout - (now - lockData)) / 1000);
          log.info(`Another instance appears to hold the lock (created ${new Date(lockData).toLocaleTimeString()}, expires in approx. ${expiresIn}s). This instance will wait and retry.`);
          setTimeout(() => { acquireInitLock().then(acquired => resolve(acquired)); }, 750);
          return;
        }
        log.info("Attempting to acquire initialization lock by writing to storage...");
        chrome.storage.local.set({ [CONFIG.initializationLock]: now }, () => {
          if (chrome.runtime.lastError) {
            log.error('CRITICAL (SET_LOCK_FAIL): Failed to SET new lock in chrome.storage.local:', chrome.runtime.lastError.message);
            log.warn('acquireInitLock resolving FALSE due to SET_LOCK_FAIL.'); // Explicit log
            resolve(false);
          } else {
            log.info('Lock acquired successfully by this instance at', new Date(now).toLocaleTimeString());
            resolve(true);
          }
        });
      });
    });
  }

  function releaseInitLock() { if (!isChromeAvailable()) return; log.info("Releasing initialization lock from storage."); chrome.storage.local.remove(CONFIG.initializationLock, () => { if (chrome.runtime.lastError) { log.warn('Error releasing lock from storage:', chrome.runtime.lastError.message); } else { log.info('Lock successfully released from storage.'); } }); }
  async function getSavedViewMode() { try { const mode = await getSetting(CONFIG.viewModeKey); if (mode === VIEW_MODES.PRIOR_SALES || mode === VIEW_MODES.NEW_LISTINGS) return mode; } catch (e) { log.warn('Error reading saved view mode:', e); } return VIEW_MODES.PRIOR_SALES; }
  async function saveViewMode(mode) { try { await saveSetting(CONFIG.viewModeKey, mode); } catch (e) { log.warn('Error saving view mode:', e); } }
  async function toggleViewMode() { currentViewMode = currentViewMode === VIEW_MODES.PRIOR_SALES ? VIEW_MODES.NEW_LISTINGS : VIEW_MODES.PRIOR_SALES; await saveViewMode(currentViewMode); const titleEl = document.getElementById('ipv4-title'); if (titleEl) { titleEl.innerHTML = currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales:' : 'New Listings:'; titleEl.title = currentViewMode === VIEW_MODES.PRIOR_SALES ? "Click to switch to New Listings" : "Click to switch to Prior Sales"; } log.info("View mode toggled, fetching data for:", currentViewMode); hasFetchedData = false; fetchData(); }
  async function getSavedPosition() { try { const savedPos = await getSetting(CONFIG.storageKey); if (savedPos) { const vh = getViewportHeight(); if (savedPos.top) { const tv = parseInt(savedPos.top); if (!isNaN(tv) && tv > vh - CONFIG.bannerHeight) return { top: Math.max(0, vh - CONFIG.bannerHeight - 50) + 'px' }; } if (savedPos.bottom) { const bv = parseInt(savedPos.bottom); if (!isNaN(bv) && bv > vh - CONFIG.bannerHeight) return { bottom: Math.max(0, vh - CONFIG.bannerHeight - 50) + 'px' }; } return savedPos; } } catch (e) { log.warn('Error reading pos:', e); } return { top: '10px' }; }
  async function savePosition(pos) { try { const vh = getViewportHeight(); const vp = {...pos}; if (vp.top) { const tv = parseInt(vp.top); if (!isNaN(tv)) { if (tv > vh - CONFIG.bannerHeight) vp.top = Math.max(0, vh - CONFIG.bannerHeight - 10) + 'px'; if (tv < 0) vp.top = '0px'; }} if (vp.bottom) { const bv = parseInt(vp.bottom); if (!isNaN(bv)) { if (bv > vh - CONFIG.bannerHeight) vp.bottom = Math.max(0, vh - CONFIG.bannerHeight - 10) + 'px'; if (bv < 0) vp.bottom = '0px'; }} await saveSetting(CONFIG.storageKey, vp); } catch (e) { log.warn('Error saving pos:', e); } }
  async function clearLeftPosition() { try { await removeSetting(CONFIG.leftPosKey); } catch (e) { log.warn('Error clear left pos:', e); } }
  async function getSavedLeftPosition() { if (dragState.alwaysUseRight) return null; try { const sp = await getSetting(CONFIG.leftPosKey); if (sp !== null && sp !== undefined) { const p = parseInt(sp); if (!isNaN(p) && p >= 0) return p; }} catch (e) { log.warn('Error read left pos:', e); } return null; }
  async function saveLeftPosition(pos) { if (dragState.alwaysUseRight) { await clearLeftPosition(); return; } try { if (pos === null || pos < 0) await clearLeftPosition(); else await saveSetting(CONFIG.leftPosKey, pos.toString()); } catch (e) { log.warn('Error save left pos:', e); }}
  function calculateWidthPercentage(pw) { const vw = getViewportWidth(); if (vw <= 0) return 50; return Math.min(100, Math.max(1, (pw / vw) * 100)); }
  function isWidthAtMax(w) { return Math.abs(w - calculateMaxBannerWidth()) <= CONFIG.maxWidthTolerance; }
  async function getSavedWidth() { try { if (await getSetting(CONFIG.maxWidthFlag, false)) { isAtMaxWidth = true; return calculateMaxBannerWidth(); } const wp = await getSetting(CONFIG.widthPercentKey); if (wp !== null && wp !== undefined) { const p = parseFloat(wp); if (!isNaN(p) && p > 0 && p <= 100) { const pxw = Math.round((p / 100) * getViewportWidth()); return Math.min(calculateMaxBannerWidth(), Math.max(CONFIG.minWidth, pxw)); }} const sw = await getSetting(CONFIG.widthKey); if (sw !== null && sw !== undefined) { const w = parseInt(sw); if (!isNaN(w) && w >= CONFIG.minWidth && w <= CONFIG.maxWidth) return w; }} catch (e) { log.warn('Error read width:', e); } return CONFIG.defaultWidth; }
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
  function _createDragHandleElement() { const dh = document.createElement('div'); dh.id = 'ipv4-drag-handle'; for (let i=0;i<3;i++) { const d=document.createElement('div'); dh.appendChild(d); } dh.title = "Drag to move • Drag left/right to resize"; return dh;}
  function _createLogoLinkElement() { const ll = document.createElement('a'); ll.id = 'ipv4-logo-link'; ll.href = 'https://auctions.ipv4.global'; ll.target = '_blank'; return ll;}
  function _createTitleElement(initialViewMode) { const t = document.createElement('span'); t.id = 'ipv4-title'; t.classList.add('banner-title-style'); t.title = initialViewMode === VIEW_MODES.PRIOR_SALES ? "Click to switch to New Listings" : "Click to switch to Prior Sales"; t.innerHTML = initialViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales:' : 'New Listings:'; const vp = 4; t.style.lineHeight = `${CONFIG.bannerHeight - vp}px`; t.addEventListener('click', (e) => {e.preventDefault();e.stopPropagation();toggleViewMode();}); return t;}
  function _createScrollContainerElement() { const sc = document.createElement('div'); sc.id = 'ipv4-scroll-container'; const scc = document.createElement('div'); scc.id = 'ipv4-scroll-content'; sc.appendChild(scc); return sc;}
  function _createToggleButtonElement(initialIsMinimized) { const tb = document.createElement('div'); tb.id = 'ipv4-toggle-button'; tb.innerHTML = initialIsMinimized ? '◀':'▶'; tb.title = initialIsMinimized ? 'Expand':'Minimize'; tb.style.marginLeft = `${initialIsMinimized ? CONFIG.minimizedSpacing : CONFIG.normalSpacing}px`; tb.onclick = (e)=>{e.preventDefault();e.stopPropagation();const b=document.getElementById('ipv4-banner'); if(b)toggleMinimized(b);}; return tb;}
  function prepareBannerForExpansion(b) { log.info("Preparing banner for expansion"); b.classList.remove('ipv4-banner-minimized'); b.style.width='';b.style.maxWidth='';b.style.minWidth=''; const t=document.getElementById('ipv4-title'); const sc=document.getElementById('ipv4-scroll-container'); if(t)t.classList.remove('ipv4-element-hidden'); if(sc)sc.classList.remove('ipv4-element-hidden'); const tb=document.getElementById('ipv4-toggle-button'); if(tb){tb.innerHTML='▶';tb.title='Minimize';tb.style.marginLeft=`${CONFIG.normalSpacing}px`;} updateLogo(false);}
  function startDragExpansion(b,e) {log.info("Starting drag expansion"); if(!b||!isMinimized){log.warn("Cannot start drag expansion"); return false;} isDragExpanding=true; dragState.expandMinX=e.clientX; b.style.transition='none'; prepareBannerForExpansion(b); const iw=Math.max(CONFIG.minWidth,CONFIG.initialDragExpandWidth); dragState.initialExpandWidth=iw; b.style.width=iw+'px'; log.info("Drag expansion started, initial width:",iw); return true;}
  function handleDragExpansion(b,e) {if(!b||!isDragExpanding)return false; const dX=dragState.expandMinX-e.clientX; let nW=dragState.initialExpandWidth+dX; nW=Math.max(CONFIG.minWidth,nW); const vW=getViewportWidth(); const brE=parseInt(window.getComputedStyle(b).right); const maW=vW-CONFIG.edgeGap-brE; nW=Math.min(nW,maW); b.style.width=nW+'px'; dragState.lastWidth=nW; return true;}
  function finishDragExpansion(b) {log.info("Finishing drag expansion"); if(!b||!isDragExpanding)return false; b.style.transition='width 0.1s ease-out'; const fW=Math.max(CONFIG.minWidth,dragState.lastWidth); b.style.width=fW+'px'; log.info("Drag finished, width:",fW); saveWidth(fW); isMinimized=false; saveMinimizedState(false); isDragExpanding=false; if(isWidthAtMax(fW)){const mW=calculateMaxBannerWidth();b.style.width=mW+'px';saveWidth(mW);} if(!hasFetchedData){log.info("Fetching data post-drag");fetchData();} ensureBannerInViewport();ensureToggleButtonVisible(b); setTimeout(()=>{if(b)b.style.transition='';},100); return true;}
  function cancelDragExpansion(b) {log.info("Cancelling drag expansion"); if(!b||!isDragExpanding)return false; isMinimized=true; saveMinimizedState(true); b.classList.add('ipv4-banner-minimized');b.style.width=''; const t=document.getElementById('ipv4-title');const sc=document.getElementById('ipv4-scroll-container'); if(t)t.classList.add('ipv4-element-hidden');if(sc)sc.classList.add('ipv4-element-hidden'); const tb=document.getElementById('ipv4-toggle-button'); if(tb){tb.innerHTML='◀';tb.title='Expand';tb.style.marginLeft=`${CONFIG.minimizedSpacing}px`;} updateLogo(true);isDragExpanding=false;return true;}
  function enforceLeftEdgeGap(b){if(!b||isMinimized||isDragExpanding)return false;const vW=getViewportWidth();const bW=b.offsetWidth;const cs=window.getComputedStyle(b);const cR=cs.right==='auto'?null:parseInt(cs.right);if(cR!==null){const iL=vW-bW-cR;if(iL<CONFIG.edgeGap){const nW=vW-cR-CONFIG.edgeGap;if(nW>=CONFIG.minWidth){b.style.width=nW+'px';saveWidth(nW);return true;}}}return false;}
  function bannerExists(){ const banner = document.getElementById('ipv4-banner'); return banner !== null && document.body.contains(banner); }
  function checkContentOverflow(b){if(!b||isMinimized||isDuringToggleTransition||isDragExpanding)return false;const tb=document.getElementById('ipv4-toggle-button');const t=document.getElementById('ipv4-title');const dh=document.getElementById('ipv4-drag-handle');if(!tb||!t||!dh)return false;const fW=dh.offsetWidth+t.offsetWidth+tb.offsetWidth+CONFIG.overflowCheckExtraPadding;if(b.offsetWidth<fW+20)return true;return false;}
  function isNearLeftEdge(b){if(!b)return false;const cs=window.getComputedStyle(b);const cL=cs.left==='auto'?null:parseInt(cs.left);return cL!==null&&cL<=CONFIG.leftEdgeThreshold;}
  function constrainBannerToViewport(b){ /* ... */ }
  function ensureToggleButtonVisible(b){ /* ... */ }
  function positionToRightSide(b){if(!b)return false;b.style.left='auto';b.style.right=CONFIG.edgeGap+'px';dragState.isUsingLeft=false;clearLeftPosition();lastPositioningTime=Date.now();return true;}
  function ensureBannerInViewport(banner){ if(!banner) banner = document.getElementById('ipv4-banner'); if(!banner) return; /* ... */ }
  function toggleMinimized(banner, force = null) { if (!banner || isDuringToggleTransition || isDragExpanding) return; log.info("Toggling minimized. Force:", force, "Current:", isMinimized); isDuringToggleTransition = true; document.body.style.cursor = ''; if (banner) banner.style.cursor = ''; if (force !== null) { isMinimized = force; } else { isMinimized = !isMinimized; } saveMinimizedState(isMinimized); log.info("New isMinimized state:", isMinimized); if (dragState.alwaysUseRight || isMinimized) { positionToRightSide(banner); } const titleEl = document.getElementById('ipv4-title'); const scrollContainer = document.getElementById('ipv4-scroll-container'); const toggleButton = document.getElementById('ipv4-toggle-button'); updateLogo(isMinimized); if (toggleButton) { toggleButton.innerHTML = isMinimized ? '◀' : '▶'; toggleButton.title = isMinimized ? 'Expand' : 'Minimize'; toggleButton.style.marginLeft = `${isMinimized ? CONFIG.minimizedSpacing : CONFIG.normalSpacing}px`; } if (!isMinimized) { log.info("Expanding banner (button click)"); banner.classList.remove('ipv4-banner-minimized'); if (titleEl) titleEl.classList.remove('ipv4-element-hidden'); if (scrollContainer) scrollContainer.classList.remove('ipv4-element-hidden'); let currentMinimizedWidth = banner.offsetWidth; if (currentMinimizedWidth < CONFIG.minWidth / 2 || currentMinimizedWidth > CONFIG.minWidth * 1.5 ) { const dragHandleWidth = document.getElementById('ipv4-drag-handle')?.offsetWidth || 16; const logoLinkWidth = document.getElementById('ipv4-logo-link')?.offsetWidth || 30; const toggleBtnWidth = toggleButton?.offsetWidth || 20; currentMinimizedWidth = dragHandleWidth + logoLinkWidth + toggleBtnWidth + (CONFIG.minimizedSpacing * 2) + 16; } banner.style.width = currentMinimizedWidth + 'px'; log.info("Start expand animation from width:", currentMinimizedWidth); void banner.offsetWidth; banner.style.transition = 'width ' + CONFIG.minimizeAnimationDuration + 'ms ease-out'; getSavedWidth().then(sw => { const mtu = calculateMaxBannerWidth(); let fw = isAtMaxWidth ? mtu : Math.min(sw, mtu); if (preMinimizeWidth && !isAtMaxWidth && preMinimizeWidth >= CONFIG.minWidth) { fw = Math.min(preMinimizeWidth, mtu); } fw = Math.max(CONFIG.minWidth, fw); banner.style.width = fw + 'px'; log.info("Expanding to target width:", fw); saveWidth(fw); }); if (!hasFetchedData) { log.info("Fetching data on expand as hasFetchedData is false."); fetchData(); } else {log.info("Already hasFetchedData, not fetching on expand.");} } else { log.info("Minimizing banner"); const cw = banner.offsetWidth; if (cw >= CONFIG.minWidth) { preMinimizeWidth = cw; preMinimizeWidthPercent = calculateWidthPercentage(cw); } banner.style.width = cw + 'px'; banner.offsetHeight; banner.style.transition = 'width ' + CONFIG.minimizeAnimationDuration + 'ms ease-in'; const dhw = document.getElementById('ipv4-drag-handle')?.offsetWidth || 16; const llw = document.getElementById('ipv4-logo-link')?.offsetWidth || CONFIG.minIconSize; const tbw = toggleButton?.offsetWidth || 20; const amcw = dhw + llw + tbw + (CONFIG.minimizedSpacing * 3) + 16 ; banner.style.width = amcw + 'px'; log.info("Minimizing: animating to width approx:", amcw); setTimeout(() => { banner.classList.add('ipv4-banner-minimized'); if (titleEl) titleEl.classList.add('ipv4-element-hidden'); if (scrollContainer) scrollContainer.classList.add('ipv4-element-hidden'); banner.style.width = ''; }, CONFIG.minimizeAnimationDuration); } setTimeout(() => { if (banner) banner.style.transition = ''; if (!isMinimized) { setTimeout(() => { if (checkContentOverflow(banner)) { log.info("Content overflow after expand, minimizing again."); toggleMinimized(banner, true); } }, CONFIG.minimizeDelay); } isDuringToggleTransition = false; ensureBannerInViewport(banner); log.info("Toggle minimized transition complete."); }, CONFIG.minimizeAnimationDuration + 50); }
  function updateLogo(minimizedState) { const ll=document.getElementById('ipv4-logo-link'); if(!ll)return; ll.innerHTML=''; if(isChromeAvailable()){try{const l=document.createElement('img');l.id='ipv4-logo';l.alt='IPv4.Global Logo';if(minimizedState){l.src=chrome.runtime.getURL('assets/icon-48x48.png');l.style.height=`${CONFIG.minIconSize}px`;l.style.width=`${CONFIG.minIconSize}px`;}else{l.src=chrome.runtime.getURL('assets/logo.png');l.style.height='16px';l.style.width='auto';}l.onerror=()=>{ll.innerHTML='';ll.appendChild(createTextLogo());};ll.appendChild(l);return;}catch(e){log.info('Failed img logo:',e);}}ll.appendChild(createTextLogo());}
  async function updateMinimizedState(banner) { if(!banner||isDuringToggleTransition)return; const t=document.getElementById('ipv4-title');const sc=document.getElementById('ipv4-scroll-container'); banner.classList.toggle('ipv4-banner-minimized',isMinimized);if(t)t.classList.toggle('ipv4-element-hidden',isMinimized);if(sc)sc.classList.toggle('ipv4-element-hidden',isMinimized); if(!isMinimized){let tw;if(isAtMaxWidth){tw=calculateMaxBannerWidth();}else{let sw;if(preMinimizeWidthPercent!==null&&preMinimizeWidthPercent>0){sw=Math.round((preMinimizeWidthPercent/100)*getViewportWidth());}else if(preMinimizeWidth!==null&&preMinimizeWidth>=CONFIG.minWidth){sw=preMinimizeWidth;}else{sw=await getSavedWidth();}tw=Math.min(sw,calculateMaxBannerWidth());}banner.style.width=tw+'px';if(banner.style.width!==tw+'px'){saveWidth(tw);}enforceLeftEdgeGap(banner);}else{banner.style.width='';positionToRightSide(banner);}}
  function handleWindowResize() { if(isDestroyed||!bannerExists())return;const b=document.getElementById('ipv4-banner');if(!b)return;const cVW=getViewportWidth();const cW=b.offsetWidth;const mW=calculateMaxBannerWidth();if(isAtMaxWidth&&!isMinimized){b.style.width=mW+'px';saveWidth(mW);enforceLeftEdgeGap(b);}else if(!isMinimized&&cW>mW){b.style.width=mW+'px';saveWidth(mW);enforceLeftEdgeGap(b);}if(resizeTimeout)clearTimeout(resizeTimeout);resizeTimeout=setTimeout(()=>{const bn=document.getElementById('ipv4-banner');if(!bn)return;const curVW=getViewportWidth();const wChg=Math.abs(curVW-initialViewportWidth);const maxW=calculateMaxBannerWidth();const curW=bn.offsetWidth;if(isMinimized){positionToRightSide(bn);}else if(dragState.alwaysUseRight){positionToRightSide(bn);if(isAtMaxWidth){bn.style.width=maxW+'px';saveWidth(maxW);}else if(!isMinimized&&curW>maxW){bn.style.width=maxW+'px';saveWidth(maxW);}enforceLeftEdgeGap(bn);}else if(wChg>CONFIG.windowResizeThreshold){if(dragState.isUsingLeft&&isNearLeftEdge(bn)){positionToRightSide(bn);}initialViewportWidth=curVW;if(curVW<initialViewportWidth&&!isMinimized){if(curW>maxW){bn.style.width=maxW+'px';saveWidth(maxW);}}}else if(!isMinimized){enforceLeftEdgeGap(bn);}ensureBannerInViewport(bn);if(dragState.isUsingLeft&&!isMinimized&&!dragState.ignoreLeftPositioning){const cL=parseInt(window.getComputedStyle(bn).left);const bW=bn.offsetWidth;if(cL+bW>curVW-CONFIG.edgeGap){positionToRightSide(bn);}}constrainBannerToViewport(bn);ensureToggleButtonVisible(bn);},50);}
  function setupDragFunctionality(banner) { const dragHandle = document.getElementById('ipv4-drag-handle'); if (!dragHandle) { log.error("Drag handle #ipv4-drag-handle not found for setup!"); return; } dragHandle.addEventListener('mousedown', function(e) { e.preventDefault();if(isDuringToggleTransition)return;dragState.isDragging=true;dragState.startY=e.clientY;dragState.startX=e.clientX;dragState.initialClickX=e.clientX;dragState.lastDragTime=Date.now(); const cs=window.getComputedStyle(banner);const ct=cs.top==='auto'?null:parseInt(cs.top);const cb=cs.bottom==='auto'?null:parseInt(cs.bottom);const cr=cs.right==='auto'?null:parseInt(cs.right);const cl=cs.left==='auto'?null:parseInt(cs.left);dragState.isUsingTop=(ct!==null&&ct!=='auto');dragState.startPos=dragState.isUsingTop?ct:cb;dragState.startRight=cr;dragState.startLeft=cl;dragState.isUsingLeft=(cl!==null&&cl!=='auto'&&!dragState.alwaysUseRight);dragState.startWidth=banner.offsetWidth;dragState.lastWidth=banner.offsetWidth;dragState.isHorizontalDrag=false;dragState.isVerticalDrag=false;document.addEventListener('mousemove',handleMouseMove);document.addEventListener('mouseup',handleMouseUp);document.body.style.cursor='move';}); function handleMouseMove(e) { if(!dragState.isDragging)return;const deltaX = e.clientX - dragState.startX; const deltaY = e.clientY - dragState.startY; const absX = Math.abs(deltaX); const absY = Math.abs(deltaY); dragState.dragDistance+=Math.abs(e.clientX-dragState.initialClickX);if(!dragState.isHorizontalDrag&&!dragState.isVerticalDrag){if(absX>5||absY>5){if(isMinimized){dragState.isHorizontalDrag=absX>absY*1.5;dragState.isVerticalDrag=!dragState.isHorizontalDrag;}else{dragState.isHorizontalDrag=absX>absY;dragState.isVerticalDrag=!dragState.isHorizontalDrag;}log.info("Drag dir:",{H:dragState.isHorizontalDrag,V:dragState.isVerticalDrag});}}if(isMinimized){if(dragState.isVerticalDrag){handleVerticalDrag(e);return;}if(dragState.isHorizontalDrag&&deltaX<0&&absX>10){if(!isDragExpanding){startDragExpansion(banner,e);}else{handleDragExpansion(banner,e);}return;}return;}if(isDragExpanding){handleDragExpansion(banner,e);return;}if(dragState.isHorizontalDrag&&!isMinimized){const viewportWidth=getViewportWidth();if(dragState.alwaysUseRight||!dragState.isUsingLeft){let newWidth=dragState.startWidth-deltaX;if(deltaX>0&&newWidth<CONFIG.autoMinimizeWidth){log.info("Auto-minimizing (drag right).");preMinimizeWidth=dragState.startWidth;preMinimizeWidthPercent=calculateWidthPercentage(dragState.startWidth);document.body.style.cursor='';if(banner)banner.style.cursor='';toggleMinimized(banner,true);dragState.isDragging=false;return;}const bannerRightPosition=dragState.startRight!==null?dragState.startRight:CONFIG.edgeGap;const maxAllowedWidth=viewportWidth-CONFIG.edgeGap-bannerRightPosition;newWidth=Math.min(newWidth,maxAllowedWidth);newWidth=Math.max(CONFIG.minWidth,newWidth);isAtMaxWidth=isWidthAtMax(newWidth);banner.style.width=newWidth+'px';dragState.lastWidth=newWidth;}else if(dragState.isUsingLeft&&!dragState.ignoreLeftPositioning){let newWidth=dragState.startWidth+deltaX;if(deltaX<0&&newWidth<CONFIG.autoMinimizeWidth){toggleMinimized(banner,true);dragState.isDragging=false;return;}newWidth=Math.max(CONFIG.minWidth,newWidth);const bannerLeftPosition=dragState.startLeft!==null?dragState.startLeft:CONFIG.edgeGap;const maxAllowedWidth=viewportWidth-CONFIG.edgeGap-bannerLeftPosition;newWidth=Math.min(newWidth,maxAllowedWidth);banner.style.width=newWidth+'px';dragState.lastWidth=banner.offsetWidth;}}if(dragState.isVerticalDrag){handleVerticalDrag(e);}dragState.lastDragTime=Date.now();ensureToggleButtonVisible(banner);} function handleVerticalDrag(e) { if(!dragState.isDragging||!dragState.isVerticalDrag)return;const b=document.getElementById('ipv4-banner');if(!b)return;const dY=e.clientY-dragState.startY;const vH=getViewportHeight();if(dragState.isUsingTop){let nT=dragState.startPos+dY;nT=Math.max(0,Math.min(nT,vH-CONFIG.bannerHeight));b.style.top=nT+'px';b.style.bottom='auto';}else{let nB=dragState.startPos-dY;nB=Math.max(0,Math.min(nB,vH-CONFIG.bannerHeight));b.style.bottom=nB+'px';b.style.top='auto';}} function handleMouseUp(e) { if(!dragState.isDragging)return;if(isDragExpanding){finishDragExpansion(banner);}else{if(dragState.isHorizontalDrag&&!isMinimized){const cW=banner.offsetWidth;if(cW>=CONFIG.minWidth)saveWidth(cW);}if(dragState.isVerticalDrag){const cs=window.getComputedStyle(banner);if(dragState.isUsingTop)savePosition({top:cs.top});else savePosition({bottom:cs.bottom});}}dragState.isDragging=false; /* ... reset other dragState ... */ document.removeEventListener('mousemove',handleMouseMove);document.removeEventListener('mouseup',handleMouseUp);document.body.style.cursor='';if(banner)banner.style.cursor='';constrainBannerToViewport(banner);enforceLeftEdgeGap(banner);ensureBannerInViewport(banner);ensureToggleButtonVisible(banner);if(dragState.alwaysUseRight)positionToRightSide(banner);} }
  async function createBanner() { log.info("createBanner. bannerCreated:", bannerCreated, "exists:", bannerExists()); if (bannerCreated && bannerExists()) { log.info("Banner already created."); return true; } if (bannerCreated && !bannerExists()) { log.info("Flag true but no banner, resetting."); bannerCreated = false; } const exB = document.getElementById('ipv4-banner'); if (exB) { try { exB.parentNode.removeChild(exB); log.info("Removed remnant."); } catch (e) { log.warn('Could not remove remnant:', e); } } try { await getAllSettings(); initialViewportWidth = getViewportWidth(); currentViewMode = await getSavedViewMode(); const pos = await getSavedPosition(); isMinimized = await getSavedMinimizedState(); log.info("Initial states:", { currentViewMode, isMinimized }); let sW = await getSavedWidth(); const mW = calculateMaxBannerWidth(); sW = Math.min(sW, mW); if (sW < CONFIG.minWidth) sW = Math.min(CONFIG.defaultWidth, mW); if (isMinimized && preMinimizeWidth === null) { preMinimizeWidth = sW; } let sL = await getSavedLeftPosition(); const vW = getViewportWidth(); if (dragState.alwaysUseRight || isMinimized) { sL = null; } else if (sL !== null) { sL = Math.max(CONFIG.edgeGap, sL); if (sL > vW - CONFIG.minWidth) { sL = null; await clearLeftPosition(); } } const b = document.createElement('div'); b.id = 'ipv4-banner'; b.classList.add('ipv4-banner-base'); b.style.height = `${CONFIG.bannerHeight}px`; if (isMinimized) { b.classList.add('ipv4-banner-minimized'); } else { b.style.width = `${sW}px`; } if (dragState.alwaysUseRight || isMinimized || sL === null) { b.style.right = `${CONFIG.edgeGap}px`; b.style.left = 'auto'; dragState.isUsingLeft = false; } else { b.style.left = `${sL}px`; b.style.right = 'auto'; dragState.isUsingLeft = true; } if (pos.top) { b.style.top = pos.top; b.style.bottom = 'auto'; dragState.isUsingTop = true; } else { b.style.bottom = pos.bottom||'10px'; b.style.top = 'auto'; dragState.isUsingTop = false; } const dhE = _createDragHandleElement(); b.appendChild(dhE); const llE = _createLogoLinkElement(); b.appendChild(llE); const tE = _createTitleElement(currentViewMode); b.appendChild(tE); const scE = _createScrollContainerElement(); b.appendChild(scE); const tbE = _createToggleButtonElement(isMinimized); b.appendChild(tbE); tE.classList.toggle('ipv4-element-hidden', isMinimized); scE.classList.toggle('ipv4-element-hidden', isMinimized); document.body.appendChild(b); log.info("Banner appended."); setupDragFunctionality(b); updateLogo(isMinimized); if (document.getElementById('ipv4-banner')) { bannerCreated = true; log.info('Banner fully created and verified in DOM.'); window.addEventListener('resize', handleWindowResize); enforceLeftEdgeGap(b); setTimeout(ensureBannerInViewport, 100, b); setTimeout(() => { const bn=document.getElementById('ipv4-banner'); if(bn)enforceLeftEdgeGap(bn);}, 200); releaseInitLock(); if (!isMinimized) { log.info("createBanner: Banner is expanded. Queueing initial fetchData."); hasFetchedData = false; setTimeout(fetchData, 50); } else { log.info("createBanner: Banner is minimized. Initial data fetch deferred. hasFetchedData is false."); hasFetchedData = false; } return true; } else { log.error('Banner supposedly appended but not found by ID!'); bannerCreated = false; releaseInitLock(); return false; } } catch (e) { log.error('Error in createBanner:', e, e.stack); bannerCreated = false; releaseInitLock(); return false; } }
  function createTextLogo() { const lt=document.createElement('span');lt.textContent='IPv4.Global';lt.style.cssText=`font-weight:bold;color:#13b5ea;font-size:12px;white-space:nowrap;line-height:${CONFIG.bannerHeight-8}px;vertical-align:middle;`;return lt;}
  function getValidPriceString(item, priceField) { if(!item)return '$??';if(priceField.includes('.')){const[mf,sf]=priceField.split('.');if(item[mf]&&typeof item[mf][sf]!=='undefined'){const p=item[mf][sf].toString();return p.startsWith('$')?p:'$'+p;}}if(typeof item[priceField]!=='undefined'){const p=item[priceField];if(p===null||p===undefined||p==='')return '';const ps=p.toString();return ps.startsWith('$')?ps:'$'+ps;}return '';}
  function renderItems(items) { log.info("renderItems called with items count:", items ? items.length : 'null'); try { if (isDestroyed) { log.info("renderItems: isDestroyed, returning."); return; } const banner = document.getElementById('ipv4-banner'); if (!banner) { log.warn('renderItems: Banner not found. Triggering fetchData for potential recreate.'); bannerCreated = false; fetchData(); return; } if (isMinimized) { log.info("renderItems: Banner is minimized, not rendering items."); return; } const scrollContent = document.getElementById('ipv4-scroll-content'); if (!scrollContent) { log.error('CRITICAL: Scroll content element #ipv4-scroll-content not found! Cannot render items.'); bannerCreated = false; return; } const htmlItems = items.map(item => { if (!item || typeof item !== 'object') return ''; const blockStr = (typeof item.block === 'number' || typeof item.block === 'string') ? item.block.toString() : ''; const regionStr = (item.region && typeof item.region === 'string') ? item.region.toUpperCase() : ''; let priceStr; if (currentViewMode === VIEW_MODES.PRIOR_SALES) { priceStr = getValidPriceString(item, 'pricePerAddress'); } else { const priceFieldsToTry = ['askingPrice', 'price', 'pricePerAddress', 'listPrice', 'listingPrice', 'perAddress', 'asking', 'list', 'price.perAddress', 'pricing.perAddress', 'pricing.asking']; priceStr = ''; for (const field of priceFieldsToTry) { priceStr = getValidPriceString(item, field); if (priceStr && priceStr !== "$") break; } if (CONFIG.debug && (!priceStr || priceStr === "$")) { log.warn('New Listing item missing price or only "$":', item); } if (!priceStr || priceStr === "$") priceStr = '$??'; } return `<span class="prefix">/${blockStr}</span> <span class="registry">${regionStr}</span> <span class="price">${priceStr}</span>`; }); const validItems = htmlItems.filter(item => item); if (validItems.length === 0) { log.info("No valid items to display, showing 'No Data' message."); const noDataMessage = `<span class="registry">No ${currentViewMode === VIEW_MODES.PRIOR_SALES ? 'Prior Sales' : 'New Listings'} Data Available</span>`; scrollContent.innerHTML = noDataMessage.repeat(3); const tempEl = document.createElement('div'); tempEl.style.cssText='visibility:hidden;position:absolute;white-space:nowrap;font-size:12px;';tempEl.innerHTML=noDataMessage; document.body.appendChild(tempEl); let messageWidth=tempEl.scrollWidth; document.body.removeChild(tempEl); if(messageWidth<100)messageWidth=300; setupScrollAnimation(scrollContent, messageWidth); return; } hasFetchedData = true; retryCount = 0; const tickerText = validItems.join('&nbsp;&nbsp;&nbsp;&nbsp;') + '&nbsp;&nbsp;&nbsp;&nbsp;'; scrollContent.innerHTML = tickerText.repeat(10); log.info("Rendered items to scrollContent. Items count:", validItems.length); let contentWidth = 1000; const tempEl = document.createElement('div'); tempEl.style.cssText='visibility:hidden;position:absolute;white-space:nowrap;font-size:12px;font-family:Arial,sans-serif;';tempEl.innerHTML=tickerText; document.body.appendChild(tempEl); contentWidth=tempEl.scrollWidth; document.body.removeChild(tempEl); if(contentWidth<100)contentWidth=1000; setupScrollAnimation(scrollContent, contentWidth); ensureBannerInViewport(banner); log.info("Items rendered and animation setup complete."); } catch (e) { log.error('Error in renderItems:', e); } }
  function setupScrollAnimation(element, width) { try{if(!element||isDestroyed||isMinimized)return;if(animationStyleElement&&document.head.contains(animationStyleElement)){try{document.head.removeChild(animationStyleElement);}catch(e){}}const uid=Math.floor(Math.random()*1000000);const an=`scrollBanner_${uid}`;const spd=CONFIG.animationSpeed*0.8;const dur=Math.max(width/spd,10);animationStyleElement=document.createElement('style');animationStyleElement.textContent=`@keyframes ${an}{0%{transform:translateX(0);}100%{transform:translateX(-${width}px);}}#ipv4-scroll-content{animation:${an} ${dur}s linear infinite;}#ipv4-scroll-content:hover{animation-play-state:paused;}`;document.head.appendChild(animationStyleElement);}catch(e){log.warn('Error anim:',e);try{element.style.transition='transform 60s linear';element.style.transform='translateX(0)';void element.offsetWidth;element.style.transform='translateX(-3000px)';}catch(e2){log.warn('Anim fallback fail:',e2);}}}
  async function fetchData() { log.info("fetchData called. States:", {isDestroyed, bannerExists: bannerExists(), bannerCreated, isMinimized, isFetchingData}); if (isDestroyed || isFetchingData) { if(isFetchingData) log.warn("Fetch already in progress, skipping."); return; } if (!bannerExists() || !bannerCreated) { if (retryCount >= CONFIG.maxRetries) { log.warn(`Max retries (${CONFIG.maxRetries}) for banner create in fetchData.`); return; } log.info(`Banner not ready, create attempt ${retryCount + 1}`); retryCount++; bannerCreated = false; createBanner().then(cr=>{if(cr){log.info("Banner created from fetchData."); /* Initial fetch now handled by createBanner */ }else{log.warn("Banner creation failed from fetchData.");}});return;} if (isMinimized && hasFetchedData) { log.info("fetchData: Minimized and hasFetchedData=true, deferring data update."); return; } isFetchingData = true; log.info("Proceeding to fetch data (not minimized or needs initial fetch)."); if (isChromeAvailable()) { try { const requestBody = await getRequestBody(); fetchViaBackground(requestBody); } catch (error) { log.error("Error constructing request body in fetchData:", error); renderItems(fallbackData[currentViewMode]); isFetchingData = false; } } else { log.info('Chrome n/a, using fallback fetch.'); renderItems(fallbackData[currentViewMode]); isFetchingData = false; } }
  function fetchViaBackground(requestBodyObject) { log.info("Fetching data via background script for URL:", getCurrentApiEndpoint()); chrome.runtime.sendMessage({type:'fetchData',url:getCurrentApiEndpoint(),body:JSON.stringify(requestBodyObject)},r=>{ try { if(chrome.runtime.lastError){log.warn('Runtime err from bg:',chrome.runtime.lastError.message);renderItems(fallbackData[currentViewMode]);return;}if(r&&r.success&&r.data){log.info("Success from bg. Raw data snippet:", r.data.substring(0,200));try{const d=JSON.parse(r.data);log.info("Parsed data from bg:", d);if(d&&Array.isArray(d.items)){if(d.items.length>0){log.info("Parsed items count:",d.items.length);renderItems(d.items);}else{log.info("Parsed items empty. Rendering 'No Data'.");renderItems([]);}return;}log.warn('Parsed data.items not array or missing:',d);renderItems([]);}catch(e){log.error('Error parsing API resp JSON:',e, "Raw data:", r.data);renderItems([]);}}else if(r&&r.error){log.warn('API error from bg:',r.error,"Details:",r.details);renderItems(fallbackData[currentViewMode]);}else{log.warn('Unknown resp from bg:',r);renderItems(fallbackData[currentViewMode]);}} finally { isFetchingData = false; log.info("isFetchingData flag reset to false in fetchViaBackground callback."); } });}

  // INITIALIZATION
  async function initialize() {
    log.info('Initializing banner script (v18 - no data debug)...');
    const lockAcquired = await acquireInitLock();
    if (!lockAcquired) { log.warn('Could not acquire init lock. Initialization aborted.'); return; }
    log.info("Initialization lock acquired. Proceeding...");
    const oldBanner = document.getElementById('ipv4-banner');
    if (oldBanner) { log.warn('Old banner found. Removing.'); try { oldBanner.parentNode.removeChild(oldBanner); bannerCreated = false; } catch(e) { log.error("Error removing old banner:", e); }}
    try {
      initialViewportWidth = getViewportWidth();
      log.info("Getting settings...");
      await getAllSettings();
      currentViewMode = await getSavedViewMode();
      isMinimized = await getSavedMinimizedState();
      log.info("Pre-creation states:", { currentViewMode, isMinimized });
      log.info("Creating banner...");
      const created = await createBanner();
      if (created) {
        log.info("Banner created successfully in initialize.");
        setTimeout(setupMutationObserver, 1000);
        if (fetchIntervalId) clearInterval(fetchIntervalId);
        fetchIntervalId = setInterval(fetchData, CONFIG.refreshInterval);
        log.info(`Refresh interval set: ${CONFIG.refreshInterval / 1000}s.`);
        setTimeout(() => { const b = document.getElementById('ipv4-banner'); if (b) { log.info("Final position check."); enforceLeftEdgeGap(b); ensureBannerInViewport(b); }}, 500);
      } else {
        log.error("Initialization failed: createBanner() returned false.");
        releaseInitLock();
      }
      addCleanupListeners();
    } catch (e) {
      log.error('CRITICAL ERROR during main initialization:', e, e.stack);
      releaseInitLock();
    }
  }

  function setupMutationObserver() { if(!CONFIG.mutationObserverEnabled||isDestroyed||observer)return;try{observer=new MutationObserver(m=>{if(isDestroyed)return;for(const mu of m){if(mu.type==='childList'){const b=document.getElementById('ipv4-banner');if(bannerCreated&&!b){const n=Date.now();if(recreationCount>=CONFIG.recreationMaxCount){log.warn(`Banner removed ${recreationCount} times, giving up.`);return;}if(n-lastRecreationTime<CONFIG.recreationDelay){setTimeout(()=>{if(!bannerExists()&&!isDestroyed){log.warn(`Banner removed, recreating (attempt ${recreationCount+1}) delayed`);recreationCount++;lastRecreationTime=Date.now();createBanner().then(ok => { if(ok && !isMinimized && bannerExists()) fetchData(); });}},CONFIG.recreationDelay);}else{log.warn(`Banner removed, recreating (attempt ${recreationCount+1})`);recreationCount++;lastRecreationTime=n;createBanner().then(ok => { if(ok && !isMinimized && bannerExists()) fetchData(); });}}return;}}});observer.observe(document.body,{childList:true,subtree:false});log.info("MutationObserver setup.");}catch(e){log.warn('Error setup MutationObserver:',e);}}
  function addCleanupListeners() { try{window.addEventListener('pagehide',function(){cleanup(false);});window.addEventListener('beforeunload',function(){cleanup(false);});log.info("Cleanup listeners added.");}catch(e){log.warn('Error setup cleanup listeners:',e);}}
  function cleanup(fullCleanup) { log.info('Cleaning up resources. Full cleanup:', fullCleanup); if (isDestroyed && fullCleanup) return; if (fetchIntervalId) { clearInterval(fetchIntervalId); fetchIntervalId = null; } if (animationStyleElement && animationStyleElement.parentNode) { try { animationStyleElement.parentNode.removeChild(animationStyleElement); } catch(e){} animationStyleElement = null; } window.removeEventListener('resize', handleWindowResize); if (observer) { observer.disconnect(); observer = null; } if (fullCleanup) { isDestroyed = true; try { const banner = document.getElementById('ipv4-banner'); if (banner && banner.parentNode) banner.parentNode.removeChild(banner); } catch (e) { log.warn('Error removing banner during full cleanup:', e); } releaseInitLock(); } }

  log.info("Preparing to initialize based on document.readyState (v18)...");
  if (document.readyState === 'complete') {
    log.info("Document already complete. Initializing (v18)...");
    try { initialize(); } catch (e) { log.error("ERROR CALLING initialize() directly (doc complete):", e.message, e.stack); }
  } else {
    log.info("Document not complete. Adding event listener for 'load' (v18).");
    window.addEventListener('load', () => {
        log.info("Window 'load' event fired. Attempting to call initialize() (v18)...");
        try { initialize(); } catch (e) { log.error("ERROR CALLING initialize() from 'load' event listener:", e.message, e.stack); try { let errorPingDiv = document.createElement('div'); errorPingDiv.id = 'ipv4_banner_load_error_ping'; errorPingDiv.textContent = 'LOAD LISTENER ERROR PING'; errorPingDiv.style.position = 'fixed'; errorPingDiv.style.top = '20px'; errorPingDiv.style.left = '0px'; errorPingDiv.style.backgroundColor = 'red'; errorPingDiv.style.color = 'white'; errorPingDiv.style.zIndex = '2147483647'; if(document.body) document.body.appendChild(errorPingDiv); } catch (pingError) { console.error("Could not even add error ping div:", pingError); } }
        log.info("Callback for 'load' event finished (v18).");
    });
  }
})();
