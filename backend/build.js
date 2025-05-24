// Build script for the extension
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define paths
const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'browser-extension');
const distDir = path.join(rootDir, 'dist');

// Create directory if it doesn't exist
function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy a file
function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
}

// Main build function
function build() {
  console.log('Starting build process...');
  
  // Ensure directories exist
  ensureDirExists(distDir);
  
  try {
    // Clean previous build if exists
    if (fs.existsSync(distDir)) {
      console.log('Cleaning previous build...');
      fs.rmSync(distDir, { recursive: true, force: true });
      ensureDirExists(distDir);
    }
    
    // Copy extension files to dist
    console.log('Copying extension files...');
    
    // Copy browser extension files
    const extensionFiles = fs.readdirSync(extensionDir);
    extensionFiles.forEach(file => {
      const srcPath = path.join(extensionDir, file);
      const destPath = path.join(distDir, file);
      
      if (fs.statSync(srcPath).isDirectory()) {
        // Copy directory recursively
        ensureDirExists(destPath);
        const nestedFiles = fs.readdirSync(srcPath);
        nestedFiles.forEach(nestedFile => {
          copyFile(
            path.join(srcPath, nestedFile),
            path.join(destPath, nestedFile)
          );
        });
      } else {
        // Copy file
        copyFile(srcPath, destPath);
      }
    });
    
    console.log('Build completed successfully!');
    console.log(`Output directory: ${distDir}`);
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build();