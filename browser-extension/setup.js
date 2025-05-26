// Setup script for the extension
import config from './config.js';

document.addEventListener('DOMContentLoaded', function() {
  // Load existing configuration if available
  loadConfig();
  
  // Set up event listeners
  document.getElementById('testConnection').addEventListener('click', testConnection);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('closeSetup').addEventListener('click', closeSetup);
});

// Load extension configuration
function loadConfig() {
  chrome.storage.local.get(['config'], (result) => {
    const storedConfig = result.config || {};
    
    // Pre-fill API URL from config
    document.getElementById('apiUrl').value = config.apiUrl || 'https://socio-io-iumw.onrender.com';
    
    // Update connection status
    if (storedConfig.isConfigured) {
      updateConnectionStatus('connected', 'Connected to filtering service');
      document.getElementById('saveSettings').disabled = false;
      document.getElementById('closeSetup').style.display = 'block';
    }
  });
}

// Test connection to the backend API
function testConnection() {
  const apiUrl = document.getElementById('apiUrl').value.trim() || 'https://socio-io-iumw.onrender.com';
  
  // Show connecting status
  updateConnectionStatus('connecting', '<span class="spinner"></span> Testing connection...');
  
  // Test connection to the health endpoint
  fetch(`${apiUrl}/health`)
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('Connection failed');
    })
    .then(data => {
      if (data.status === 'ok') {
        updateConnectionStatus('connected', 'Connection successful! Backend is running.');
        document.getElementById('saveSettings').disabled = false;
        
        // Save settings automatically
        saveSettings();
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
  const apiUrl = document.getElementById('apiUrl').value.trim() || 'https://socio-io-iumw.onrender.com';
  
  // Update configuration
  chrome.storage.local.get(['config'], (result) => {
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
      updateConnectionStatus('connected', 'Settings saved successfully!');
      document.getElementById('closeSetup').style.display = 'block';
      
      // Auto close after successful save
      setTimeout(() => {
        closeSetup();
      }, 1500);
    });
  });
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