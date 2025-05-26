// Recovery script for the extension

let currentDomain = '';

document.addEventListener('DOMContentLoaded', function() {
  // Get domain from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentDomain = urlParams.get('domain');
  
  if (!currentDomain) {
    alert('No domain specified');
    window.close();
    return;
  }
  
  // Set up tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding panel
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.content-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(`${tabName}Panel`).classList.add('active');
    });
  });
  
  // Update domain name
  document.getElementById('domainName').textContent = currentDomain;
  
  // Load domain history
  loadDomainHistory();
  
  // Set up event listeners
  document.getElementById('recoverAll').addEventListener('click', recoverAllContent);
  document.getElementById('backButton').addEventListener('click', goBackToPage);
  document.getElementById('clearDomainHistory').addEventListener('click', clearDomainHistory);
});

// Load domain history from storage
function loadDomainHistory() {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    const history = config.history || {};
    const domainHistory = history[currentDomain] || { text: [], images: [] };
    
    // Update counts
    document.getElementById('textCount').textContent = domainHistory.text.length;
    document.getElementById('imagesCount').textContent = domainHistory.images.length;
    
    // Update tab labels
    document.querySelector('.tab[data-tab="text"]').textContent = `Text Content (${domainHistory.text.length})`;
    document.querySelector('.tab[data-tab="images"]').textContent = `Images (${domainHistory.images.length})`;
    
    // Render text recovery
    renderTextRecovery(domainHistory.text);
    
    // Render images recovery
    renderImagesRecovery(domainHistory.images);
  });
}

// Render text recovery items
function renderTextRecovery(textItems) {
  const textRecovery = document.getElementById('textRecovery');
  
  // Clear current content
  textRecovery.innerHTML = '';
  
  if (textItems.length === 0) {
    textRecovery.innerHTML = '<div class="empty-state">No filtered text content found</div>';
    return;
  }
  
  // Sort by timestamp (newest first)
  textItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Create recovery items
  textItems.forEach((item, index) => {
    const recoveryItem = document.createElement('div');
    recoveryItem.className = 'recovery-item';
    
    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleString();
    
    recoveryItem.innerHTML = `
      <div class="recovery-item-header">
        <div>
          ${item.recovered ? '<span class="badge recovered">Recovered</span>' : ''}
        </div>
        <span class="timestamp">${formattedDate}</span>
      </div>
      <div class="recovery-content">
        <strong>Original Text:</strong>
        <div class="original-text">${item.content}</div>
      </div>
      <div class="recovery-content">
        <strong>Filtered Text:</strong>
        <div class="filtered-text">${item.replacement}</div>
      </div>
    `;
    
    // Add recover button if not already recovered
    if (!item.recovered) {
      const recoverButton = document.createElement('button');
      recoverButton.className = 'button';
      recoverButton.textContent = 'Recover Content';
      recoverButton.addEventListener('click', () => {
        recoverContent('text', index);
      });
      
      recoveryItem.appendChild(recoverButton);
    }
    
    textRecovery.appendChild(recoveryItem);
  });
}

// Render images recovery items
function renderImagesRecovery(imageItems) {
  const imagesRecovery = document.getElementById('imagesRecovery');
  
  // Clear current content
  imagesRecovery.innerHTML = '';
  
  if (imageItems.length === 0) {
    imagesRecovery.innerHTML = '<div class="empty-state">No filtered images found</div>';
    return;
  }
  
  // Sort by timestamp (newest first)
  imageItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Create recovery items
  imageItems.forEach((item, index) => {
    const recoveryItem = document.createElement('div');
    recoveryItem.className = 'recovery-item';
    
    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleString();
    
    recoveryItem.innerHTML = `
      <div class="recovery-item-header">
        <div>
          ${item.recovered ? '<span class="badge recovered">Recovered</span>' : ''}
        </div>
        <span class="timestamp">${formattedDate}</span>
      </div>
      <div class="recovery-content">
        <strong>Image URL:</strong>
        <div class="image-url"><a href="${item.content}" target="_blank">${item.content}</a></div>
      </div>
      <img src="${item.content}" class="image-preview" alt="Filtered image">
    `;
    
    // Add recover button if not already recovered
    if (!item.recovered) {
      const recoverButton = document.createElement('button');
      recoverButton.className = 'button';
      recoverButton.textContent = 'Recover Image';
      recoverButton.addEventListener('click', () => {
        recoverContent('images', index);
      });
      
      recoveryItem.appendChild(recoverButton);
    }
    
    imagesRecovery.appendChild(recoveryItem);
  });
}

// Recover content
function recoverContent(type, index) {
  // Mark as recovered in history
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    if (config.history && config.history[currentDomain] && config.history[currentDomain][type]) {
      config.history[currentDomain][type][index].recovered = true;
      
      chrome.storage.local.set({ config }, () => {
        // Send message to recover in active tabs for this domain
        chrome.tabs.query({}, (tabs) => {
          const domainTabs = tabs.filter(tab => {
            try {
              return new URL(tab.url).hostname === currentDomain;
            } catch (e) {
              return false;
            }
          });
          
          domainTabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'recoverContent',
              domain: currentDomain,
              type,
              entryIndex: index
            });
          });
        });
        
        // Refresh the recovery display
        loadDomainHistory();
        
        alert('Content recovery initiated. If the page is open, the content will be restored.');
      });
    }
  });
}

// Recover all content for this domain
function recoverAllContent() {
  if (confirm('Are you sure you want to recover all filtered content for this domain?')) {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      
      if (config.history && config.history[currentDomain]) {
        // Mark all items as recovered
        if (config.history[currentDomain].text) {
          config.history[currentDomain].text.forEach(item => {
            item.recovered = true;
          });
        }
        
        if (config.history[currentDomain].images) {
          config.history[currentDomain].images.forEach(item => {
            item.recovered = true;
          });
        }
        
        chrome.storage.local.set({ config }, () => {
          // Send messages to recover all content in active tabs
          chrome.tabs.query({}, (tabs) => {
            const domainTabs = tabs.filter(tab => {
              try {
                return new URL(tab.url).hostname === currentDomain;
              } catch (e) {
                return false;
              }
            });
            
            // For each tab, send message to reload the page
            // This is simpler than trying to recover each item individually
            domainTabs.forEach(tab => {
              chrome.tabs.reload(tab.id);
            });
          });
          
          // Refresh the recovery display
          loadDomainHistory();
          
          alert('All content recovery initiated. If the page is open, it will be reloaded with all content restored.');
        });
      }
    });
  }
}

// Go back to the page
function goBackToPage() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.update(tabs[0].id, {active: true});
      window.close();
    } else {
      window.close();
    }
  });
}

// Clear domain history
function clearDomainHistory() {
  if (confirm(`Are you sure you want to clear all history for ${currentDomain}?`)) {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      
      if (config.history) {
        delete config.history[currentDomain];
        
        chrome.storage.local.set({ config }, () => {
          alert('Domain history cleared successfully');
          window.close();
        });
      }
    });
  }
}