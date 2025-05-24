// Background script for content filter extension
import { initStats, incrementStat } from './stats.js';

// Default configuration
const DEFAULT_CONFIG = {
  apiUrl: 'https://socio-io-bolt.onrender.com',
  isConfigured: false,
  enabled: true,
  filterText: true,
  filterImages: true,
  history: {} // Will store by domain
};

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  // Initialize config
  chrome.storage.local.get(['config'], (result) => {
    if (!result.config) {
      // Set default config if none exists
      chrome.storage.local.set({ config: DEFAULT_CONFIG }, () => {
        console.log('Default config initialized');
      });
    }
  });
  
  // Initialize stats separately
  initStats().then(stats => {
    console.log('Stats initialized on install:', stats);
  });
  
  // Open options page on install for setup
  chrome.tabs.create({ url: 'setup.html' });
});

// Function to update statistics
function updateStats(type) {
  incrementStat(type).then(stats => {
    console.log(`Stats updated for ${type}:`, stats);
  }).catch(error => {
    console.error('Error updating stats:', error);
  });
}

// Function to add to history
function addToHistory(domain, type, content, replacement) {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    // Make sure history object exists
    if (!config.history) {
      config.history = {};
    }
    
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
      console.log(`Added text entry to history for ${domain}`);
    } else if (type === 'image') {
      config.history[domain].images.push(entry);
      console.log(`Added image entry to history for ${domain}`);
    }
    
    // Save the updated config
    chrome.storage.local.set({ config }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving history:', chrome.runtime.lastError);
      } else {
        console.log('History saved successfully');
      }
    });
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkConfig') {
    chrome.storage.local.get(['config'], (result) => {
      sendResponse({ config: result.config });
    });
    return true; // Required for async response
  }
  
  if (request.action === 'updateStats') {
    updateStats(request.type);
    sendResponse({ success: true });
    return true; // Required for async response
  }
  
  if (request.action === 'addToHistory') {
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
});

// Listen for tab changes to refresh content filtering
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { action: 'refreshFilters' });
  }
});