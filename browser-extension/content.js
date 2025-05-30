// Content script for Socio.io content filter extension

// Keep track of filtered elements for recovery
const filteredElements = {
  text: [],
  images: []
};

// Configuration defaults
let config = {
  enabled: true,
  filterText: true,
  filterImages: true,
  apiUrl: ''
};

// Initialize
init();

function init() {
  // Load configuration
  chrome.storage.local.get(['config'], (result) => {
    if (result.config) {
      config = result.config;
      
      // Only proceed if the extension is configured and enabled
      if (config.isConfigured && config.enabled) {
        startFiltering();
      }
    }
  });
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refreshFilters') {
      startFiltering();
    }
    
    if (request.action === 'updateConfig') {
      Object.assign(config, request.config);
      startFiltering();
    }
    
    if (request.action === 'recoverContent') {
      recoverFilteredContent(request.type, request.entryIndex);
    }
    
    sendResponse({ success: true });
  });
}

// Start the content filtering process
function startFiltering() {
  if (!config.enabled) return;
  
  // Reset filtered elements
  filteredElements.text = [];
  filteredElements.images = [];
  
  // Apply filters based on configuration
  if (config.filterText) {
    filterTextContent();
  }
  
  if (config.filterImages) {
    filterImageContent();
  }
  
  // Set up mutation observer to handle dynamically added content
  setupMutationObserver();
}

// Filter text content on the page
function filterTextContent() {
  // Get all text nodes
  const textNodes = [];
  const walk = document.createTreeWalker(
    document.body, 
    NodeFilter.SHOW_TEXT, 
    { acceptNode: node => node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }, 
    false
  );
  
  while (walk.nextNode()) {
    textNodes.push(walk.currentNode);
  }
  
  // Process text nodes in batches to avoid blocking the UI
  processTextNodesBatch(textNodes, 0, 50);
}

// Process text nodes in batches
function processTextNodesBatch(nodes, startIndex, batchSize) {
  if (startIndex >= nodes.length) return;
  
  const endIndex = Math.min(startIndex + batchSize, nodes.length);
  const batch = nodes.slice(startIndex, endIndex);
  
  batch.forEach(node => {
    // Skip nodes in certain elements
    const parentElement = node.parentElement;
    if (
      parentElement.tagName === 'SCRIPT' || 
      parentElement.tagName === 'STYLE' || 
      parentElement.tagName === 'NOSCRIPT'
    ) {
      return;
    }
    
    // Check and filter the text
    checkAndFilterText(node);
  });
  
  // Process next batch
  setTimeout(() => {
    processTextNodesBatch(nodes, endIndex, batchSize);
  }, 0);
}

// Check text and apply filtering if needed
function checkAndFilterText(textNode) {
  const text = textNode.nodeValue;
  if (!text || text.trim().length === 0) return;
  
  // First apply basic local filtering for obvious cases
  const filteredText = applyBasicFilter(text);
  
  if (filteredText !== text) {
    // If local filter caught something, apply it immediately
    const originalText = textNode.nodeValue;
    textNode.nodeValue = filteredText;
    
    // Store for recovery
    const index = filteredElements.text.length;
    filteredElements.text.push({
      node: textNode,
      original: originalText,
      filtered: filteredText,
      index
    });
    
    // Report to background
    reportFilteredContent('text', originalText, filteredText);
  } else {
    // For more complex cases, send to the backend
    // Only if text is substantial (performance optimization)
    if (text.length > 10) {
      checkTextWithBackend(textNode);
    }
  }
}

// Apply basic local filtering for obvious explicit words
function applyBasicFilter(text) {
  // Simple list of words to filter locally
  const explicitWords = [
    'explicit', 'offensive', 'profane', 'vulgar', 'obscene'
    // This would be expanded in a real implementation
  ];
  
  let filteredText = text;
  
  explicitWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });
  
  return filteredText;
}

// Check text content with backend API
function checkTextWithBackend(textNode) {
  if (!config.apiUrl) {
    // If no API URL is configured, use enhanced local filtering
    const text = textNode.nodeValue;
    const filteredText = applyEnhancedLocalFilter(text);
    
    if (filteredText !== text) {
      // Apply filtered text
      const originalText = textNode.nodeValue;
      textNode.nodeValue = filteredText;
      
      // Store for recovery
      const index = filteredElements.text.length;
      filteredElements.text.push({
        node: textNode,
        original: originalText,
        filtered: filteredText,
        index
      });
      
      // Report to background
      reportFilteredContent('text', originalText, filteredText);
    }
    return;
  }
  
  // Get the text content
  const text = textNode.nodeValue;
  
  // Make an actual API call to the backend
  fetch(`${config.apiUrl}/filter/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    // Check if the API found explicit content
    if (data.hasExplicitContent) {
      // Apply filtered text from the API
      const originalText = textNode.nodeValue;
      textNode.nodeValue = data.filtered;
      
      // Store for recovery
      const index = filteredElements.text.length;
      filteredElements.text.push({
        node: textNode,
        original: originalText,
        filtered: data.filtered,
        index
      });
      
      // Report to background
      reportFilteredContent('text', originalText, data.filtered);
    }
  })
  .catch(error => {
    console.error('Error calling text filter API:', error);
    // Fallback to enhanced local filtering
    const filteredText = applyEnhancedLocalFilter(text);
    
    if (filteredText !== text) {
      // Apply filtered text
      const originalText = textNode.nodeValue;
      textNode.nodeValue = filteredText;
      
      // Store for recovery
      const index = filteredElements.text.length;
      filteredElements.text.push({
        node: textNode,
        original: originalText,
        filtered: filteredText,
        index
      });
      
      // Report to background
      reportFilteredContent('text', originalText, filteredText);
    }
  });
}

// Enhanced local filter for text (used when API is not available)
function applyEnhancedLocalFilter(text) {
  // Expanded list of words to filter locally
  const explicitWords = [
    'explicit', 'offensive', 'profane', 'vulgar', 'obscene',
    'adult', 'nsfw', 'xxx', 'porn', 'sex',
    'violence', 'gore', 'blood', 'kill', 'murder',
    'hate', 'racist', 'bigot', 'slur'
    // This would be expanded in a real implementation
  ];
  
  let filteredText = text;
  
  explicitWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });
  
  return filteredText;
}

// Filter image content on the page
function filterImageContent() {
  const images = document.querySelectorAll('img');
  
  // Process images in batches
  processImagesBatch(Array.from(images), 0, 10);
}

// Process images in batches
function processImagesBatch(images, startIndex, batchSize) {
  if (startIndex >= images.length) return;
  
  const endIndex = Math.min(startIndex + batchSize, images.length);
  const batch = images.slice(startIndex, endIndex);
  
  batch.forEach(img => {
    // Skip small images, icons, etc.
    if (img.width < 50 || img.height < 50) return;
    if (img.classList.contains('socio-io-filtered')) return;
    
    // Check the image
    checkAndFilterImage(img);
  });
  
  // Process next batch
  setTimeout(() => {
    processImagesBatch(images, endIndex, batchSize);
  }, 0);
}

// Check and filter image if needed
function checkAndFilterImage(img) {
  // Skip empty or invalid sources
  if (!img.src || img.src.startsWith('data:') || img.src.trim() === '') return;
  
  // Skip already processed images
  if (img.dataset.socioioProcessed) return;
  img.dataset.socioioProcessed = 'true';
  
  // First perform basic checks (dimensions, etc.)
  const shouldCheckWithBackend = performBasicImageChecks(img);
  
  if (shouldCheckWithBackend) {
    checkImageWithBackend(img);
  }
}

// Perform basic image checks to determine if backend check is needed
function performBasicImageChecks(img) {
  // In a real implementation, this would have more sophisticated checks
  // For now, we'll check all substantial images
  return img.width > 100 && img.height > 100;
}

// Check image with backend API
function checkImageWithBackend(img) {
  if (!config.apiUrl) {
    // If no API URL is configured, use local filtering
    if (shouldFilterImageLocally(img)) {
      applyImageFilter(img, { 
        shouldFilter: true, 
        confidence: 0.8,
        method: 'local-fallback'
      });
      
      // Report filtered content for stats
      const originalSrc = img.src;
      reportFilteredContent('image', originalSrc, 'filtered-image-local');
    }
    return;
  }
  
  try {
    // Show loading indicator
    const loadingIndicator = createLoadingIndicator(img);
    
    // For demo purposes, we'll simulate a successful API response
    // In a real implementation, this would be an actual API call
    setTimeout(() => {
      // Remove loading indicator
      if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
      
      // Simulate filtering based on image dimensions
      // This is just for demonstration - real implementation would use actual API
      const shouldFilter = img.width > 200 && img.height > 200;
      
      if (shouldFilter) {
        // Apply filter to the image
        applyImageFilter(img, { 
          shouldFilter: true, 
          confidence: 0.85,
          method: 'demo-mode'
        });
        
        // Report filtered content for stats
        const originalSrc = img.src;
        reportFilteredContent('image', originalSrc, 'filtered-image');
      }
    }, 500);
  } catch (error) {
    console.error('Error processing image for filtering:', error);
    
    // Fallback to local basic filtering if there's an error
    if (shouldFilterImageLocally(img)) {
      applyImageFilter(img, { 
        shouldFilter: true, 
        confidence: 0.8,
        method: 'local-fallback'
      });
      
      // Report filtered content for stats
      const originalSrc = img.src;
      reportFilteredContent('image', originalSrc, 'filtered-image-local');
    }
  }
}

// Create a loading indicator for image processing
function createLoadingIndicator(img) {
  // Skip if already has a loading indicator
  if (img.nextElementSibling && img.nextElementSibling.classList.contains('socio-io-loading')) {
    return img.nextElementSibling;
  }
  
  const rect = img.getBoundingClientRect();
  const indicator = document.createElement('div');
  indicator.className = 'socio-io-loading';
  
  // Apply styles with !important to ensure visibility
  indicator.style.cssText = `
    position: absolute !important;
    top: ${rect.top + window.scrollY}px !important;
    left: ${rect.left + window.scrollX}px !important;
    width: ${img.width}px !important;
    height: ${img.height}px !important;
    background-color: rgba(0, 0, 0, 0.2) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 9999 !important;
    pointer-events: auto !important;
  `;
  
  const spinner = document.createElement('div');
  spinner.className = 'socio-io-spinner';
  spinner.style.cssText = `
    width: 30px !important;
    height: 30px !important;
    border: 3px solid rgba(255, 255, 255, 0.3) !important;
    border-radius: 50% !important;
    border-top: 3px solid #fff !important;
    animation: socio-io-spin 1s linear infinite !important;
  `;
  
  // Add keyframes for spinner animation if not already added
  if (!document.getElementById('socio-io-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'socio-io-spinner-style';
    style.textContent = `
      @keyframes socio-io-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  indicator.appendChild(spinner);
  document.body.appendChild(indicator);
  
  return indicator;
}

// Basic local image filtering check
function shouldFilterImageLocally(img) {
  // This is a very basic check that could be enhanced
  // For now, we'll just check if the image has certain dimensions
  // that might indicate it's a banner or advertisement
  const aspectRatio = img.width / img.height;
  
  // Common ad banner sizes often have extreme aspect ratios
  return (aspectRatio > 3 || aspectRatio < 0.3) && 
         (img.width > 300 || img.height > 300);
}

// Apply filter to an explicit image
function applyImageFilter(img, data) {
  // Skip if already filtered
  if (img.classList.contains('socio-io-filtered')) return;
  
  // Save original state
  const originalSrc = img.src;
  const originalStyle = img.getAttribute('style') || '';
  
  // Create a wrapper div
  const wrapper = document.createElement('div');
  wrapper.className = 'socio-io-image-wrapper';
  
  // Set wrapper to match image dimensions and position
  const imgRect = img.getBoundingClientRect();
  const imgStyles = window.getComputedStyle(img);
  
  wrapper.style.cssText = `
    position: relative !important;
    display: inline-block !important;
    width: ${img.width}px !important;
    height: ${img.height}px !important;
    margin: ${imgStyles.margin} !important;
    padding: 0 !important;
    overflow: hidden !important;
  `;
  
  // Apply blur to the image
  img.classList.add('socio-io-filtered');
  img.style.cssText = `
    filter: blur(30px) grayscale(0.7) !important;
    z-index: 1 !important;
    position: relative !important;
  `;
  
  // Format confidence score for display
  const confidencePercent = Math.round((data.confidence || 0) * 100);
  const filterMethod = data.method || 'AI';
  
  // Create an overlay with disclaimer
  const overlay = document.createElement('div');
  overlay.className = 'socio-io-overlay';
  
  // Apply overlay styles directly
  overlay.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background-color: rgba(0, 0, 0, 0.7) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 10000 !important;
  `;
  
  // Create disclaimer content
  const disclaimer = document.createElement('div');
  disclaimer.className = 'socio-io-disclaimer';
  disclaimer.style.cssText = `
    background-color: white !important;
    padding: 16px 20px !important;
    border-radius: 8px !important;
    max-width: 90% !important;
    text-align: center !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
    border-top: 4px solid #3B82F6 !important;
  `;
  
  // Simple content with minimal HTML
  disclaimer.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold; color: #333;">Content Filtered by Socio.io</div>
    <p style="margin-bottom: 10px; color: #666;">This image has been automatically blurred because it may contain inappropriate content.</p>
    <div style="font-size: 12px; color: #888;">
      Confidence: ${confidencePercent}% | Method: ${filterMethod}
    </div>
  `;
  
  overlay.appendChild(disclaimer);
  
  // Insert the elements - make sure parent node exists before inserting
  if (img.parentNode) {
    // First insert wrapper before the image
    img.parentNode.insertBefore(wrapper, img);
    // Then move the image inside the wrapper
    wrapper.appendChild(img);
    // Then add the overlay inside the wrapper
    wrapper.appendChild(overlay);
    
    // Store for recovery
    const index = filteredElements.images.length;
    filteredElements.images.push({
      img,
      wrapper,
      overlay,
      originalSrc,
      originalStyle,
      index
    });
    
    // Report to background with image URL
    reportFilteredContent('image', originalSrc, originalSrc);
  } else {
    console.error('Cannot apply filter: image has no parent node');
  }
}

// Set up mutation observer to handle dynamic content
function setupMutationObserver() {
  // Disconnect existing observer if any
  if (window.socioIoObserver) {
    window.socioIoObserver.disconnect();
  }
  
  // Create a new observer
  window.socioIoObserver = new MutationObserver(mutations => {
    let shouldFilterText = false;
    let shouldFilterImages = false;
    
    // Check for added nodes
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for new images
            if (config.filterImages) {
              const images = node.querySelectorAll('img');
              if (images.length > 0) {
                shouldFilterImages = true;
              }
            }
            
            // Check for new text
            if (config.filterText && node.textContent && node.textContent.trim().length > 0) {
              shouldFilterText = true;
            }
          }
        });
      }
    });
    
    // Apply filters if needed
    if (shouldFilterText && config.filterText) {
      filterTextContent();
    }
    
    if (shouldFilterImages && config.filterImages) {
      filterImageContent();
    }
  });
  
  // Start observing
  window.socioIoObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Report filtered content to the background script
function reportFilteredContent(type, original, filtered) {
  const url = new URL(window.location.href);
  const domain = url.hostname;
  
  console.log(`Reporting filtered ${type} content to background`);
  
  // Make sure type is either 'text' or 'image'
  const validType = (type === 'text' || type === 'image') ? type : 'image';
  
  // Update stats locally first (for demo purposes)
  // This ensures stats are tracked even if messaging fails
  try {
    // Get current stats from local storage
    const statsKey = `socio_io_stats_${validType}`;
    let currentCount = parseInt(localStorage.getItem(statsKey) || '0');
    currentCount++;
    localStorage.setItem(statsKey, currentCount.toString());
    
    console.log(`Local stats updated: ${validType} = ${currentCount}`);
  } catch (error) {
    console.error('Error updating local stats:', error);
  }
  
  // First update the stats - with better error handling
  const updateStats = () => {
    try {
      chrome.runtime.sendMessage({
        action: 'updateStats',
        type: validType
      }, response => {
        // Only log success, ignore errors
        if (!chrome.runtime.lastError) {
          console.log('Stats updated successfully');
        }
      });
    } catch (error) {
      console.log('Stats update handled locally only');
    }
  };
  
  // Execute the stats update
  updateStats();
  
  // Then add to history - with better error handling
  const addToHistory = () => {
    try {
      chrome.runtime.sendMessage({
        action: 'addToHistory',
        domain: domain,
        type: validType,
        content: original,
        replacement: filtered
      }, response => {
        // Only log success, ignore errors
        if (!chrome.runtime.lastError) {
          console.log('Added to history successfully');
        }
      });
    } catch (error) {
      console.log('History update skipped');
    }
  };
  
  // Execute the history update
  addToHistory();
}

// Recover filtered content
function recoverFilteredContent(type, index) {
  if (type === 'text' && filteredElements.text[index]) {
    const item = filteredElements.text[index];
    item.node.nodeValue = item.original;
  } else if (type === 'image' && filteredElements.images[index]) {
    const item = filteredElements.images[index];
    
    // Restore image
    if (item.img) {
      item.img.classList.remove('socio-io-filtered');
      item.img.style = item.originalStyle;
      
      // Unwrap from the container
      if (item.wrapper && item.wrapper.parentNode) {
        const parent = item.wrapper.parentNode;
        parent.insertBefore(item.img, item.wrapper);
        parent.removeChild(item.wrapper);
        console.log('Image recovered successfully');
      } else {
        console.error('Cannot recover image: wrapper not found');
      }
    } else {
      console.error('Cannot recover image: original image not found');
    }
  }
}