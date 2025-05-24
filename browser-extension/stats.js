// Stats management for Socio.io Content Filter

// Initialize stats
function initStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['filterStats'], (result) => {
      if (!result.filterStats) {
        // Create new stats object if it doesn't exist
        const newStats = {
          textFiltered: 0,
          imagesFiltered: 0,
          lastUpdated: new Date().toISOString()
        };
        
        chrome.storage.local.set({ filterStats: newStats }, () => {
          console.log('Stats initialized:', newStats);
          resolve(newStats);
        });
      } else {
        console.log('Stats loaded:', result.filterStats);
        resolve(result.filterStats);
      }
    });
  });
}

// Increment stats counter
function incrementStat(type) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['filterStats'], (result) => {
      let stats = result.filterStats;
      
      if (!stats) {
        stats = {
          textFiltered: 0,
          imagesFiltered: 0,
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Increment the appropriate counter
      if (type === 'text') {
        stats.textFiltered++;
        console.log('Text filtered count incremented to:', stats.textFiltered);
      } else if (type === 'image') {
        stats.imagesFiltered++;
        console.log('Images filtered count incremented to:', stats.imagesFiltered);
      }
      
      stats.lastUpdated = new Date().toISOString();
      
      // Save the updated stats
      chrome.storage.local.set({ filterStats: stats }, () => {
        console.log('Stats updated successfully');
        resolve(stats);
      });
    });
  });
}

// Get current stats
function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['filterStats'], (result) => {
      if (!result.filterStats) {
        // Initialize stats if they don't exist
        initStats().then(stats => resolve(stats));
      } else {
        resolve(result.filterStats);
      }
    });
  });
}

// Reset stats
function resetStats() {
  return new Promise((resolve) => {
    const newStats = {
      textFiltered: 0,
      imagesFiltered: 0,
      lastUpdated: new Date().toISOString()
    };
    
    chrome.storage.local.set({ filterStats: newStats }, () => {
      console.log('Stats reset to:', newStats);
      resolve(newStats);
    });
  });
}

// Export functions
export { initStats, incrementStat, getStats, resetStats };