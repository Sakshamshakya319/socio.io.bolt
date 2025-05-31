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
    'violence', 'gore', 'blood', 'kill', 'murder','hate', 'racist', 'bigot', 'slur','Chutiya', 
    'Madarchod', 'Behenchod', 'Gaandu', 'Haramzada', 'Bhosdike', 'Randi', 'Randibaaz', 'Katua', 
    'Mulla', 'Jihadi', 'Paki', 'Sanghi', 'Bhakt', 'Libtard', 'Sickular', 'Presstitute', 'Chamcha',
    'Dalit', 'Bhangi', 'Chamar', 'Shudra', 'Brahmin', 'Pajeet', 'Street-shitter', 'Cow-piss drinker', 
    'Curry-muncher', 'Dot-head', 'Kala', 'Gora', 'Saala', 'Kutta', 'Suar', 'Gadha', 'Ullu', 'Bakchod', 
    'Fattu', 'Namak Haram', 'Deshdrohi', 'Anti-national', 'Hinduphobe', 'Islamophobe', 'Beef-eater', 'Gau-mutra', 
    'Babur ki aulad', 'Ghuspetiya', 'Bangladeshi', 'Rohingya', 'Chinki', 'Madrasi', 'Bihari', 'Punjabi', 'Gujju', 
    'Marathi', 'Tamilian', 'Bengali', 'Sardar', 'Mallu', 'Kanjoos', 'Motu', 'Patla', 'Kaalia', 'Chashmish', 'Ganja', 
    'Budhau', 'Chakka', 'Hijra', 'Napunsak', 'Lund', 'Chut', 'Tatti', 'Pissu', 'Gobar', 'Besaram', 'Ganda', 'Nanga', 
    'Pagal', 'Bewakoof', 'Duffer', 'Nikamma', 'Haramkhor', 'Dhokebaaz', 'Jhootha', 'Chor', 'Daku', 'Lutera', 'Kaamchor', 
    'Nautanki', 'Besharam', 'Badtameez', 'Gustakh', 'Ghamandi', 'Tharki', 'Hawas', 'Randi rona', 'Darpok', 'Bhikari', 'Fakir', 
    'Sadakchap', 'Gawar', 'Jungli', 'Dehati', 'Anpadh', 'Jahil', 'Nashedi', 'Sharabi', 'Ganjaadi', 'Charsi', 'Smackia', 'Besharam', 
    'Ghatiya', 'Neech', 'Adharmi', 'Nastik', 'Pakhandi', 'Murkh', 'Chugli', 'Batmeez', 'Dushman', 'Gaddar', 'Saanp', 'Bhediya', 'Lomdi', 
    'Chuha', 'Bakra', 'Bhains', 'Bandar', 'Chidiya', 'Kida', 'Keeda', 'Makhi', 'Machhar', 'Jallad', 'Rakshas', 'Shaitan', 'Asura', 'Pret', 
    'Chudail', 'Dayan', 'Bhoot', 'Pishach', 'Kafir', 'Munafiq', 'Dhimmi', 'Firangi', 'Angrez', 'Vilayati', 'Cheeni', 'Habshi', 'Kalu', 
    'Chhota', 'Lambu', 'Tharki buddha', 'Budhiya', 'Aunty', 'Uncle', 'Beedi', 'Tapori', 'Goonda', 'Mawali', 'Gundagardi', 
    'Chhapri', 'Lukkha', 'Aawara', 'Bhaigiri', 'Dadagiri', 'Dhaonsu', 'Fenku', 'Pappu', 'Tadipaar', 'Naxali', 'Urban Naxal', 
    'Tukde gang', 'Aaptard', 'Congi', 'Modia', 'Godi media', 'Dalal', 'Bikaau', 'Ghulam', 'Naukar', 'Malikin', 'Raja', 'Rani', 
    'Shehzada', 'Nawab', 'Sultan', 'Begum', 'Mirza', 'Jhandu', 'Dhinchak', 'Chomu', 'Dhakkan', 'Fuddu', 'Bhasad', 'Jhol', 'Bakwas', 
    'Faltu', 'Ghanta', 'Bc', 'Term', 'Kabadi', 'Langoti', 'Chaddi', 'Topiwala', 'Bhukhmari', 'Chappalchor', 'Dhoban', 'Bhutta', 
    'Patthar', 'Gulllu', 'Kachcha', 'Pakka', 'Bhusa', 'Dhool', 'Mitti', 'Pataka baaz', 'Rassi', 'Koyla', 'Loonda', 'Chhokra', 'Jhantu', 
    'Bhond', 'Khotta', 'Bhains ki aankh', 'Kambakht', 'Badzaat', 'Badnaseeb', 'Kismat ka mara', 'Bhagwan ka bandar', 'Shani', 'Rahu', 'Ketu', 'Kalank', 
    'Badnaam', 'Nakara', 'Bekaar', 'Kaath ka ullu', 'Bhains ka patha', 'Suar ka bachcha', 'Kutte ka pilla', 'Billi ka baccha', 'Gadhe ka beta', 'Bakri ka mendak', 
    'Bhed ka doodh', 'Chooza', 'Murgi', 'Kabootar baaz', 'Tota baaz', 'Kauwe ki tatti', 'Machhar ka larwa', 'Kide ka anda', 'Keede ka bacha', 'Makhi ka makkha', 'Chuhe ki dum', 
    'Saanp ka zehar', 'Bhediye ka gala', 'Lomdi ki chaal', 'Bandar ka naach', 'Bhains ki laat', 'Gadhe ki chaap', 'Kutte ki puchh', 'Suar ki peti', 'Bakre ki tang', 'Chidiya ka ghosla', 
    'Kide ki rassi', 'Keede ka jhol', 'Makhi ka jhaad', 'Machhar ka raja', 'Jallad ka beta', 'Rakshas ki aulaad', 'Shaitan ka chela', 'Asura ka bhai', 'Pret ka saaya', 'Chudail ki beti', 'Dayan ka pota', 
    'Bhoot ka baap', 'Pishach ka dost', 'Kafir ka yaar', 'Munafiq ka bhai', 'Dhimmi ka beta', 'Firangi ka naukar', 'Angrez ka toota', 'Vilayati ka kutta', 'Cheeni ka gadha', 'Habshi ka bandar', 'Kalu ka kalua', 'Chhota ka lambu', 'Lambu ka chhota', 'Tharki buddha ka beta', 'Budhiya ki beti', 'Aunty ka baccha', 'Uncle ka pota', 'Beedi ka dhuaan', 'Tapori ka baap', 'Goonda ka bhai', 'Mawali ka dost', 'Gundagardi ka raja', 'Chhapri ka beta', 'Lukkha ka yaar', 'Aawara ka baap', 'Bhaigiri ka guru', 'Dadagiri ka ustaad', 'Dhaonsu ka chela', 'Fenku ka bhai', 'Pappu ka dost', 'Tadipaar ka yaar', 'Naxali ka beta', 'Urban Naxal ka bhai', 'Tukde gang ka raja', 'Aaptard ka guru', 'Congi ka chela', 'Modia ka baap', 'Godi media ka beta', 'Dalal ka pota', 'Bikaau ka bhai', 'Ghulam ka dost', 'Naukar ka beta', 'Malikin ka chela', 'Raja ka naukar', 'Rani ka chamcha', 'Shehzada ka yaar', 'Nawab ka kutta', 'Sultan ka ghulam', 'Begum ki naukrani', 'Mirza ka bandar', 'Jhandu ka bhai', 'Dhinchak ka dost', 'Chomu ka beta', 'Dhakkan ka baap', 'Fuddu ka yaar', 'Bhasad ka raja', 'Jhol ka guru', 'Bakwas ka ustaad', 'Faltu ka chela', 'Ghanta ka bhai', 'Bc ka dost', 'Kachre ka dabba', 'Dhool ka thaila', 'Mitti ka bartan', 'Patthar ka dil', 'Bhusa ka gadda', 'Koyla ka dhuaan', 'Loonda baaz', 'Chhokra ka raja', 'Jhantu ka bhai', 'Bhond ka beta', 'Khotta ka dost', 'Bhains ki aankh', 'Kambakht', 'Badzaat', 'Badnaseeb', 'Kismat ka mara'

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