/*
  scroll-progress web component
  tracks scroll progress (0 to 1) and velocity for parallax or animation use
  uses a single global rAF for velocity, and per-element observers for performance
  uses #private fields for internal state, _ prefix for manager-facing methods
*/

// clamp helper: keeps a number within a range
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

// cached media query for prefers-reduced-motion
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// stable viewport metrics prevent mobile Safari chrome from shifting anchor math
const ViewportMetrics = {
	currentHeight: window.visualViewport?.height || window.innerHeight,
	stableHeight: window.visualViewport?.height || window.innerHeight,
	probe: null,

	init() {
		if (this.probe || !window.CSS || !window.CSS.supports('height: 100svh')) return;
		const container = document.createElement('div');
		const probe = document.createElement('div');
		container.setAttribute('aria-hidden', 'true');
		container.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 0;
height: 0;
overflow: hidden;
visibility: hidden;
pointer-events: none;
z-index: -1;`;
		probe.style.height = '100svh';
		container.appendChild(probe);
		document.documentElement.appendChild(container);
		this.probe = probe;
		this.refresh();
	},

	refresh() {
		const currentHeight = window.visualViewport?.height || window.innerHeight;
		const measuredStableHeight = this.probe ? this.probe.getBoundingClientRect().height : 0;

		this.currentHeight = currentHeight;
		this.stableHeight = measuredStableHeight || currentHeight;

		return this;
	},
};

// main global scroll + velocity manager
const ScrollProgressManager = {
	elements: new Set(),
	lastScrollY: 0,
	velocity: 0,
	rafId: null,
	isListening: false,
	smoothing: 0.15,
	decay: 0.76, // friction (0.8) * attraction (0.95) combined
	velocityThreshold: 0.01,
	maxVelocity: 100,
	_boundRaf: null,
	_boundScroll: null,
	_boundResize: null,

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
		if (this.isListening) return;
		ViewportMetrics.init();
		ViewportMetrics.refresh();
		this.lastScrollY = window.scrollY;
		// bind once, reuse
		this._boundRaf = this._boundRaf || this.onRaf.bind(this);
		this._boundScroll = this._boundScroll || this.onScroll.bind(this);
		this._boundResize = this._boundResize || this.onViewportResize.bind(this);
		window.addEventListener('scroll', this._boundScroll, { passive: true });
		window.addEventListener('resize', this._boundResize, { passive: true });
		window.visualViewport?.addEventListener('resize', this._boundResize, { passive: true });
		this.isListening = true;
		this.rafId = requestAnimationFrame(this._boundRaf);
	},

	stop() {
		window.removeEventListener('scroll', this._boundScroll);
		window.removeEventListener('resize', this._boundResize);
		window.visualViewport?.removeEventListener('resize', this._boundResize);
		this.isListening = false;
		this.velocity = 0;
		if (this.rafId) cancelAnimationFrame(this.rafId);
		this.rafId = null;
	},

	onScroll() {
		const y = window.scrollY;
		const delta = y - this.lastScrollY;
		this.lastScrollY = y;

		if (reducedMotion.matches) {
			this.velocity = 0;
			this.tick();
			return;
		}

		this.velocity += (delta - this.velocity) * this.smoothing;
		this.velocity = clamp(this.velocity, -this.maxVelocity, this.maxVelocity);
		this.tick();
	},

	onViewportResize() {
		const metrics = ViewportMetrics.refresh();
		this.lastScrollY = window.scrollY;
		for (const el of this.elements) {
			const rect = el.getBoundingClientRect();
			el._buildCache({ rect, stableHeight: metrics.stableHeight });
			el._updateVisibilityFallback({
				rect,
				currentHeight: metrics.currentHeight,
			});
		}
		this.tick();
	},

	tick() {
		if (!this.rafId) this.rafId = requestAnimationFrame(this._boundRaf);
	},

	onRaf() {
		this.rafId = null;

		// velocity physics — single multiply instead of two
		if (!reducedMotion.matches) {
			this.velocity *= this.decay;
			if (Math.abs(this.velocity) < this.velocityThreshold) this.velocity = 0;
		} else {
			this.velocity = 0;
		}

		const vel = this.velocity;
		let fallbackViewportHeight = null;

		// update all registered, visible, unpaused elements
		for (const el of this.elements) {
			if (!el._intersectionObserver) {
				fallbackViewportHeight ??= ViewportMetrics.refresh().currentHeight;
				el._updateVisibilityFallback({
					currentHeight: fallbackViewportHeight,
				});
			}
			if (!el._visible || el._paused) continue;
			el._receiveVelocity(vel);
			el._tickProgress();
		}

		// keep running while velocity is non-zero
		if (vel !== 0) {
			this.rafId = requestAnimationFrame(this._boundRaf);
		}
	},
};

// the web component
class ScrollProgress extends HTMLElement {
	// private fields
	#cache = null;
	#lastProgress = -1;
	#lastVelocity = 0;
	#resizeObserver = null;
	static #styleInjected = false;

	// public fields (accessed by ScrollProgressManager)
	_visible = false;
	_paused = false;
	_intersectionObserver = null;

	constructor() {
		super();
		this.#injectBaseStyles();
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
		const _ = this;
		ViewportMetrics.init();
		ViewportMetrics.refresh();
		_._buildCache();
		_.#setupObservers();
		_._updateVisibilityFallback();
		_._tickProgress();
		ScrollProgressManager.register(_);
	}

	disconnectedCallback() {
		const _ = this;
		_.#removeObservers();
		ScrollProgressManager.unregister(_);
	}

	attributeChangedCallback() {
		ViewportMetrics.refresh();
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
		ViewportMetrics.refresh();
		this._buildCache();
		this._updateVisibilityFallback();
		ScrollProgressManager.tick();
	}

	pause() {
		this._paused = true;
	}

	resume() {
		this._paused = false;
		ScrollProgressManager.tick();
	}

	// manager-facing methods (called by ScrollProgressManager)

	_receiveVelocity(velocity) {
		const _ = this;
		// always emit on zero-crossing, otherwise only if changed enough
		if (velocity === 0 && _.#lastVelocity !== 0) {
			// force emit zero
		} else if (Math.abs(velocity - _.#lastVelocity) <= 0.1) {
			return;
		}
		_.#lastVelocity = velocity;
		_.style.setProperty('--scroll-progress-velocity', String(velocity));
		_.dispatchEvent(
			new CustomEvent('scroll-progress:velocity', {
				detail: { velocity },
				bubbles: true,
			})
		);
	}

	_tickProgress() {
		const _ = this;
		if (!_.#cache) return;
		const rect = _.getBoundingClientRect();

		const travelled = _.#cache.startTop - rect.top;
		const progress = clamp(_.#cache.distance ? travelled / _.#cache.distance : 0, 0, 1);

		if (Math.abs(progress - _.#lastProgress) > 0.001) {
			_.#lastProgress = progress;
			_.style.setProperty('--scroll-progress', String(progress));
			_.dispatchEvent(
				new CustomEvent('scroll-progress:update', {
					detail: { progress },
					bubbles: true,
				})
			);
		}
	}

	_buildCache({ rect = this.getBoundingClientRect(), stableHeight = ViewportMetrics.stableHeight } = {}) {
		const _ = this;
		const es = _.getAttribute('playhead-element-start') || 'top';
		const vs = _.getAttribute('playhead-viewport-start') || 'bottom';
		const ee = _.getAttribute('playhead-element-end') || 'bottom';
		const ve = _.getAttribute('playhead-viewport-end') || 'top';

		const elOffset = (a, r) => (a === 'top' ? 0 : a === 'center' ? r.height / 2 : r.height);
		const vpOffset = (a, h) => (a === 'top' ? 0 : a === 'center' ? h / 2 : h);

		const startOffset = elOffset(es, rect);
		const endOffset = elOffset(ee, rect);
		const startTop = vpOffset(vs, stableHeight) - startOffset;
		const endTop = vpOffset(ve, stableHeight) - endOffset;

		_.#cache = { startTop, endTop, distance: startTop - endTop };
	}

	_updateVisibilityFallback({
		rect = this.getBoundingClientRect(),
		currentHeight = ViewportMetrics.currentHeight,
	} = {}) {
		const _ = this;
		_._visible = rect.bottom > 0 && rect.top < currentHeight;
	}

	// private methods (internal only)

	#setupObservers() {
		const _ = this;
		if ('IntersectionObserver' in window) {
			_._intersectionObserver = new window.IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.target === _) {
							_._visible = entry.isIntersecting;
							if (_._visible) ScrollProgressManager.tick();
						}
					}
				},
				{ threshold: [0, 0.001, 1] }
			);
			_._intersectionObserver.observe(_);
		}
		if ('ResizeObserver' in window) {
			_.#resizeObserver = new window.ResizeObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === _) {
						_._buildCache();
						if (_._visible) ScrollProgressManager.tick();
					}
				}
			});
			_.#resizeObserver.observe(_);
		}
	}

	#removeObservers() {
		const _ = this;
		if (_._intersectionObserver) {
			_._intersectionObserver.disconnect();
			_._intersectionObserver = null;
		}
		if (_.#resizeObserver) {
			_.#resizeObserver.disconnect();
			_.#resizeObserver = null;
		}
	}

	#injectBaseStyles() {
		if (ScrollProgress.#styleInjected) return;
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
		ScrollProgress.#styleInjected = true;
	}
}

// define the element
if (!window.customElements.get('scroll-progress')) {
	window.customElements.define('scroll-progress', ScrollProgress);
}

export { ScrollProgress };
