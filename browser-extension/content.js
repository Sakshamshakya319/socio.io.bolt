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
  if (!config.apiUrl) return;
  
  const text = textNode.nodeValue;
  
  fetch(`${config.apiUrl}/filter/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  })
  .then(response => response.json())
  .then(data => {
    if (data.hasExplicitContent && data.filtered !== text) {
      // Apply filtered text
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
    console.error('Error filtering text:', error);
  });
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
  if (!config.apiUrl) return;
  
  // Create a canvas to get image data
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  
  try {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    
    // Convert to blob for sending to API
    canvas.toBlob(blob => {
      if (!blob) return;
      
      const formData = new FormData();
      formData.append('image', blob);
      
      fetch(`${config.apiUrl}/filter/image`, {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.shouldFilter) {
          // Apply filter to the image
          applyImageFilter(img, data);
        }
      })
      .catch(error => {
        console.error('Error filtering image:', error);
      });
    }, 'image/jpeg', 0.95);
  } catch (error) {
    console.error('Error processing image for filtering:', error);
  }
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
  
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.width = `${img.width}px`;
  wrapper.style.height = `${img.height}px`;
  wrapper.style.margin = imgStyles.margin;
  
  // Apply blur to the image
  img.classList.add('socio-io-filtered');
  img.style.filter = 'blur(25px)';
  
  // Create an overlay with disclaimer
  const overlay = document.createElement('div');
  overlay.className = 'socio-io-overlay';
  overlay.innerHTML = `
    <div class="socio-io-disclaimer">
      <span>disclaimer this image is filtered by socio.io extension</span>
      <button class="socio-io-view-btn">View Image</button>
    </div>
  `;
  
  // Add event listener to the view button
  overlay.querySelector('.socio-io-view-btn').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Remove blur and overlay
    img.style.filter = '';
    overlay.style.display = 'none';
    
    // Store this image as "viewed" to not blur it again in this session
    img.dataset.socioioViewed = 'true';
  });
  
  // Insert the elements
  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);
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
  
  chrome.runtime.sendMessage({
    action: 'updateStats',
    type: type
  }, response => {
    // Log response to verify message was received
    console.log('Stats update response:', response);
  });
  
  chrome.runtime.sendMessage({
    action: 'addToHistory',
    domain: domain,
    type: type,
    content: original,
    replacement: filtered
  }, response => {
    // Log response to verify message was received
    console.log('History update response:', response);
  });
}

// Recover filtered content
function recoverFilteredContent(type, index) {
  if (type === 'text' && filteredElements.text[index]) {
    const item = filteredElements.text[index];
    item.node.nodeValue = item.original;
  } else if (type === 'image' && filteredElements.images[index]) {
    const item = filteredElements.images[index];
    
    // Restore image
    item.img.classList.remove('socio-io-filtered');
    item.img.style = item.originalStyle;
    
    // Unwrap from the container
    const parent = item.wrapper.parentNode;
    parent.insertBefore(item.img, item.wrapper);
    parent.removeChild(item.wrapper);
  }
}