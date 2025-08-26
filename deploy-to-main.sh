#!/bin/bash

# Build and Deploy Embed Widget to Main AnythingLLM Repository
# This script builds the embed project and copies the files to the main repo

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EMBED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_REPO_DIR="../anything-llm"
TARGET_DIR="$MAIN_REPO_DIR/frontend/public/embed"

echo -e "${BLUE}🚀 Building and Deploying AnythingLLM Embed Widget${NC}"
echo "=============================================="

# Step 1: Verify we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "vite.config.js" ]; then
    echo -e "${RED}❌ Error: Not in the embed project directory${NC}"
    exit 1
fi

# Step 2: Verify main repo exists
if [ ! -d "$MAIN_REPO_DIR" ]; then
    echo -e "${RED}❌ Error: Main AnythingLLM repository not found at $MAIN_REPO_DIR${NC}"
    exit 1
fi

# Step 3: Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
if [ -d "dist" ]; then
    rm -rf dist
fi

# Step 4: Install dependencies (if node_modules doesn't exist)
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Step 5: Build the project
echo -e "${YELLOW}🔨 Building embed widget...${NC}"
npm run build

# Step 6: Verify build files exist
if [ ! -f "dist/anythingllm-chat-widget.min.js" ] || [ ! -f "dist/anythingllm-chat-widget.min.css" ]; then
    echo -e "${RED}❌ Error: Build files not found. Build may have failed.${NC}"
    exit 1
fi

# Step 7: Create target directory if it doesn't exist
echo -e "${YELLOW}📁 Ensuring target directory exists...${NC}"
mkdir -p "$TARGET_DIR"

# Step 8: Backup existing files (if they exist)
if [ -f "$TARGET_DIR/anythingllm-chat-widget.min.js" ]; then
    echo -e "${YELLOW}💾 Backing up existing files...${NC}"
    cp "$TARGET_DIR/anythingllm-chat-widget.min.js" "$TARGET_DIR/anythingllm-chat-widget.min.js.backup.$(date +%Y%m%d_%H%M%S)"
fi

if [ -f "$TARGET_DIR/anythingllm-chat-widget.min.css" ]; then
    cp "$TARGET_DIR/anythingllm-chat-widget.min.css" "$TARGET_DIR/anythingllm-chat-widget.min.css.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Step 9: Copy new files
echo -e "${YELLOW}📋 Copying new build files to main repository...${NC}"
cp "dist/anythingllm-chat-widget.min.js" "$TARGET_DIR/"
cp "dist/anythingllm-chat-widget.min.css" "$TARGET_DIR/"

# Step 10: Verify files were copied
if [ -f "$TARGET_DIR/anythingllm-chat-widget.min.js" ] && [ -f "$TARGET_DIR/anythingllm-chat-widget.min.css" ]; then
    echo -e "${GREEN}✅ Files successfully copied to main repository!${NC}"
else
    echo -e "${RED}❌ Error: Files were not copied successfully${NC}"
    exit 1
fi

# Step 11: Show file sizes and info
echo ""
echo -e "${BLUE}📊 Build Information:${NC}"
echo "JavaScript file: $(ls -lh dist/anythingllm-chat-widget.min.js | awk '{print $5}')"
echo "CSS file: $(ls -lh dist/anythingllm-chat-widget.min.css | awk '{print $5}')"
echo ""
echo -e "${BLUE}📍 Files deployed to:${NC}"
echo "JS:  $TARGET_DIR/anythingllm-chat-widget.min.js"
echo "CSS: $TARGET_DIR/anythingllm-chat-widget.min.css"

echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo "1. Navigate to the main AnythingLLM directory: cd $MAIN_REPO_DIR"
echo "2. Build the Docker image or run the development server"
echo "3. Test the updated embed widget functionality"

# Optional: Show git status in main repo
if [ -d "$MAIN_REPO_DIR/.git" ]; then
    echo ""
    echo -e "${BLUE}📊 Git status in main repository:${NC}"
    cd "$MAIN_REPO_DIR"
    git status --porcelain frontend/public/embed/ || echo "No git changes detected"
fi