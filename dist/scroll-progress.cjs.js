'use strict';

/* scroll-progress web component
 * provides a custom element for tracking scroll progress and exposing it
 * as a css variable (--scroll-progress), with gpu-optimized settings.
 * no scroll event listeners are used; everything is rAF + observers.
 */

// throttle utility
function throttle(fn, wait) {
	let lastTime = 0;
	return function (...args) {
		const now = Date.now();
		if (now - lastTime >= wait) {
			lastTime = now;
			fn.apply(this, args);
		}
	};
}

class ScrollProgress extends HTMLElement {
	// private fields
	#cache = null;
	#cachedViewportHeight = 0;
	#resizeObserver = null;
	#intersectionObserver = null;
	#isActive = false;
	#rafId = null;
	#handleResize = null;
	#lastProgress = -1;

	static #styleInjected = false;
	static #injectBaseStyles() {
		if (ScrollProgress.#styleInjected) return;

		const styleTag = document.createElement('style');
		styleTag.textContent = `scroll-progress {
	display: block;
	--scroll-progress: 0;
	will-change: transform;
	transform-style: preserve-3d;
	backface-visibility: hidden; }`;
		document.head.appendChild(styleTag);
		ScrollProgress.#styleInjected = true;
	}

	static get observedAttributes() {
		return [
			'playhead-element-start',
			'playhead-viewport-start',
			'playhead-element-end',
			'playhead-viewport-end',
		];
	}

	constructor() {
		super();
		ScrollProgress.#injectBaseStyles();
	}

	connectedCallback() {
		this.#cachedViewportHeight = window.innerHeight;
		this.#initializeCache();
		this.#setupObservers();
		this.#attachEventListeners();
		this.#startRafLoop();
	}

	disconnectedCallback() {
		this.#stopRafLoop();
		this.#detachEventListeners();
		this.#cleanupObservers();
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue !== newValue && this.#cache) {
			this.#initializeCache();
		}
	}

	#initializeCache() {
		const rect = this.getBoundingClientRect();
		this.#cache = {
			elementStartAnchor: this.getAttribute('playhead-element-start') || 'top',
			viewportStartAnchor: this.getAttribute('playhead-viewport-start') || 'bottom',
			elementEndAnchor: this.getAttribute('playhead-element-end') || 'bottom',
			viewportEndAnchor: this.getAttribute('playhead-viewport-end') || 'top',
			elementStartPosition: 0,
			elementEndPosition: 0,
			viewportStartPosition: 0,
			viewportEndPosition: 0,
			totalDistance: 0,
		};

		this.#updateCachedPositions(rect);
	}

	#updateCachedPositions(rect) {
		if (!rect) rect = this.getBoundingClientRect();
		if (!this.#cache) return;

		this.#cache.elementStartPosition = this.#getElementAnchorPosition(
			this.#cache.elementStartAnchor,
			rect
		);
		this.#cache.elementEndPosition = this.#getElementAnchorPosition(
			this.#cache.elementEndAnchor,
			rect
		);

		this.#cache.viewportStartPosition = this.#getViewportAnchorPosition(
			this.#cache.viewportStartAnchor,
			this.#cachedViewportHeight
		);
		this.#cache.viewportEndPosition = this.#getViewportAnchorPosition(
			this.#cache.viewportEndAnchor,
			this.#cachedViewportHeight
		);

		this.#cache.totalDistance =
			this.#cache.elementEndPosition -
			this.#cache.viewportEndPosition -
			(this.#cache.elementStartPosition - this.#cache.viewportStartPosition);

		if (this.#cache.totalDistance < 0) {
			console.warn('<scroll-progress> totalDistance negative, check anchors');
			this.#cache.totalDistance = Math.abs(this.#cache.totalDistance);
		}
	}

	#getElementAnchorPosition(anchor, rect) {
		if (anchor === 'top') return rect.top;
		if (anchor === 'center') return rect.top + rect.height / 2;
		return rect.bottom;
	}

	#getViewportAnchorPosition(anchor, viewportHeight) {
		if (anchor === 'top') return 0;
		if (anchor === 'center') return viewportHeight / 2;
		return viewportHeight;
	}

	#clamp(value, min, max) {
		return value < min ? min : value > max ? max : value;
	}

	#startRafLoop() {
		const updateLoop = () => {
			if (this.#isActive) {
				this.#updateScrollProgress();
			}
			this.#rafId = requestAnimationFrame(updateLoop);
		};
		this.#rafId = requestAnimationFrame(updateLoop);
	}

	#stopRafLoop() {
		if (this.#rafId) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}

	#updateScrollProgress() {
		if (!this.#cache) return;

		const rect = this.getBoundingClientRect();
		const currentElementStart = this.#getElementAnchorPosition(
			this.#cache.elementStartAnchor,
			rect
		);

		const currentDistance = this.#cache.viewportStartPosition - currentElementStart;
		const progress =
			this.#cache.totalDistance === 0
				? 0
				: this.#clamp(currentDistance / this.#cache.totalDistance, 0, 1);

		if (Math.abs(progress - this.#lastProgress) > 0.001) {
			this.#lastProgress = progress;
			this.style.setProperty('--scroll-progress', progress);
			this.dispatchEvent(
				new CustomEvent('scroll-progress:update', {
					detail: { progress },
					bubbles: true,
				})
			);
		}
	}

	#setupObservers() {
		if ('ResizeObserver' in window) {
			this.#resizeObserver = new ResizeObserver((entries) => {
				entries.forEach((entry) => {
					if (entry.target === this) {
						this.#updateCachedPositions(entry.contentRect);
					}
				});
			});
			this.#resizeObserver.observe(this);
		}

		if ('IntersectionObserver' in window) {
			const observerOptions = {
				rootMargin: '50% 0px 50% 0px',
			};

			this.#intersectionObserver = new IntersectionObserver((entries) => {
				entries.forEach((entry) => {
					if (entry.target === this) {
						this.#isActive = entry.isIntersecting;
					}
				});
			}, observerOptions);

			this.#intersectionObserver.observe(this);
		} else {
			this.#isActive = true;
		}
	}

	#cleanupObservers() {
		if (this.#resizeObserver) {
			this.#resizeObserver.disconnect();
			this.#resizeObserver = null;
		}

		if (this.#intersectionObserver) {
			this.#intersectionObserver.disconnect();
			this.#intersectionObserver = null;
		}
	}

	#attachEventListeners() {
		const resizeHandler = () => {
			this.#cachedViewportHeight = window.innerHeight;
			if (this.#cache) {
				this.#cache.viewportStartPosition = this.#getViewportAnchorPosition(
					this.#cache.viewportStartAnchor,
					this.#cachedViewportHeight
				);
				this.#cache.viewportEndPosition = this.#getViewportAnchorPosition(
					this.#cache.viewportEndAnchor,
					this.#cachedViewportHeight
				);
				this.#cache.totalDistance =
					this.#cache.elementEndPosition -
					this.#cache.viewportEndPosition -
					(this.#cache.elementStartPosition - this.#cache.viewportStartPosition);
				this.#updateCachedPositions();
			}
		};

		this.#handleResize = throttle(resizeHandler, 50);
		window.addEventListener('resize', this.#handleResize);
	}

	#detachEventListeners() {
		if (this.#handleResize) {
			window.removeEventListener('resize', this.#handleResize);
			this.#handleResize = null;
		}
	}

	getProgress() {
		return parseFloat(this.style.getPropertyValue('--scroll-progress') || 0);
	}

	update() {
		if (this.#cache) {
			this.#updateCachedPositions();
		}
	}

	pause() {
		this.#stopRafLoop();
	}

	resume() {
		if (!this.#rafId) {
			this.#startRafLoop();
		}
	}
}

if (!customElements.get('scroll-progress')) {
	customElements.define('scroll-progress', ScrollProgress);
}

exports.ScrollProgress = ScrollProgress;
//# sourceMappingURL=scroll-progress.cjs.js.map
