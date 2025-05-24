// Setup script for the extension
import config from './config.js';

// Initialize the setup page
function initSetup() {
  // Load existing configuration if available
  loadConfig();
  
  // Set up event listeners
  document.getElementById('testConnection').addEventListener('click', testConnection);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('closeSetup').addEventListener('click', closeSetup);
  
  // Automatically test connection on load
  setTimeout(testConnection, 500); // Small delay to ensure everything is loaded
}

// Run initialization when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSetup);
} else {
  initSetup(); // DOM is already ready
}

// Load extension configuration
function loadConfig() {
  try {
    // Display the fixed API URL from config.js
    document.getElementById('apiUrl').value = config.apiUrl;
    
    // Get stored configuration
    chrome.storage.local.get(['config'], (result) => {
      try {
        const storedConfig = result.config || {};
        
        // Update connection status
        if (storedConfig.isConfigured) {
          updateConnectionStatus('connected', 'Connected to filtering service');
          document.getElementById('saveSettings').disabled = false;
          document.getElementById('closeSetup').style.display = 'block';
        }
      } catch (err) {
        console.error('Error processing stored config:', err);
      }
    });
  } catch (err) {
    console.error('Error in loadConfig:', err);
    updateConnectionStatus('error', 'Error loading configuration');
  }
}

// Test connection to the backend API
function testConnection() {
  const apiUrl = config.apiUrl; // Always use the URL from config.js
  
  // Show connecting status
  updateConnectionStatus('connecting', '<span class="spinner"></span> Testing connection to ' + apiUrl + '...');
  
  // Test connection to the health endpoint
  fetch(`${apiUrl}/health`, {
    method: 'GET',
    mode: 'cors',
    headers: {
      'Accept': 'application/json'
    }
  })
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Connection failed with status: ' + response.status);
    })
    .then(data => {
      if (data && data.status === 'ok') {
        updateConnectionStatus('connected', 'Connection successful! Backend is running.');
        document.getElementById('saveSettings').disabled = false;
        saveSettings(); // Auto save on successful connection
      } else {
        updateConnectionStatus('error', 'Connection failed: Invalid response from server');
      }
    })
    .catch(error => {
      console.error('Backend connection error:', error);
      updateConnectionStatus('error', `Connection failed: ${error.message}`);
    });
}

// Save settings
function saveSettings() {
  try {
    const apiUrl = config.apiUrl; // Always use the URL from config.js
    
    // Update configuration
    chrome.storage.local.get(['config'], (result) => {
      try {
        const storedConfig = result.config || {};
        const newConfig = {
          ...storedConfig,
          apiUrl,
          isConfigured: true,
          enabled: config.defaults.enabled,
          filterText: config.defaults.filterText,
          filterImages: config.defaults.filterImages
        };
        
        chrome.storage.local.set({ config: newConfig }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving settings:', chrome.runtime.lastError);
            updateConnectionStatus('error', 'Error saving settings: ' + chrome.runtime.lastError.message);
            return;
          }
          
          updateConnectionStatus('connected', 'Settings saved successfully!');
          document.getElementById('closeSetup').style.display = 'block';
          
          // Auto close after 2 seconds if this is first setup
          if (!storedConfig.firstSetupComplete) {
            setTimeout(() => {
              newConfig.firstSetupComplete = true;
              chrome.storage.local.set({ config: newConfig });
              closeSetup();
            }, 2000);
          }
        });
      } catch (err) {
        console.error('Error processing config for save:', err);
        updateConnectionStatus('error', 'Error saving settings');
      }
    });
  } catch (err) {
    console.error('Error in saveSettings:', err);
    updateConnectionStatus('error', 'Error saving settings');
  }
}

// Close setup page
function closeSetup() {
  window.close();
}

// Update connection status UI
function updateConnectionStatus(status, message) {
  const statusElement = document.getElementById('connectionStatus');
  statusElement.innerHTML = message;
  statusElement.className = `connection-status ${status}`;
}