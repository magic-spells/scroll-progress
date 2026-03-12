# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start Vite dev server at localhost:3001 (opens demo/index.html)
- `npm run prod` - Build with watch mode for production testing

### Building
- `npm run build` - Build distribution formats (ESM, UMD minified)

### Code Quality
- `npm run lint` - Run ESLint on source files and config files
- `npm run format` - Format code using Prettier

### Publishing
- `npm run prepublishOnly` - Automatically runs build before publishing

## Architecture

This is a **vanilla Web Component** library that creates a `<scroll-progress>` custom element for tracking scroll progress without scroll event listeners.

### Core Architecture
- **Single file implementation**: All functionality is in `src/scroll-progress.js` (~289 lines)
- **Web Component**: Extends `HTMLElement` and uses `customElements.define()`
- **Performance-focused**: Uses `requestAnimationFrame` + `IntersectionObserver` instead of scroll events
- **CSS Variable API**: Exposes `--scroll-progress` (0-1) for animations

### Key Design Patterns
- **Private fields**: Uses `#` private fields for internal state management
- **Observer pattern**: `IntersectionObserver` for visibility, `ResizeObserver` for element changes
- **Caching strategy**: Pre-calculates positions to minimize DOM reads during scroll
- **RAF loop**: Continuous update loop only when element is visible
- **Static style injection**: Injects base styles once per component definition

### Build System
- **Vite-based**: Two-format builds (ESM, UMD minified)
- **Development mode**: Vite dev server serves source directly at localhost:3001
- **No transpilation**: Modern browser targets, ES2022 syntax

### File Structure
- `src/scroll-progress.js` - Main component implementation
- `demo/` - Development demo files (HTML, served by Vite)
- `dist/` - Built distribution files (ESM + UMD)
- `vite.config.js` - Build and dev server configuration
- `eslint.config.js` - ESLint flat config for modern ES modules

### Component Attributes
- `playhead-element-start/end` - Element anchor points (top/center/bottom)
- `playhead-viewport-start/end` - Viewport anchor points (top/center/bottom)

### CSS Variables Exposed
- `--scroll-progress` - Scroll progress value (0-1)
- `--scroll-progress-velocity` - Scroll velocity with physics simulation

### Public API Methods
- `getProgress()` - Returns current scroll progress (0-1)
- `getVelocity()` - Returns current scroll velocity
- `update()` - Manually trigger position recalculation
- `pause()/resume()` - Control the internal RAF loop

### Events
- `scroll-progress:update` - Fired when progress changes (detail.progress)
- `scroll-progress:velocity` - Fired when velocity changes (detail.velocity)

### Velocity System
The velocity system tracks scroll delta frame-to-frame and applies physics:
- **Delta calculation**: `scrollDelta = currentScrollY - lastScrollY`
- **Smooth velocity accumulation**: `velocity += (targetVelocity - velocity) * smoothing` (15% smoothing)
- **Friction**: `velocity *= 0.8` (configurable via `#friction` field)
- **Attraction to zero**: `velocity *= 0.95` (configurable via `#attraction` field)
- **Clean zero state**: When velocity < 0.01 and no scrolling, velocity is set to exactly 0
- **RAF optimization**: Loop stops when element inactive AND velocity is exactly 0
- **Clamping**: Velocity is clamped to ±100 to prevent extreme values

**Demo Effects Available:**
- Skew: `skewX(calc(var(--scroll-progress-velocity) * 2deg))` - dramatic leaning effect
- Scale: `scale(calc(1 + abs(var(--scroll-progress-velocity)) * 0.01))` - size changes
- Rotate: `rotate(calc(var(--scroll-progress-velocity) * 2deg))` - spinning effect  
- Blur: `blur(calc(abs(var(--scroll-progress-velocity)) * 1px))` - motion blur
- Dynamic background: OKLCH color space with velocity-responsive lightness and chroma

This enables smooth velocity-based animations that respond to scroll speed and decay naturally when scrolling stops.

The component is designed for high performance scroll-based animations without traditional scroll event listeners.