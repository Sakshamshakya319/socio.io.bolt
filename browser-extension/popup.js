// Popup script for the extension
import { getStats } from './stats.js';

document.addEventListener('DOMContentLoaded', function() {
  // Load configuration and update UI
  loadConfig();
  
  // Set up event listeners
  document.getElementById('enableExtension').addEventListener('change', toggleExtension);
  document.getElementById('filterText').addEventListener('change', updateFilters);
  document.getElementById('filterImages').addEventListener('change', updateFilters);
  document.getElementById('historyBtn').addEventListener('click', openHistory);
  document.getElementById('recoverBtn').addEventListener('click', openRecovery);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('setupLink').addEventListener('click', openSetup);
  
  // Add click event for stats section to open detailed stats
  document.querySelector('.stats').addEventListener('click', openStats);
  
  // Check connection to the backend API
  checkBackendConnection();
  
  // Load stats separately
  loadStats();
});

// Load extension configuration
function loadConfig() {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    // Update toggle states
    document.getElementById('enableExtension').checked = config.enabled !== false;
    document.getElementById('filterText').checked = config.filterText !== false;
    document.getElementById('filterImages').checked = config.filterImages !== false;
    
    // Update connection status
    updateConnectionStatus(config.isConfigured);
  });
}

// Load stats
function loadStats() {
  getStats().then(stats => {
    console.log('Stats loaded in popup:', stats);
    document.getElementById('textFiltered').textContent = stats.textFiltered || 0;
    document.getElementById('imagesFiltered').textContent = stats.imagesFiltered || 0;
  }).catch(error => {
    console.error('Error loading stats:', error);
    // Show default values if there's an error
    document.getElementById('textFiltered').textContent = '0';
    document.getElementById('imagesFiltered').textContent = '0';
  });
}

// Toggle extension on/off
function toggleExtension() {
  const enabled = document.getElementById('enableExtension').checked;
  
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    config.enabled = enabled;
    
    chrome.storage.local.set({ config }, () => {
      // Notify content scripts of the change
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateConfig', 
            config: { enabled }
          });
        }
      });
    });
  });
}

// Update filter settings
function updateFilters() {
  const filterText = document.getElementById('filterText').checked;
  const filterImages = document.getElementById('filterImages').checked;
  
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    config.filterText = filterText;
    config.filterImages = filterImages;
    
    chrome.storage.local.set({ config }, () => {
      // Notify content scripts of the change
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateConfig', 
            config: { filterText, filterImages }
          });
        }
      });
    });
  });
}

// Check connection to the backend API
function checkBackendConnection() {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    if (!config.apiUrl) {
      updateConnectionStatus(false);
      return;
    }
    
    fetch(`${config.apiUrl}/health`)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Connection failed');
      })
      .then(data => {
        if (data.status === 'ok') {
          updateConnectionStatus(true);
          
          // Update config if not already set
          if (!config.isConfigured) {
            config.isConfigured = true;
            chrome.storage.local.set({ config });
          }
        } else {
          updateConnectionStatus(false);
        }
      })
      .catch(error => {
        console.error('Backend connection error:', error);
        updateConnectionStatus(false);
      });
  });
}

// Update connection status UI
function updateConnectionStatus(isConnected) {
  const statusElement = document.getElementById('connectionStatus');
  
  if (isConnected) {
    statusElement.textContent = 'Connected to Filtering Service';
    statusElement.className = 'connection-status connected';
  } else {
    statusElement.textContent = 'Not Connected to Filtering Service';
    statusElement.className = 'connection-status disconnected';
  }
}

// Open history page
function openHistory() {
  chrome.tabs.create({ url: 'history.html' });
}

// Open recovery page
function openRecovery() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      const url = new URL(tabs[0].url);
      const domain = url.hostname;
      
      chrome.storage.local.get(['config'], (result) => {
        const config = result.config || {};
        const domainHistory = config.history && config.history[domain];
        
        if (domainHistory && (domainHistory.text.length > 0 || domainHistory.images.length > 0)) {
          chrome.tabs.create({ url: `recovery.html?domain=${encodeURIComponent(domain)}` });
        } else {
          alert('No filtered content found for this domain.');
        }
      });
    }
  });
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Open setup page
function openSetup() {
  chrome.tabs.create({ url: 'setup.html' });
}

// Open stats page
function openStats() {
  chrome.tabs.create({ url: 'stats.html' });
}