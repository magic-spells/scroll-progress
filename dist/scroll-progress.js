(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ScrollProgress = {}));
})(this, (function (exports) { 'use strict';

	/*
	  scroll-progress web component
	  tracks scroll progress (0 to 1) and velocity for parallax or animation use
	  uses a single global rAF for velocity, and per-element observers for performance
	  no #private fields, supports all browsers
	*/

	// throttle helper: limits how often a function can run
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

	// clamp helper: keeps a number within a range
	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	// main global scroll + velocity manager
	const ScrollProgressManager = {
		elements: new Set(),
		lastScrollY: 0,
		velocity: 0,
		rafId: null,
		isListening: false,
		smoothing: 0.15,
		friction: 0.8,
		attraction: 0.95,
		velocityThreshold: 0.01,
		maxVelocity: 100,

		register(element) {
			this.elements.add(element);
			if (!this.isListening) this.start();
			element._receiveVelocity(this.velocity);
			this.tick();
		},

		unregister(element) {
			this.elements.delete(element);
			if (this.elements.size === 0) this.stop();
		},

		start() {
			this.lastScrollY = window.scrollY;
			this._boundScroll = this.onScroll.bind(this);
			window.addEventListener('scroll', this._boundScroll, { passive: true });
			this.isListening = true;
			this.rafId = requestAnimationFrame(this.onRaf.bind(this));
		},

		stop() {
			window.removeEventListener('scroll', this._boundScroll);
			this.isListening = false;
			this.velocity = 0;
			if (this.rafId) cancelAnimationFrame(this.rafId);
			this.rafId = null;
		},

		onScroll() {
			const y = window.scrollY;
			const delta = y - this.lastScrollY;
			this.lastScrollY = y;

			// respects prefers-reduced-motion
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				this.velocity = 0;
				this.tick();
				return;
			}

			const target = this.velocity + delta;
			this.velocity += (target - this.velocity) * this.smoothing;
			this.velocity = clamp(this.velocity, -this.maxVelocity, this.maxVelocity);
			this.tick();
		},

		tick() {
			// schedule a rAF tick if not already running
			if (!this.rafId) this.rafId = requestAnimationFrame(this.onRaf.bind(this));
		},

		onRaf() {
			this.rafId = null;

			// simulate velocity physics
			if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				this.velocity *= this.friction;
				this.velocity *= this.attraction;
				if (Math.abs(this.velocity) < this.velocityThreshold) this.velocity = 0;
			} else {
				this.velocity = 0;
			}

			const viewportHeight = window.innerHeight;
			let needsAnotherTick = false;

			// update all registered, visible, unpaused elements
			for (const el of this.elements) {
				if (!el._isVisible() || el._isPaused()) continue;
				el._receiveVelocity(this.velocity);
				el._tickProgress(viewportHeight);
				// if velocity still exists, keep ticking
				if (Math.abs(this.velocity) > 0) needsAnotherTick = true;
			}

			// keep running while moving or after scroll
			if (needsAnotherTick || Math.abs(this.velocity) > 0) {
				this.rafId = requestAnimationFrame(this.onRaf.bind(this));
			}
		},
	};

	// the web component
	class ScrollProgress extends HTMLElement {
		constructor() {
			super();
			this._cache = null; // stores anchor geometry for math
			this._isVisible = false; // intersection state
			this._isPaused = false; // paused flag
			this._lastProgress = -1; // last progress written
			this._lastVelocity = 0; // last velocity written
			this._resizeHandler = null; // debounced resize listener
			this._resizeObserver = null; // observes element size
			this._intersectionObserver = null; // observes visibility
			this._injectBaseStyles();
		}

		static get observedAttributes() {
			return [
				'playhead-element-start',
				'playhead-viewport-start',
				'playhead-element-end',
				'playhead-viewport-end',
			];
		}

		connectedCallback() {
			this._buildCache();
			this._setupObservers();
			this._attachResizeListener();
			this._updateVisibilityFallback();
			this._tickProgress(window.innerHeight);
			ScrollProgressManager.register(this);
		}

		disconnectedCallback() {
			this._removeObservers();
			this._removeResizeListener();
			ScrollProgressManager.unregister(this);
		}

		attributeChangedCallback() {
			this._buildCache();
			ScrollProgressManager.tick();
		}

		// public api

		getProgress() {
			return parseFloat(this.style.getPropertyValue('--scroll-progress') || 0);
		}

		getVelocity() {
			return parseFloat(this.style.getPropertyValue('--scroll-progress-velocity') || 0);
		}

		update() {
			this._buildCache();
			this._updateVisibilityFallback();
			ScrollProgressManager.tick();
		}

		pause() {
			this._isPaused = true;
		}

		resume() {
			this._isPaused = false;
			ScrollProgressManager.tick();
		}

		// internal methods

		_isVisible() {
			return this._isVisible;
		}
		_isPaused() {
			return this._isPaused;
		}

		_receiveVelocity(velocity) {
			// only write and dispatch if changed enough
			if (Math.abs(velocity - this._lastVelocity) > 0.1) {
				this._lastVelocity = velocity;
				this.style.setProperty('--scroll-progress-velocity', String(velocity));
				this.dispatchEvent(
					new CustomEvent('scroll-progress:velocity', {
						detail: { velocity },
						bubbles: true,
					})
				);
			}
		}

		_tickProgress(viewportHeight) {
			if (!this._cache) return;
			const rect = this.getBoundingClientRect();

			const travelled = this._cache.startTop - rect.top;
			const progress = clamp(this._cache.distance ? travelled / this._cache.distance : 0, 0, 1);

			if (Math.abs(progress - this._lastProgress) > 0.001) {
				this._lastProgress = progress;
				this.style.setProperty('--scroll-progress', String(progress));
				this.dispatchEvent(
					new CustomEvent('scroll-progress:update', {
						detail: { progress },
						bubbles: true,
					})
				);
			}
		}

		_buildCache() {
			// resolve anchors
			const es = this.getAttribute('playhead-element-start') || 'top';
			const vs = this.getAttribute('playhead-viewport-start') || 'bottom';
			const ee = this.getAttribute('playhead-element-end') || 'bottom';
			const ve = this.getAttribute('playhead-viewport-end') || 'top';

			const rect = this.getBoundingClientRect();
			const vh = window.innerHeight;

			const elOffset = (a, r) => (a === 'top' ? 0 : a === 'center' ? r.height / 2 : r.height);
			const vpOffset = (a, h) => (a === 'top' ? 0 : a === 'center' ? h / 2 : h);

			const startOffset = elOffset(es, rect);
			const endOffset = elOffset(ee, rect);
			const startTop = vpOffset(vs, vh) - startOffset;
			const endTop = vpOffset(ve, vh) - endOffset;

			this._cache = {
				startTop,
				endTop,
				distance: startTop - endTop,
			};
		}

		_setupObservers() {
			// intersection observer for visibility
			if ('IntersectionObserver' in window) {
				this._intersectionObserver = new window.IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (entry.target === this) {
								this._isVisible = entry.isIntersecting;
								if (this._isVisible) ScrollProgressManager.tick();
							}
						}
					},
					{ threshold: [0, 0.001, 1] }
				);
				this._intersectionObserver.observe(this);
			}
			// resize observer for element size
			if ('ResizeObserver' in window) {
				this._resizeObserver = new window.ResizeObserver((entries) => {
					for (const entry of entries) {
						if (entry.target === this) {
							this._buildCache();
							if (this._isVisible) ScrollProgressManager.tick();
						}
					}
				});
				this._resizeObserver.observe(this);
			}
		}

		_removeObservers() {
			if (this._intersectionObserver) {
				this._intersectionObserver.disconnect();
				this._intersectionObserver = null;
			}
			if (this._resizeObserver) {
				this._resizeObserver.disconnect();
				this._resizeObserver = null;
			}
		}

		_attachResizeListener() {
			this._resizeHandler = throttle(() => {
				this._buildCache();
				if (this._isVisible) ScrollProgressManager.tick();
			}, 50);
			window.addEventListener('resize', this._resizeHandler);
		}

		_removeResizeListener() {
			if (this._resizeHandler) {
				window.removeEventListener('resize', this._resizeHandler);
				this._resizeHandler = null;
			}
		}

		_updateVisibilityFallback() {
			const r = this.getBoundingClientRect();
			this._isVisible = r.bottom > 0 && r.top < window.innerHeight;
		}

		_injectBaseStyles() {
			if (ScrollProgress._styleInjected) return;
			const tag = document.createElement('style');
			tag.textContent = `
scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
	will-change: transform;
	backface-visibility: hidden;
}`;
			document.head.appendChild(tag);
			ScrollProgress._styleInjected = true;
		}
	}
	ScrollProgress._styleInjected = false;

	// define the element
	if (!window.customElements.get('scroll-progress')) {
		window.customElements.define('scroll-progress', ScrollProgress);
	}

	exports.ScrollProgress = ScrollProgress;

}));
//# sourceMappingURL=scroll-progress.js.map
