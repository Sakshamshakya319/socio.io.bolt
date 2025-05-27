// Popup script for the extension

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
  
  // Check connection to the backend API
  checkBackendConnection();
  
  // Listen for storage changes to update stats in real-time
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
      // Check for direct stats updates
      if (changes.filterStats) {
        console.log('Stats changed directly:', changes.filterStats);
        updateStatsDisplay(changes.filterStats.newValue);
      }
      // Also check config for backward compatibility
      else if (changes.config && changes.config.newValue && changes.config.newValue.stats) {
        console.log('Stats changed via config:', changes.config.newValue.stats);
        updateStatsDisplay(changes.config.newValue.stats);
      }
    }
  });
  
  // Add event listener for the refresh button
  document.getElementById('refreshStats').addEventListener('click', loadStats);
  
  // Add event listener for the reset button
  document.getElementById('resetStats').addEventListener('click', resetStats);
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
  
  // Load statistics separately
  loadStats();
}

// Load statistics from storage
function loadStats() {
  // Show loading state on refresh button
  const refreshBtn = document.getElementById('refreshStats');
  refreshBtn.classList.add('loading');
  refreshBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
      <path d="M23 4v6h-6"></path>
      <path d="M1 20v-6h6"></path>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
    </svg>
  `;
  
  chrome.storage.local.get(['filterStats', 'config'], (result) => {
    // First try to get stats from the dedicated storage
    if (result.filterStats) {
      console.log('Stats from dedicated storage:', result.filterStats);
      updateStatsDisplay(result.filterStats);
    } 
    // Fall back to config if needed
    else if (result.config && result.config.stats) {
      console.log('Stats from config:', result.config.stats);
      updateStatsDisplay(result.config.stats);
    } 
    // Initialize if no stats found
    else {
      console.log('No stats found, initializing');
      const defaultStats = {
        textFiltered: 0,
        imagesFiltered: 0
      };
      
      // Save to both locations for consistency
      chrome.storage.local.set({ filterStats: defaultStats });
      
      if (result.config) {
        result.config.stats = defaultStats;
        chrome.storage.local.set({ config: result.config });
      }
      
      updateStatsDisplay(defaultStats);
    }
    
    // Reset refresh button after a short delay
    setTimeout(() => {
      refreshBtn.classList.remove('loading');
      refreshBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
        </svg>
      `;
    }, 500);
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

// Function to update stats display
function updateStatsDisplay(stats) {
  if (stats) {
    const textElement = document.getElementById('textFiltered');
    const imagesElement = document.getElementById('imagesFiltered');
    
    // Get current values
    const currentTextCount = parseInt(textElement.textContent) || 0;
    const currentImagesCount = parseInt(imagesElement.textContent) || 0;
    
    // Get new values
    const newTextCount = stats.textFiltered || 0;
    const newImagesCount = stats.imagesFiltered || 0;
    
    // Update text count with animation if changed
    textElement.textContent = newTextCount;
    if (newTextCount > currentTextCount) {
      textElement.classList.remove('updated');
      void textElement.offsetWidth; // Force reflow to restart animation
      textElement.classList.add('updated');
    }
    
    // Update images count with animation if changed
    imagesElement.textContent = newImagesCount;
    if (newImagesCount > currentImagesCount) {
      imagesElement.classList.remove('updated');
      void imagesElement.offsetWidth; // Force reflow to restart animation
      imagesElement.classList.add('updated');
    }
    
    // Add click event to stats for testing (increment on click)
    textElement.onclick = function() {
      incrementStat('text');
    };
    imagesElement.onclick = function() {
      incrementStat('image');
    };
    
    // Add tooltips
    textElement.title = 'Text items filtered (click to test)';
    imagesElement.title = 'Images filtered (click to test)';
  }
}

// Function to manually increment a stat (for testing)
function incrementStat(type) {
  chrome.runtime.sendMessage({
    action: 'updateStats',
    type: type
  }, response => {
    console.log(`Manually incremented ${type} stat:`, response);
    loadStats(); // Refresh the display
  });
}

// Function to reset statistics
function resetStats() {
  if (confirm('Are you sure you want to reset all statistics to zero?')) {
    // Use the background script to reset stats
    chrome.runtime.sendMessage({
      action: 'resetStats'
    }, response => {
      if (response && response.success) {
        // Update display with zeros
        const defaultStats = {
          textFiltered: 0,
          imagesFiltered: 0
        };
        
        // Update display
        updateStatsDisplay(defaultStats);
        
        // Show confirmation
        const textElement = document.getElementById('textFiltered');
        const imagesElement = document.getElementById('imagesFiltered');
        
        textElement.classList.add('updated');
        imagesElement.classList.add('updated');
        
        // Show toast notification
        showToast('Statistics have been reset');
      } else {
        showToast('Failed to reset statistics');
      }
    });
  }
}

// Show a toast notification
function showToast(message) {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  
  // Set message and show
  toast.textContent = message;
  toast.classList.add('show');
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}