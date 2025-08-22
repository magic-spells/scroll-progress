(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ScrollProgress = {}));
})(this, (function (exports) { 'use strict';

	/* scroll-progress web component
	 * Provides scroll progress tracking with velocity-based animations.
	 * Uses scroll-driven RAF loops for optimal performance.
	 * Exposes --scroll-progress and --scroll-progress-velocity CSS variables.
	 */

	// Throttle utility for resize events
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
		// Static properties for global scroll management
		static #globalScrollHandler = null;
		static #activeComponents = new Set();
		static #lastGlobalScrollY = 0;
		static #lastGlobalScrollTime = 0;
		static #styleInjected = false;

		// Instance private fields
		#cache = null;
		#cachedViewportHeight = 0;
		#resizeObserver = null;
		#intersectionObserver = null;
		#isVisible = false;
		#handleResize = null;
		#lastProgress = -1;

		// Velocity tracking fields
		#currentVelocity = 0;
		#rafId = null;
		#isRafRunning = false;

		/**
		 * Initialize global scroll handler for all scroll-progress components
		 */
		static #initializeGlobalScrollHandler() {
			if (ScrollProgress.#globalScrollHandler) return;

			ScrollProgress.#lastGlobalScrollY = window.scrollY;
			ScrollProgress.#lastGlobalScrollTime = performance.now();

			ScrollProgress.#globalScrollHandler = () => {
				const currentScrollY = window.scrollY;
				const currentTime = performance.now();
				const deltaY = currentScrollY - ScrollProgress.#lastGlobalScrollY;
				const deltaTime = currentTime - ScrollProgress.#lastGlobalScrollTime;

				// Trigger RAF updates for all visible components
				for (const component of ScrollProgress.#activeComponents) {
					if (component.#isVisible) {
						component.#handleScrollDetected(deltaY, deltaTime);
					}
				}

				ScrollProgress.#lastGlobalScrollY = currentScrollY;
				ScrollProgress.#lastGlobalScrollTime = currentTime;
			};

			window.addEventListener('scroll', ScrollProgress.#globalScrollHandler, {
				passive: true,
			});
		}

		/**
		 * Clean up global scroll handler when no components remain
		 */
		static #cleanupGlobalScrollHandler() {
			if (ScrollProgress.#activeComponents.size === 0 && ScrollProgress.#globalScrollHandler) {
				window.removeEventListener('scroll', ScrollProgress.#globalScrollHandler);
				ScrollProgress.#globalScrollHandler = null;
			}
		}

		/**
		 * Inject base styles for scroll-progress elements
		 */
		static #injectBaseStyles() {
			if (ScrollProgress.#styleInjected) return;

			const styleTag = document.createElement('style');
			styleTag.textContent = `scroll-progress {
	display: block;
	--scroll-progress: 0;
	--scroll-progress-velocity: 0;
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
			const _ = this;

			// Register this component globally
			ScrollProgress.#activeComponents.add(_);
			ScrollProgress.#initializeGlobalScrollHandler();

			_.#cachedViewportHeight = window.innerHeight;
			_.#initializeCache();
			_.#setupObservers();
			_.#attachEventListeners();

			// Calculate initial position immediately for page load
			_.#updateScrollProgress();
		}

		disconnectedCallback() {
			const _ = this;

			_.#stopRafLoop();
			_.#detachEventListeners();
			_.#cleanupObservers();

			// Unregister component and cleanup global handler if needed
			ScrollProgress.#activeComponents.delete(_);
			ScrollProgress.#cleanupGlobalScrollHandler();
		}

		attributeChangedCallback(name, oldValue, newValue) {
			if (oldValue !== newValue && this.#cache) {
				this.#initializeCache();
				// Recalculate position immediately
				this.#updateScrollProgress();
			}
		}

		/**
		 * Initialize cache with playhead anchor configurations
		 */
		#initializeCache() {
			const _ = this;

			try {
				const elementRect = _.getBoundingClientRect();
				_.#cache = {
					elementStartAnchor: _.getAttribute('playhead-element-start') || 'top',
					viewportStartAnchor: _.getAttribute('playhead-viewport-start') || 'bottom',
					elementEndAnchor: _.getAttribute('playhead-element-end') || 'bottom',
					viewportEndAnchor: _.getAttribute('playhead-viewport-end') || 'top',
					elementStartPosition: 0,
					elementEndPosition: 0,
					viewportStartPosition: 0,
					viewportEndPosition: 0,
					totalDistance: 0,
				};

				_.#updateCachedPositions(elementRect);
			} catch (error) {
				console.error('ScrollProgress: Failed to initialize cache', error);
			}
		}

		/**
		 * Update cached position calculations
		 */
		#updateCachedPositions(elementRect) {
			const _ = this;

			if (!elementRect) {
				try {
					elementRect = _.getBoundingClientRect();
				} catch (error) {
					console.error('ScrollProgress: Failed to get element rect', error);
					return;
				}
			}

			if (!_.#cache) return;

			_.#cache.elementStartPosition = _.#getElementAnchorPosition(
				_.#cache.elementStartAnchor,
				elementRect
			);
			_.#cache.elementEndPosition = _.#getElementAnchorPosition(
				_.#cache.elementEndAnchor,
				elementRect
			);

			_.#cache.viewportStartPosition = _.#getViewportAnchorPosition(
				_.#cache.viewportStartAnchor,
				_.#cachedViewportHeight
			);
			_.#cache.viewportEndPosition = _.#getViewportAnchorPosition(
				_.#cache.viewportEndAnchor,
				_.#cachedViewportHeight
			);

			_.#cache.totalDistance =
				_.#cache.elementEndPosition -
				_.#cache.viewportEndPosition -
				(_.#cache.elementStartPosition - _.#cache.viewportStartPosition);

			if (_.#cache.totalDistance <= 0) {
				console.warn('ScrollProgress: totalDistance is zero or negative, check anchor configuration');
				_.#cache.totalDistance = Math.abs(_.#cache.totalDistance) || 1; // Prevent division by zero
			}
		}

		/**
		 * Get element anchor position (top, center, bottom)
		 */
		#getElementAnchorPosition(anchor, elementRect) {
			if (anchor === 'top') return elementRect.top;
			if (anchor === 'center') return elementRect.top + elementRect.height / 2;
			if (anchor === 'bottom') return elementRect.bottom;

			// Fallback for invalid anchor values
			console.warn(`ScrollProgress: Invalid element anchor "${anchor}", using "top"`);
			return elementRect.top;
		}

		/**
		 * Get viewport anchor position (top, center, bottom)
		 */
		#getViewportAnchorPosition(anchor, viewportHeight) {
			if (anchor === 'top') return 0;
			if (anchor === 'center') return viewportHeight / 2;
			if (anchor === 'bottom') return viewportHeight;

			// Fallback for invalid anchor values
			console.warn(`ScrollProgress: Invalid viewport anchor "${anchor}", using "top"`);
			return 0;
		}

		/**
		 * Clamp value between min and max
		 */
		#clamp(value, min, max) {
			return value < min ? min : value > max ? max : value;
		}

		/**
		 * Handle scroll detection from global scroll handler
		 */
		#handleScrollDetected(deltaY, deltaTime) {
			const _ = this;

			// Calculate instantaneous velocity (pixels per second, scaled down)
			const instantVelocity = deltaTime > 0 ? (Math.abs(deltaY) / deltaTime) * 10 : 0;

			// Smooth velocity: use 15% of new value, 85% of existing
			_.#currentVelocity = _.#currentVelocity * 0.85 + instantVelocity * 0.15;

			// Start RAF loop if not already running
			_.#startRafIfNeeded();
		}

		/**
		 * Start RAF loop if not already running
		 */
		#startRafIfNeeded() {
			const _ = this;

			if (!_.#isRafRunning) {
				_.#isRafRunning = true;
				_.#startRafLoop();
			}
		}

		/**
		 * Start the requestAnimationFrame loop
		 */
		#startRafLoop() {
			const _ = this;

			const updateLoop = () => {
				if (!_.#isRafRunning) return;

				try {
					// Update both scroll progress and velocity
					_.#updateScrollProgress();
					_.#updateVelocityDecay();

					// Continue loop while velocity is significant
					if (_.#currentVelocity > 0.1) {
						_.#rafId = requestAnimationFrame(updateLoop);
					} else {
						// Final render: set velocity to 0 and stop
						_.#currentVelocity = 0;
						_.#setVelocityCssVariable();
						_.#stopRafLoop();
					}
				} catch (error) {
					console.error('ScrollProgress: RAF loop error', error);
					_.#stopRafLoop();
				}
			};

			_.#rafId = requestAnimationFrame(updateLoop);
		}

		/**
		 * Stop the RAF loop
		 */
		#stopRafLoop() {
			const _ = this;

			_.#isRafRunning = false;
			if (_.#rafId) {
				cancelAnimationFrame(_.#rafId);
				_.#rafId = null;
			}
		}

		/**
		 * Update scroll progress and set CSS variable
		 */
		#updateScrollProgress() {
			const _ = this;

			if (!_.#cache) return;

			try {
				const elementRect = _.getBoundingClientRect();
				const currentElementStart = _.#getElementAnchorPosition(
					_.#cache.elementStartAnchor,
					elementRect
				);

				const currentDistance = _.#cache.viewportStartPosition - currentElementStart;
				const progress =
					_.#cache.totalDistance === 0 ? 0 : _.#clamp(currentDistance / _.#cache.totalDistance, 0, 1);

				// Only update if progress has changed significantly
				if (Math.abs(progress - _.#lastProgress) > 0.001) {
					_.#lastProgress = progress;
					_.style.setProperty('--scroll-progress', progress);

					// Dispatch progress update event
					_.dispatchEvent(
						new CustomEvent('scroll-progress:update', {
							detail: { progress, velocity: _.#currentVelocity },
							bubbles: true,
						})
					);
				}
			} catch (error) {
				console.error('ScrollProgress: Failed to update scroll progress', error);
			}
		}

		/**
		 * Update velocity decay and set CSS variable
		 */
		#updateVelocityDecay() {
			const _ = this;

			// Decay velocity towards 0 when not actively scrolling
			_.#currentVelocity *= 0.92; // Decay factor
			_.#setVelocityCssVariable();
		}

		/**
		 * Set velocity CSS variable
		 */
		#setVelocityCssVariable() {
			const _ = this;

			// Normalize velocity to a 0-1 range for CSS use
			const normalizedVelocity = Math.min(_.#currentVelocity / 50, 1);
			_.style.setProperty('--scroll-progress-velocity', normalizedVelocity);
		}

		/**
		 * Setup resize and intersection observers
		 */
		#setupObservers() {
			const _ = this;

			// Setup ResizeObserver to track element size changes
			if ('ResizeObserver' in window) {
				_.#resizeObserver = new ResizeObserver((entries) => {
					try {
						entries.forEach((entry) => {
							if (entry.target === _) {
								_.#updateCachedPositions(entry.contentRect);
							}
						});
					} catch (error) {
						console.error('ScrollProgress: ResizeObserver error', error);
					}
				});
				_.#resizeObserver.observe(_);
			}

			// Setup IntersectionObserver to track visibility
			if ('IntersectionObserver' in window) {
				const observerOptions = {
					rootMargin: '50% 0px 50% 0px',
				};

				_.#intersectionObserver = new IntersectionObserver((entries) => {
					try {
						entries.forEach((entry) => {
							if (entry.target === _) {
								_.#isVisible = entry.isIntersecting;
							}
						});
					} catch (error) {
						console.error('ScrollProgress: IntersectionObserver error', error);
					}
				}, observerOptions);

				_.#intersectionObserver.observe(_);
			} else {
				// Fallback: assume always visible
				_.#isVisible = true;
			}
		}

		/**
		 * Clean up observers
		 */
		#cleanupObservers() {
			const _ = this;

			if (_.#resizeObserver) {
				_.#resizeObserver.disconnect();
				_.#resizeObserver = null;
			}

			if (_.#intersectionObserver) {
				_.#intersectionObserver.disconnect();
				_.#intersectionObserver = null;
			}
		}

		/**
		 * Attach window event listeners
		 */
		#attachEventListeners() {
			const _ = this;

			const resizeHandler = () => {
				_.#cachedViewportHeight = window.innerHeight;
				if (_.#cache) {
					_.#cache.viewportStartPosition = _.#getViewportAnchorPosition(
						_.#cache.viewportStartAnchor,
						_.#cachedViewportHeight
					);
					_.#cache.viewportEndPosition = _.#getViewportAnchorPosition(
						_.#cache.viewportEndAnchor,
						_.#cachedViewportHeight
					);
					_.#cache.totalDistance =
						_.#cache.elementEndPosition -
						_.#cache.viewportEndPosition -
						(_.#cache.elementStartPosition - _.#cache.viewportStartPosition);
					_.#updateCachedPositions();

					// Recalculate position immediately on resize
					_.#updateScrollProgress();
				}
			};

			_.#handleResize = throttle(resizeHandler, 50);
			window.addEventListener('resize', _.#handleResize);
		}

		/**
		 * Remove window event listeners
		 */
		#detachEventListeners() {
			const _ = this;

			if (_.#handleResize) {
				window.removeEventListener('resize', _.#handleResize);
				_.#handleResize = null;
			}
		}

		// Public API methods

		/**
		 * Get current scroll progress (0 to 1)
		 */
		getProgress() {
			return parseFloat(this.style.getPropertyValue('--scroll-progress') || 0);
		}

		/**
		 * Get current scroll velocity (normalized 0 to 1)
		 */
		getVelocity() {
			return parseFloat(this.style.getPropertyValue('--scroll-progress-velocity') || 0);
		}

		/**
		 * Manually trigger position and cache recalculation
		 */
		update() {
			const _ = this;

			if (_.#cache) {
				_.#updateCachedPositions();
				_.#updateScrollProgress();
			}
		}

		/**
		 * Pause the RAF loop (for debugging/testing)
		 */
		pause() {
			this.#stopRafLoop();
		}

		/**
		 * Resume the RAF loop (for debugging/testing)
		 */
		resume() {
			const _ = this;

			if (!_.#isRafRunning && _.#currentVelocity > 0.1) {
				_.#startRafIfNeeded();
			}
		}
	}

	// Register the custom element
	if (!customElements.get('scroll-progress')) {
		customElements.define('scroll-progress', ScrollProgress);
	}

	exports.ScrollProgress = ScrollProgress;

}));
//# sourceMappingURL=scroll-progress.js.map
