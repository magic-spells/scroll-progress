/*
  scroll-progress web component
  tracks scroll progress (0 to 1) and velocity for parallax or animation use
  uses a single global rAF for velocity, and per-element observers for performance
  uses #private fields for internal state, _ prefix for manager-facing methods
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
		if (this.isListening) return;
		ViewportMetrics.init();
		ViewportMetrics.refresh();
		this.lastScrollY = window.scrollY;
		this._boundScroll = this.onScroll.bind(this);
		this._boundViewportResize = this.onViewportResize.bind(this);
		window.addEventListener('scroll', this._boundScroll, { passive: true });
		window.addEventListener('resize', this._boundViewportResize, { passive: true });
		window.visualViewport?.addEventListener('resize', this._boundViewportResize, { passive: true });
		this.isListening = true;
		this.rafId = requestAnimationFrame(this.onRaf.bind(this));
	},

	stop() {
		window.removeEventListener('scroll', this._boundScroll);
		window.removeEventListener('resize', this._boundViewportResize);
		window.visualViewport?.removeEventListener('resize', this._boundViewportResize);
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
		ViewportMetrics.refresh();
		this.lastScrollY = window.scrollY;
		for (const el of this.elements) {
			el._buildCache();
			el._updateVisibilityFallback();
		}
		this.tick();
	},

	tick() {
		// schedule a rAF tick if not already running
		if (!this.rafId) this.rafId = requestAnimationFrame(this.onRaf.bind(this));
	},

	onRaf() {
		this.rafId = null;

		// simulate velocity physics
		if (!reducedMotion.matches) {
			this.velocity *= this.friction;
			this.velocity *= this.attraction;
			if (Math.abs(this.velocity) < this.velocityThreshold) this.velocity = 0;
		} else {
			this.velocity = 0;
		}
		let needsAnotherTick = false;

		// update all registered, visible, unpaused elements
		for (const el of this.elements) {
			if (!el._intersectionObserver) el._updateVisibilityFallback();
			if (!el._visible || el._paused) continue;
			el._receiveVelocity(this.velocity);
			el._tickProgress();
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
	// private fields
	#cache = null;
	#lastProgress = -1;
	#lastVelocity = 0;
	#resizeHandler = null;
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
		_._buildCache();
		_.#setupObservers();
		_.#attachResizeListener();
		_._updateVisibilityFallback();
		_._tickProgress();
		ScrollProgressManager.register(_);
	}

	disconnectedCallback() {
		const _ = this;
		_.#removeObservers();
		_.#removeResizeListener();
		ScrollProgressManager.unregister(_);
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

	_buildCache() {
		const _ = this;
		const es = _.getAttribute('playhead-element-start') || 'top';
		const vs = _.getAttribute('playhead-viewport-start') || 'bottom';
		const ee = _.getAttribute('playhead-element-end') || 'bottom';
		const ve = _.getAttribute('playhead-viewport-end') || 'top';

		const rect = _.getBoundingClientRect();
		const vh = ViewportMetrics.refresh().stableHeight;

		const elOffset = (a, r) => (a === 'top' ? 0 : a === 'center' ? r.height / 2 : r.height);
		const vpOffset = (a, h) => (a === 'top' ? 0 : a === 'center' ? h / 2 : h);

		const startOffset = elOffset(es, rect);
		const endOffset = elOffset(ee, rect);
		const startTop = vpOffset(vs, vh) - startOffset;
		const endTop = vpOffset(ve, vh) - endOffset;

		_.#cache = { startTop, endTop, distance: startTop - endTop };
	}

	_updateVisibilityFallback() {
		const _ = this;
		const viewportHeight = ViewportMetrics.refresh().currentHeight;
		const r = _.getBoundingClientRect();
		_._visible = r.bottom > 0 && r.top < viewportHeight;
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

	#attachResizeListener() {
		const _ = this;
		_.#resizeHandler = throttle(() => {
			_._buildCache();
			if (_._visible) ScrollProgressManager.tick();
		}, 50);
		window.addEventListener('resize', _.#resizeHandler);
	}

	#removeResizeListener() {
		const _ = this;
		if (_.#resizeHandler) {
			window.removeEventListener('resize', _.#resizeHandler);
			_.#resizeHandler = null;
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
