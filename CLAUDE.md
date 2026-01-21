# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gemini Tagger Pro** is a React-based web application for batch image tagging using Google's Gemini AI models. It processes multiple images concurrently, generating descriptive tags through AI analysis with support for retry logic, image compression, and multi-endpoint configuration.

## Development Commands

### Essential Commands
- **Install dependencies**: `npm install`
- **Run development server**: `npm run dev`
- **Build for production**: `npm run build` (runs TypeScript compiler + Vite build)
- **Preview production build**: `npm run preview`

### Environment Setup
- Create `.env.local` in the project root
- Set `GEMINI_API_KEY` to your Google Gemini API key
- The app reads `process.env.API_KEY` as the default API key for the initial endpoint

## Architecture

### Core Structure
This is a **single-page application** with all UI logic contained in `App.tsx` (~700 lines). The architecture follows a monolithic React component pattern rather than a modular component structure.

### Key Files
- **`App.tsx`**: Main application component containing all UI, state management, and business logic
- **`types.ts`**: TypeScript definitions for the entire application
- **`index.tsx`**: React app entry point
- **`vite.config.ts`**: Vite build configuration

### State Management Pattern
The app uses React's built-in state management with no external libraries:

1. **Main State Objects**:
   - `items: TaggingItem[]` - Array of images being processed
   - `config: GlobalConfig` - All app configuration including endpoints, concurrency, retry logic, compression settings, and prompts
   - `isProcessing: boolean` - Processing lock flag
   - `activeTab` - UI tab navigation state

2. **Refs for Performance**:
   - `configRef` - Keeps current config accessible in async callbacks without stale closures
   - `stopRef` - Enables graceful processing cancellation
   - `fileInputRef`, `configInputRef` - DOM element references

3. **Optimized Rendering**:
   - `ItemCard` uses `React.memo` with custom comparison function
   - `useCallback` hooks for `handleTagUpdate` and `handleResetItem` to prevent unnecessary child re-renders

### Processing Flow

**Three-Stage Prompting System**:
1. **Stage 1**: System instruction defining the AI's role as an image tagging assistant
2. **Stage 2**: Confirmation message preparing the AI to receive images
3. **Stage 3**: Actual tagging request with specific instructions

**Concurrent Processing**:
- Uses `config.concurrency` to control parallel vs serial processing
- Implements a worker pool pattern: processes up to N images simultaneously
- Each item goes through: `pending` → `processing` → `completed`/`error`

**Retry Mechanism**:
- Automatic retry on failure (configurable via `config.retry.maxAttempts`)
- Tracks `attempts` per item
- Validates results (minimum character count via `config.validation.minChars`)
- Invalid results trigger automatic retry

**Image Compression**:
- Automatic compression before sending to API (configurable via `config.compression`)
- Reduces images larger than `maxSizeMB` by resizing to `maxWidthOrHeight` with `quality` setting
- Uses HTML5 Canvas API for client-side compression

### Endpoint System

**Two Endpoint Types**:
1. **`google_sdk`**: Direct Google Gemini SDK integration via `@google/genai`
2. **`openai_compatible`**: OpenAI-compatible API endpoints (custom base URL)

**Multi-Endpoint Support**:
- Configure multiple endpoints simultaneously
- Only endpoints with `active: true` are used during processing
- Round-robin distribution across active endpoints
- Each endpoint tracks connection status and available models

**Model Detection**:
- Google SDK endpoints use hardcoded `DEFAULT_GEMINI_MODELS` list
- OpenAI-compatible endpoints fetch models via `/models` API endpoint
- Connection testing via `fetchModelsForEndpoint()` function

### File Import Features

**Supported Formats**:
- Images: JPEG, PNG, WebP, BMP, GIF, TIFF
- Archives: ZIP files (auto-extracted)
- Text files: `.txt`, `.caption` (matched to images by basename)

**Smart Pairing**:
- Automatically pairs `.txt`/`.caption` files with images based on filename (without extension)
- Pre-tagged images (with matching text files) are marked as `completed` and skipped during processing
- Supports importing from ZIP archives with automatic extraction

**Import Process**:
1. Scans all files and ZIP archives
2. Extracts text files and builds a basename → content map
3. Creates `TaggingItem` objects for each image
4. Auto-completes items that have matching text files
5. Shows import progress with current file being processed

### Export Functionality

**Download Tags**:
- Exports as ZIP file containing all images + corresponding `.txt` files
- Uses `JSZip` library for client-side ZIP generation
- Only exports items with tags (completed or manually edited)

**Configuration Management**:
- Export entire app configuration as JSON
- Import previously saved configurations
- Strips runtime-only fields (`isChecking`, `connectionStatus`, etc.) during export

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS with custom dark theme
- **Icons**: Lucide React
- **AI SDK**: `@google/genai` for Google Gemini API
- **File Handling**: JSZip for ZIP creation/extraction
- **Mobile**: Capacitor 5 (Android support configured)

## Code Conventions

### Component Pattern
- Single main component (`App`) with inline sub-components
- `ItemCard` extracted as memoized component for performance
- Functional components with hooks throughout

### State Updates
- Always use functional updates (`setState(prev => ...)`) to avoid stale closure issues
- Critical for async operations and high-frequency updates

### Performance Considerations
- Image previews use `loading="lazy"` attribute
- `React.memo` on list items with custom comparison
- `useCallback` for callback props passed to memoized children
- Custom scrollbar styling via Tailwind classes

### Styling Approach
- Utility-first with Tailwind CSS
- Heavy use of backdrop blur, gradients, and shadows for modern glass-morphism UI
- Responsive grid layout (1 column mobile → 2-4 columns desktop)
- Status-based conditional styling (border colors, badges, etc.)

## Important Notes

- The API key in `.env.local` is used as the default for the first endpoint but can be overridden in the UI
- Processing can be stopped mid-operation using the Stop button (`stopRef.current = true`)
- All image processing happens client-side (compression, preview generation)
- Preview URLs are created via `URL.createObjectURL()` - consider memory cleanup for very large batches
- The app is designed for the AI Studio platform but can run standalone with proper API configuration
