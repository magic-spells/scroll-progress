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

const SNAP_EPSILON = 0.0005; // gap below which smoothed progress snaps to its target
const RANGE_EPSILON = 0.5; // px the anchor range must move before a rebuild snaps easing
const MAX_FRAME_DELTA = 64; // ms ceiling so a woken loop can't take one huge easing step
const ANCHOR_KEYWORDS = { top: 0, center: 0.5, bottom: 1 };

// resolves an anchor attribute to a fraction of the measured length
// percentages are deliberately not clamped — over-scan anchors like '150%' are valid
// never throws: an unusable value warns once and falls back to the attribute's default
function anchorToFraction(value, fallback, attrName) {
	if (value === null || value === '') return fallback;

	const raw = String(value).trim().toLowerCase();
	const keyword = ANCHOR_KEYWORDS[raw];
	if (typeof keyword === 'number') return keyword;

	if (raw.endsWith('%')) {
		const percent = parseFloat(raw);
		if (Number.isFinite(percent)) return percent / 100;
	}

	console.warn(
		`<scroll-progress> ignoring invalid ${attrName}="${value}" — expected top, center, bottom, or a percentage`
	);
	return fallback;
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
	lastFrameTime: 0,
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
		this.lastFrameTime = 0;
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
		// attributeChangedCallback can reach this before start() has bound the loop
		this._boundRaf = this._boundRaf || this.onRaf.bind(this);
		if (!this.rafId) this.rafId = requestAnimationFrame(this._boundRaf);
	},

	onRaf(now) {
		this.rafId = null;

		// a woken loop has no previous timestamp, and a long gap (background tab,
		// dropped frames) must not translate into one huge easing step
		const delta =
			this.lastFrameTime > 0 ? Math.min(now - this.lastFrameTime, MAX_FRAME_DELTA) : 16;
		this.lastFrameTime = now;

		// velocity physics — single multiply instead of two
		if (!reducedMotion.matches) {
			this.velocity *= this.decay;
			if (Math.abs(this.velocity) < this.velocityThreshold) this.velocity = 0;
		} else {
			this.velocity = 0;
		}

		const vel = this.velocity;
		let fallbackViewportHeight = null;
		let easing = false;

		// update all registered, visible, unpaused elements
		for (const el of this.elements) {
			if (!el._intersectionObserver) {
				fallbackViewportHeight ??= ViewportMetrics.refresh().currentHeight;
				el._updateVisibilityFallback({
					currentHeight: fallbackViewportHeight,
				});
			}
			// skipped elements never report easing, so they can't hold the loop open
			if (!el._visible || el._paused) continue;
			el._receiveVelocity(vel);
			if (el._tickProgress(delta)) easing = true;
		}

		// keep running while velocity is non-zero or any element is still easing
		if (vel !== 0 || easing) {
			this.rafId = requestAnimationFrame(this._boundRaf);
		} else {
			this.lastFrameTime = 0;
		}
	},
};

// the web component
class ScrollProgress extends HTMLElement {
	// private fields
	#cache = null;
	#anchors = null;
	#lastProgress = -1;
	#lastVelocity = 0;
	#smoothing = 0;
	#currentProgress = null; // null means never ticked — first tick snaps
	#snapNext = false; // one-shot: skip easing on the next tick
	#easing = false;
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
			'smoothing',
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

	// fires before connectedCallback for attributes present in markup, so both
	// branches have to survive being run on a not-yet-connected element
	attributeChangedCallback(name) {
		const _ = this;

		if (name === 'smoothing') {
			_.#parseSmoothing();
			// carrying an in-flight ease across a time-constant change would replay
			// the remaining gap at the new rate
			_.#snapNext = true;
			ScrollProgressManager.tick();
			return;
		}

		// parsed here rather than in _buildCache so an invalid value warns once per
		// change instead of on every resize-driven rebuild
		_.#parseAnchors();
		ViewportMetrics.refresh();
		_._buildCache();
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

	// returns true while smoothed progress is still easing, which keeps the shared loop alive
	_tickProgress(delta = 0) {
		const _ = this;
		if (!_.#cache) return false;
		const rect = _.getBoundingClientRect();

		const travelled = _.#cache.startTop - rect.top;
		const target = clamp(_.#cache.distance ? travelled / _.#cache.distance : 0, 0, 1);

		// easing is skipped on the first tick, after a layout or attribute change, and
		// under reduced motion — cases where the old position isn't one to animate from
		const smoothing = _.#smoothing;
		const snap =
			smoothing <= 0 || reducedMotion.matches || _.#snapNext || _.#currentProgress === null;

		let progress = target;
		let easing = false;

		if (snap) {
			_.#snapNext = false;
		} else {
			const diff = target - _.#currentProgress;
			if (Math.abs(diff) > SNAP_EPSILON) {
				progress = _.#currentProgress + diff * (1 - Math.exp(-delta / smoothing));
				easing = true;
			}
		}

		// the last easing steps are smaller than the publish epsilon, so a settling ease
		// has to force one final publish or the resting value stays short of the target
		const settled = _.#easing && !easing;
		_.#easing = easing;
		_.#currentProgress = progress;

		if (progress !== _.#lastProgress && (settled || Math.abs(progress - _.#lastProgress) > 0.001)) {
			_.#lastProgress = progress;
			_.style.setProperty('--scroll-progress', String(progress));
			_.dispatchEvent(
				new CustomEvent('scroll-progress:update', {
					detail: { progress },
					bubbles: true,
				})
			);
		}

		return easing;
	}

	_buildCache({ rect = this.getBoundingClientRect(), stableHeight = ViewportMetrics.stableHeight } = {}) {
		const _ = this;
		if (!_.#anchors) _.#parseAnchors();
		const a = _.#anchors;

		const startTop = a.vs * stableHeight - a.es * rect.height;
		const endTop = a.ve * stableHeight - a.ee * rect.height;

		const prev = _.#cache;
		_.#cache = { startTop, endTop, distance: startTop - endTop };

		// snap only when the range actually moved — mobile visualViewport resize
		// storms rebuild constantly with identical values, and snapping there would
		// collapse an in-flight ease mid-scroll
		if (
			!prev ||
			Math.abs(startTop - prev.startTop) > RANGE_EPSILON ||
			Math.abs(endTop - prev.endTop) > RANGE_EPSILON
		) {
			_.#snapNext = true;
		}
	}

	_updateVisibilityFallback({
		rect = this.getBoundingClientRect(),
		currentHeight = ViewportMetrics.currentHeight,
	} = {}) {
		const _ = this;
		const visible = rect.bottom > 0 && rect.top < currentHeight;
		// everything that scrolled by while gated off isn't an ease worth replaying
		if (visible && !_._visible) _.#snapNext = true;
		_._visible = visible;
	}

	// private methods (internal only)

	// defaults match the keyword defaults: element top / viewport bottom → element bottom / viewport top
	#parseAnchors() {
		const _ = this;
		_.#anchors = {
			es: anchorToFraction(_.getAttribute('playhead-element-start'), 0, 'playhead-element-start'),
			vs: anchorToFraction(_.getAttribute('playhead-viewport-start'), 1, 'playhead-viewport-start'),
			ee: anchorToFraction(_.getAttribute('playhead-element-end'), 1, 'playhead-element-end'),
			ve: anchorToFraction(_.getAttribute('playhead-viewport-end'), 0, 'playhead-viewport-end'),
		};
	}

	// smoothing is an ms time constant — absent, zero or unparseable all mean off
	#parseSmoothing() {
		const _ = this;
		const ms = parseFloat(_.getAttribute('smoothing'));
		_.#smoothing = Number.isFinite(ms) && ms > 0 ? ms : 0;
	}

	#setupObservers() {
		const _ = this;
		if ('IntersectionObserver' in window) {
			_._intersectionObserver = new window.IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.target === _) {
							const visible = entry.isIntersecting;
							// same rule as the fallback: coming back on screen snaps
							if (visible && !_._visible) _.#snapNext = true;
							_._visible = visible;
							if (visible) ScrollProgressManager.tick();
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
