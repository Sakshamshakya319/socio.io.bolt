// Background script for content filter extension

// Default configuration
const DEFAULT_CONFIG = {
  apiUrl: 'https://socio-io-iumw.onrender.com',
  isConfigured: false,
  enabled: true,
  filterText: true,
  filterImages: true,
  stats: {
    textFiltered: 0,
    imagesFiltered: 0
  },
  history: {} // Will store by domain
};

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['config'], (result) => {
    if (!result.config) {
      chrome.storage.local.set({ config: DEFAULT_CONFIG });
    }
  });
  
  // Open options page on install for setup
  chrome.tabs.create({ url: 'setup.html' });
});

// Function to update statistics
function updateStats(type) {
  console.log('updateStats called with type:', type);
  
  // Store stats separately from config for better reliability
  chrome.storage.local.get(['filterStats'], (result) => {
    let stats = result.filterStats || { textFiltered: 0, imagesFiltered: 0 };
    
    if (type === 'text') {
      stats.textFiltered = (stats.textFiltered || 0) + 1;
    } else if (type === 'image') {
      stats.imagesFiltered = (stats.imagesFiltered || 0) + 1;
    }
    
    console.log('New stats values:', stats);
    
    // Save the updated stats
    chrome.storage.local.set({ filterStats: stats }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error updating stats:', chrome.runtime.lastError);
        // Try again after a short delay
        setTimeout(() => updateStats(type), 500);
      } else {
        console.log('Stats updated successfully:', stats);
        
        // Also update the stats in the config for backward compatibility
        chrome.storage.local.get(['config'], (configResult) => {
          if (configResult.config) {
            const config = configResult.config;
            config.stats = stats;
            chrome.storage.local.set({ config }, () => {
              if (chrome.runtime.lastError) {
                console.error('Error updating config stats:', chrome.runtime.lastError);
              } else {
                console.log('Config stats updated successfully');
              }
            });
          }
        });
      }
    });
  });
}

// Function to add to history
function addToHistory(domain, type, content, replacement) {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config;
    
    // Initialize domain in history if it doesn't exist
    if (!config.history[domain]) {
      config.history[domain] = {
        text: [],
        images: []
      };
    }
    
    // Add to appropriate history
    const timestamp = new Date().toISOString();
    const entry = { timestamp, content, replacement, recovered: false };
    
    if (type === 'text') {
      config.history[domain].text.push(entry);
    } else if (type === 'image') {
      config.history[domain].images.push(entry);
    }
    
    chrome.storage.local.set({ config });
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action, request);
  
  if (request.action === 'checkConfig') {
    chrome.storage.local.get(['config'], (result) => {
      sendResponse({ config: result.config });
    });
    return true; // Required for async response
  }
  
  if (request.action === 'updateStats') {
    console.log('Updating stats for type:', request.type);
    updateStats(request.type);
    sendResponse({ success: true, message: 'Stats update initiated' });
    return true; // Required for async response
  }
  
  if (request.action === 'addToHistory') {
    console.log('Adding to history:', request.type, request.domain);
    addToHistory(request.domain, request.type, request.content, request.replacement);
    sendResponse({ success: true });
    return true; // Required for async response
  }
  
  if (request.action === 'getHistory') {
    chrome.storage.local.get(['config'], (result) => {
      const domain = request.domain;
      const history = result.config.history[domain] || { text: [], images: [] };
      sendResponse({ history });
    });
    return true; // Required for async response
  }
  
  if (request.action === 'recoverContent') {
    chrome.tabs.sendMessage(sender.tab.id, {
      action: 'recoverContent',
      domain: request.domain,
      entryIndex: request.entryIndex,
      type: request.type
    });
    
    // Update history to mark as recovered
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config;
      if (config.history[request.domain] && 
          config.history[request.domain][request.type] && 
          config.history[request.domain][request.type][request.entryIndex]) {
        config.history[request.domain][request.type][request.entryIndex].recovered = true;
        chrome.storage.local.set({ config });
      }
    });
    
    sendResponse({ success: true });
  }
  
  if (request.action === 'updateConfig') {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config;
      // Update config with the new values
      Object.assign(config, request.config);
      chrome.storage.local.set({ config });
      sendResponse({ success: true });
    });
    return true; // Required for async response
  }
  
  if (request.action === 'resetStats') {
    const defaultStats = {
      textFiltered: 0,
      imagesFiltered: 0
    };
    
    // Reset both storage locations
    chrome.storage.local.set({ filterStats: defaultStats });
    
    // Also update in config
    chrome.storage.local.get(['config'], (result) => {
      if (result.config) {
        result.config.stats = defaultStats;
        chrome.storage.local.set({ config: result.config });
      }
    });
    
    sendResponse({ success: true });
    return true;
  }
});

// Listen for tab changes to refresh content filtering
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { action: 'refreshFilters' });
  }
});