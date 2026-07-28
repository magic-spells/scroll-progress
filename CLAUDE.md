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
- **Single file implementation**: All functionality is in `src/scroll-progress.js` (~383 lines)
- **Web Component**: `ScrollProgress` class extends `HTMLElement`, registered via `customElements.define()`
- **Global manager singleton**: `ScrollProgressManager` runs a single shared RAF loop and velocity calculation for all `<scroll-progress>` instances
- **Viewport metrics**: `ViewportMetrics` helper uses a `100svh` probe element to get stable viewport height on mobile Safari (avoids chrome bar shifts)
- **Performance-focused**: Uses `requestAnimationFrame` + `IntersectionObserver` instead of scroll events
- **CSS Variable API**: Exposes `--scroll-progress` (0-1) and `--scroll-progress-velocity` for animations
- **Reduced motion**: Respects `prefers-reduced-motion: reduce` — velocity is forced to 0

### Key Design Patterns
- **Hybrid privacy**: `#` private fields for internal state, `_` prefix for methods called by `ScrollProgressManager`
- **Observer pattern**: `IntersectionObserver` for visibility gating, `ResizeObserver` for element size changes
- **Caching strategy**: Pre-calculates anchor positions to minimize DOM reads during scroll
- **Global RAF loop**: Single `requestAnimationFrame` loop in `ScrollProgressManager` updates all visible elements; stops when velocity reaches 0 **and** every smoothed element has settled (invisible/paused elements can't hold it open)
- **Static style injection**: Injects base styles once per component definition

### Build System
- **Vite-based**: Two-format builds (ESM, UMD minified)
- **Development mode**: Vite dev server serves source directly at localhost:3001
- **No transpilation**: Modern browser targets
- **Size claims are hand-maintained** — the README badge + feature bullet and the demo's
  "Size (gzip)" chip all quote the UMD gzip size (~2.7 kB as of the current dist).
  Re-measure with `gzip -c dist/scroll-progress.min.js | wc -c` and update all three
  when the bundle changes materially; they've drifted stale before.

### File Structure
- `src/scroll-progress.js` - Main component implementation
- `demo/` - Development demo files (HTML, served by Vite)
- `dist/` - Built distribution files (ESM + UMD)
- `vite.config.js` - Build and dev server configuration
- `eslint.config.js` - ESLint flat config for modern ES modules

### Component Attributes
- `playhead-element-start/end` - Element anchor points (`top`/`center`/`bottom` or a percentage like `25%`)
- `playhead-viewport-start/end` - Viewport anchor points (same syntax)
- `smoothing` - Easing time constant in ms; `0`/absent/invalid = off

Anchors are parsed by `anchorToFraction()` into fractions (`top` = 0, `center` = 0.5, `bottom` = 1). Percentages are **not** clamped to 0–1 so over-scan anchors (`150%`, `-20%`) work. Invalid values never throw — one `console.warn` plus the attribute's default. Parsing happens in `#parseAnchors()` on attribute change (not in `_buildCache`) so resize-driven rebuilds don't spam the warning.

### Progress Smoothing
- `#currentProgress` eases toward the raw target per frame: `current += (target - current) * (1 - Math.exp(-delta / smoothing))`, using the rAF timestamp delta clamped to `MAX_FRAME_DELTA` (64ms) so a woken loop can't take one huge step.
- Settles when the gap is `<= SNAP_EPSILON` (0.0005) and snaps exact. Because the final easing steps are smaller than the 0.001 publish epsilon, settling force-publishes once — otherwise the resting CSS var would sit short of the target.
- **Snap triggers** (`#snapNext`): `_buildCache()` when the recomputed range moved more than `RANGE_EPSILON` (0.5px) — resize / `ResizeObserver` / `update()` / attribute change; the epsilon keeps mobile visualViewport resize storms (identical rebuilds) from collapsing an in-flight ease. Also: visibility false→true in both the IO callback and `_updateVisibilityFallback`, a `smoothing` attribute change, and the first tick (`#currentProgress === null`). `prefers-reduced-motion` bypasses smoothing entirely.
- When smoothing is on, `--scroll-progress`, `scroll-progress:update`, and `getProgress()` all carry the smoothed value; the raw target stays internal.

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
The velocity system lives in `ScrollProgressManager` and tracks scroll delta frame-to-frame with physics:
- **Delta calculation**: `scrollDelta = currentScrollY - lastScrollY` (in `onScroll`)
- **Smooth velocity accumulation**: `velocity += (delta - velocity) * smoothing` (smoothing = 0.15)
- **Combined decay**: `velocity *= decay` where `decay = 0.76` (friction 0.8 × attraction 0.95 combined into single multiply)
- **Clean zero state**: When `|velocity| < 0.01` (`velocityThreshold`), velocity snaps to exactly 0
- **RAF optimization**: Global RAF loop stops when velocity reaches 0; restarts on scroll/resize
- **Clamping**: Velocity clamped to ±100 (`maxVelocity`)
- **Reduced motion**: When `prefers-reduced-motion: reduce` matches, velocity is forced to 0

**Demo Effects Available:**
- Skew: `skewX(calc(var(--scroll-progress-velocity) * 2deg))` - dramatic leaning effect
- Scale: `scale(calc(1 + abs(var(--scroll-progress-velocity)) * 0.01))` - size changes
- Rotate: `rotate(calc(var(--scroll-progress-velocity) * 2deg))` - spinning effect  
- Blur: `blur(calc(abs(var(--scroll-progress-velocity)) * 1px))` - motion blur
- Dynamic background: OKLCH color space with velocity-responsive lightness and chroma

This enables smooth velocity-based animations that respond to scroll speed and decay naturally when scrolling stops.

The component is designed for high performance scroll-based animations without traditional scroll event listeners.