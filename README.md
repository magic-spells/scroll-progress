# Scroll Progress Web Component

A high-performance, customizable Web Component that tracks scroll progress relative to configurable playhead anchors on the element and viewport. It exposes a smooth, GPU-accelerated CSS variable (`--scroll-progress`) for scroll-based animations without relying on scroll event listeners.

[**Live Demo**](https://magic-spells.github.io/scroll-progress/demo/)

## Features

- 🎯 **Configurable playhead anchors** for both element and viewport start/end positions
- ⚡ **Optimized animations** driven by `requestAnimationFrame` (no scroll events)
- 🖥️ **GPU accelerated** using `transform-style: preserve-3d` and `will-change: transform`
- 🕵️‍♂️ **Visibility-aware** updates using Intersection Observer to minimize CPU usage
- 📏 **Responsive to viewport resizes** with throttled resize handling
- 🌐 **Framework agnostic** — works with any frontend framework or vanilla JS
- 📦 **Lightweight & zero dependencies** - Only 1.5kb gzipped!
- 🔧 **Simple API & CSS custom property exposure** for full styling control

## Installation

```bash
npm install @magic-spells/scroll-progress
```

```javascript
// Import the component in your JS entry point
import '@magic-spells/scroll-progress';
```

Or include directly via CDN:

```html
<script src="https://unpkg.com/@magic-spells/scroll-progress"></script>
```

## Usage

Add the custom element anywhere in your HTML:

```html
<scroll-progress
	playhead-element-start="top"
	playhead-viewport-start="bottom"
	playhead-element-end="bottom"
	playhead-viewport-end="top">
	<!-- child elements animated with --scroll-progress -->
	<div class="animated-layer" style="transform: translateX(calc(var(--scroll-progress) * 100%));">
		Scroll me!
	</div>
</scroll-progress>
```

### Playhead Anchors

- `playhead-element-start` and `playhead-element-end`: anchors on the element (`top`, `center`, or `bottom`)
- `playhead-viewport-start` and `playhead-viewport-end`: anchors on the viewport (`top`, `center`, or `bottom`)

These determine the start and end points for scroll progress calculation.

---

## API

### Public Methods

- `getProgress()`: Returns current scroll progress (0 to 1)
- `update()`: Manually triggers recalculation of cached positions
- `pause()`: Pauses the internal animation frame loop
- `resume()`: Resumes the internal animation frame loop

### Events

- `scroll-progress:update`: Fired whenever the scroll progress updates significantly
  - `event.detail.progress`: number between 0 and 1

---

## Customization

The component exposes a single CSS custom property:

- `--scroll-progress` — value between 0 and 1 representing the normalized scroll position between configured playheads

Use this property in child elements to drive any CSS animation, e.g.:

```css
.animated-layer {
	transform: translateX(calc(var(--scroll-progress) * 100%));
	transition: transform 0.1s ease-out;
}
```

### Styling the Host

The component injects these base styles by default:

```css
scroll-progress {
	display: block;
	--scroll-progress: 0;
	will-change: transform;
	transform-style: preserve-3d;
	backface-visibility: hidden;
}
```

Override these as needed in your stylesheets.

---

## How It Works

- On initialization, the component calculates anchor positions relative to both the element and viewport.
- Scroll progress is updated via `requestAnimationFrame` loops only when the element is visible in the viewport, leveraging `IntersectionObserver` for gating.
- Resizes trigger recalculations of viewport and element anchors with a throttled resize event listener.
- Scroll progress is exposed as a CSS variable (`--scroll-progress`) for smooth, GPU-accelerated animations with no scroll event listeners, improving performance.

---

## Integration Example

```javascript
const scrollProgress = document.querySelector('scroll-progress');

// listen for progress updates
scrollProgress.addEventListener('scroll-progress:update', (event) => {
	console.log('scroll progress:', event.detail.progress);
});

// manually read progress
console.log(scrollProgress.getProgress());
```

---

## Browser Support

Supports all modern browsers with Web Components, Intersection Observer, and Resize Observer:

- Chrome 54+
- Firefox 63+
- Safari 10.1+
- Edge 79+

---

## License

MIT

---

## Repository & Issues

[https://github.com/magic-spells/scroll-progress](https://github.com/magic-spells/scroll-progress)

Report bugs and request features via GitHub issues.

---

If you want, i can help format this as markdown or add badges or any additional sections you want. Just let me know!
