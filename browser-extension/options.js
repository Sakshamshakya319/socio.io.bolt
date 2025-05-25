// Options script for the extension

document.addEventListener('DOMContentLoaded', function() {
  // Load configuration
  loadConfig();
  
  // Set up event listeners
  document.getElementById('enableExtension').addEventListener('change', updateToggle);
  document.getElementById('filterText').addEventListener('change', updateToggle);
  document.getElementById('filterImages').addEventListener('change', updateToggle);
  document.getElementById('testConnection').addEventListener('click', testConnection);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  document.getElementById('resetStats').addEventListener('click', resetStats);
  document.getElementById('resetAll').addEventListener('click', resetAll);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
});

// Load extension configuration
function loadConfig() {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    // Update toggle states
    document.getElementById('enableExtension').checked = config.enabled !== false;
    document.getElementById('filterText').checked = config.filterText !== false;
    document.getElementById('filterImages').checked = config.filterImages !== false;
    
    // Fill in API URL if configured
    if (config.apiUrl) {
      document.getElementById('apiUrl').value = config.apiUrl;
    }
    
    // Update connection status
    updateConnectionStatus(config.isConfigured);
  });
}

// Update toggle state in UI
function updateToggle() {
  // No immediate action needed here, changes will be saved on "Save Settings"
}

// Test connection to the backend API
function testConnection() {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  
  if (!apiUrl) {
    updateConnectionStatus(false, 'Please enter a valid API URL');
    return;
  }
  
  fetch(`${apiUrl}/health`)
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Connection failed');
    })
    .then(data => {
      if (data.status === 'ok') {
        updateConnectionStatus(true, 'Connection successful! Backend is running.');
      } else {
        updateConnectionStatus(false, 'Connection failed: Invalid response from server');
      }
    })
    .catch(error => {
      console.error('Backend connection error:', error);
      updateConnectionStatus(false, `Connection failed: ${error.message}`);
    });
}

// Clear filtering history
function clearHistory() {
  if (confirm('Are you sure you want to clear all filtering history?')) {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      config.history = {};
      
      chrome.storage.local.set({ config }, () => {
        alert('History cleared successfully');
      });
    });
  }
}

// Reset statistics
function resetStats() {
  if (confirm('Are you sure you want to reset all statistics?')) {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      config.stats = {
        textFiltered: 0,
        imagesFiltered: 0
      };
      
      chrome.storage.local.set({ config }, () => {
        alert('Statistics reset successfully');
      });
    });
  }
}

// Reset all settings to default
function resetAll() {
  if (confirm('Are you sure you want to reset all settings to default?')) {
    const DEFAULT_CONFIG = {
      apiUrl: document.getElementById('apiUrl').value, // Preserve API URL
      isConfigured: true,
      enabled: true,
      filterText: true,
      filterImages: true,
      stats: {
        textFiltered: 0,
        imagesFiltered: 0
      },
      history: {}
    };
    
    chrome.storage.local.set({ config: DEFAULT_CONFIG }, () => {
      loadConfig();
      alert('All settings reset to default');
    });
  }
}

// Save settings
function saveSettings() {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  
  if (!apiUrl) {
    updateConnectionStatus(false, 'Please enter a valid API URL');
    return;
  }
  
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    // Update config with form values
    config.apiUrl = apiUrl;
    config.enabled = document.getElementById('enableExtension').checked;
    config.filterText = document.getElementById('filterText').checked;
    config.filterImages = document.getElementById('filterImages').checked;
    
    // If API URL changed, we need to test the connection
    if (config.apiUrl !== apiUrl) {
      fetch(`${apiUrl}/health`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Connection failed');
        })
        .then(data => {
          if (data.status === 'ok') {
            config.isConfigured = true;
            saveConfigAndNotify(config);
          } else {
            if (confirm('Could not connect to the backend. Save settings anyway?')) {
              config.isConfigured = false;
              saveConfigAndNotify(config);
            }
          }
        })
        .catch(error => {
          console.error('Backend connection error:', error);
          if (confirm('Could not connect to the backend. Save settings anyway?')) {
            config.isConfigured = false;
            saveConfigAndNotify(config);
          }
        });
    } else {
      saveConfigAndNotify(config);
    }
  });
}

// Save config and notify user
function saveConfigAndNotify(config) {
  chrome.storage.local.set({ config }, () => {
    // Notify all tabs about the config change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'updateConfig', 
          config: {
            enabled: config.enabled,
            filterText: config.filterText,
            filterImages: config.filterImages,
            apiUrl: config.apiUrl
          }
        });
      });
    });
    
    alert('Settings saved successfully');
  });
}

// Update connection status UI
function updateConnectionStatus(isConnected, message) {
  const statusElement = document.getElementById('connectionStatus');
  
  if (isConnected) {
    statusElement.textContent = message || 'Connected to Filtering Service';
    statusElement.className = 'connection-status connected';
  } else {
    statusElement.textContent = message || 'Not Connected to Filtering Service';
    statusElement.className = 'connection-status disconnected';
  }
}