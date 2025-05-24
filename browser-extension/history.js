// History script for the extension

document.addEventListener('DOMContentLoaded', function() {
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
  
  // Load history
  loadHistory();
  
  // Set up event listener for clear all button
  document.getElementById('clearAllHistory').addEventListener('click', clearAllHistory);
});

// Load history from storage
function loadHistory() {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    const history = config.history || {};
    
    // Get all domains
    const domains = Object.keys(history);
    
    // Update domain list
    updateDomainList(domains);
    
    // Count total items
    let totalTextItems = 0;
    let totalImageItems = 0;
    
    domains.forEach(domain => {
      if (history[domain].text) {
        totalTextItems += history[domain].text.length;
      }
      if (history[domain].images) {
        totalImageItems += history[domain].images.length;
      }
    });
    
    // Update tab counts
    document.querySelector('.tab[data-tab="text"]').textContent = `Text Content (${totalTextItems})`;
    document.querySelector('.tab[data-tab="images"]').textContent = `Images (${totalImageItems})`;
    
    // Show all domains history by default
    showAllDomainsHistory(history);
  });
}

// Update the domain list
function updateDomainList(domains) {
  const domainList = document.getElementById('domainList');
  
  // Keep the "All Domains" option
  domainList.innerHTML = '<div class="domain-item active">All Domains</div>';
  
  // Add each domain
  domains.forEach(domain => {
    const domainItem = document.createElement('div');
    domainItem.className = 'domain-item';
    domainItem.textContent = domain;
    domainItem.addEventListener('click', () => {
      // Update active domain
      document.querySelectorAll('.domain-item').forEach(item => {
        item.classList.remove('active');
      });
      domainItem.classList.add('active');
      
      // Show history for this domain
      showDomainHistory(domain);
    });
    
    domainList.appendChild(domainItem);
  });
  
  // Add event listener to "All Domains"
  domainList.querySelector('.domain-item').addEventListener('click', () => {
    // Update active domain
    document.querySelectorAll('.domain-item').forEach(item => {
      item.classList.remove('active');
    });
    domainList.querySelector('.domain-item').classList.add('active');
    
    // Show all domains history
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      const history = config.history || {};
      showAllDomainsHistory(history);
    });
  });
}

// Show history for all domains
function showAllDomainsHistory(history) {
  const textHistory = document.getElementById('textHistory');
  const imagesHistory = document.getElementById('imagesHistory');
  
  // Clear current content
  textHistory.innerHTML = '';
  imagesHistory.innerHTML = '';
  
  // Combine all domains' history
  let allTextHistory = [];
  let allImagesHistory = [];
  
  Object.keys(history).forEach(domain => {
    if (history[domain].text) {
      history[domain].text.forEach(item => {
        allTextHistory.push({
          ...item,
          domain
        });
      });
    }
    
    if (history[domain].images) {
      history[domain].images.forEach(item => {
        allImagesHistory.push({
          ...item,
          domain
        });
      });
    }
  });
  
  // Sort by timestamp (newest first)
  allTextHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  allImagesHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Render text history
  if (allTextHistory.length > 0) {
    allTextHistory.forEach((item, index) => {
      textHistory.appendChild(createTextHistoryItem(item, index, item.domain));
    });
  } else {
    textHistory.innerHTML = '<div class="empty-state">No filtered text content found</div>';
  }
  
  // Render images history
  if (allImagesHistory.length > 0) {
    allImagesHistory.forEach((item, index) => {
      imagesHistory.appendChild(createImageHistoryItem(item, index, item.domain));
    });
  } else {
    imagesHistory.innerHTML = '<div class="empty-state">No filtered images found</div>';
  }
}

// Show history for a specific domain
function showDomainHistory(domain) {
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    const history = config.history || {};
    const domainHistory = history[domain] || { text: [], images: [] };
    
    const textHistory = document.getElementById('textHistory');
    const imagesHistory = document.getElementById('imagesHistory');
    
    // Clear current content
    textHistory.innerHTML = '';
    imagesHistory.innerHTML = '';
    
    // Sort by timestamp (newest first)
    domainHistory.text.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    domainHistory.images.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Render text history
    if (domainHistory.text && domainHistory.text.length > 0) {
      domainHistory.text.forEach((item, index) => {
        textHistory.appendChild(createTextHistoryItem(item, index, domain));
      });
    } else {
      textHistory.innerHTML = '<div class="empty-state">No filtered text content found for this domain</div>';
    }
    
    // Render images history
    if (domainHistory.images && domainHistory.images.length > 0) {
      domainHistory.images.forEach((item, index) => {
        imagesHistory.appendChild(createImageHistoryItem(item, index, domain));
      });
    } else {
      imagesHistory.innerHTML = '<div class="empty-state">No filtered images found for this domain</div>';
    }
  });
}

// Create a text history item
function createTextHistoryItem(item, index, domain) {
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  
  const date = new Date(item.timestamp);
  const formattedDate = date.toLocaleString();
  
  historyItem.innerHTML = `
    <div class="history-item-header">
      <div>
        <span class="domain-badge">${domain}</span>
        ${item.recovered ? '<span class="badge recovered">Recovered</span>' : ''}
      </div>
      <span class="timestamp">${formattedDate}</span>
    </div>
    <div class="history-content">${item.content}</div>
    <div class="history-content">${item.replacement}</div>
  `;
  
  // Add recover button if not already recovered
  if (!item.recovered) {
    const recoverButton = document.createElement('button');
    recoverButton.className = 'button';
    recoverButton.textContent = 'Recover Content';
    recoverButton.addEventListener('click', () => {
      recoverContent(domain, 'text', index);
    });
    
    historyItem.appendChild(recoverButton);
  }
  
  return historyItem;
}

// Create an image history item
function createImageHistoryItem(item, index, domain) {
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  
  const date = new Date(item.timestamp);
  const formattedDate = date.toLocaleString();
  
  historyItem.innerHTML = `
    <div class="history-item-header">
      <div>
        <span class="domain-badge">${domain}</span>
        ${item.recovered ? '<span class="badge recovered">Recovered</span>' : ''}
      </div>
      <span class="timestamp">${formattedDate}</span>
    </div>
    <img src="${item.content}" class="image-preview" alt="Filtered image">
  `;
  
  // Add recover button if not already recovered
  if (!item.recovered) {
    const recoverButton = document.createElement('button');
    recoverButton.className = 'button';
    recoverButton.textContent = 'Recover Image';
    recoverButton.addEventListener('click', () => {
      recoverContent(domain, 'images', index);
    });
    
    historyItem.appendChild(recoverButton);
  }
  
  return historyItem;
}

// Recover filtered content
function recoverContent(domain, type, index) {
  // First mark as recovered in history
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    
    if (config.history && config.history[domain] && config.history[domain][type]) {
      config.history[domain][type][index].recovered = true;
      
      chrome.storage.local.set({ config }, () => {
        // Then send message to recover in active tabs for this domain
        chrome.tabs.query({}, (tabs) => {
          const domainTabs = tabs.filter(tab => {
            try {
              return new URL(tab.url).hostname === domain;
            } catch (e) {
              return false;
            }
          });
          
          domainTabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'recoverContent',
              domain,
              type,
              entryIndex: index
            });
          });
        });
        
        // Refresh the history display
        if (document.querySelector('.domain-item.active').textContent === 'All Domains') {
          showAllDomainsHistory(config.history);
        } else {
          showDomainHistory(domain);
        }
        
        alert('Content recovery initiated. If the page is open, the content will be restored.');
      });
    }
  });
}

// Clear all history
function clearAllHistory() {
  if (confirm('Are you sure you want to clear all filtering history?')) {
    chrome.storage.local.get(['config'], (result) => {
      const config = result.config || {};
      config.history = {};
      
      chrome.storage.local.set({ config }, () => {
        // Refresh the page
        window.location.reload();
      });
    });
  }
}