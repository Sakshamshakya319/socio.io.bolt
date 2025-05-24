// Stats page script
import { getStats, resetStats } from './stats.js';

document.addEventListener('DOMContentLoaded', function() {
  // Load stats
  loadStats();
  
  // Set up event listeners
  document.getElementById('refreshStats').addEventListener('click', loadStats);
  document.getElementById('resetStats').addEventListener('click', confirmResetStats);
  document.getElementById('closeStats').addEventListener('click', () => window.close());
});

// Load and display stats
function loadStats() {
  getStats().then(stats => {
    document.getElementById('textFiltered').textContent = stats.textFiltered || 0;
    document.getElementById('imagesFiltered').textContent = stats.imagesFiltered || 0;
    
    // Format and display last updated time
    if (stats.lastUpdated) {
      const lastUpdated = new Date(stats.lastUpdated);
      document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdated.toLocaleString()}`;
    } else {
      document.getElementById('lastUpdated').textContent = 'Last updated: Never';
    }
  }).catch(error => {
    console.error('Error loading stats:', error);
    alert('Error loading statistics. Please try again.');
  });
}

// Confirm and reset stats
function confirmResetStats() {
  if (confirm('Are you sure you want to reset all statistics to zero?')) {
    resetStats().then(() => {
      loadStats();
      alert('Statistics have been reset successfully.');
    }).catch(error => {
      console.error('Error resetting stats:', error);
      alert('Error resetting statistics. Please try again.');
    });
  }
}