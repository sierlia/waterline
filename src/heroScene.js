import { clamp, dpr, easeInOutCubic, lerp, mapRange } from './utils.js';

const canUseCanvas = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('2d');
  } catch {
    return false;
  }
};

export class HeroScene {
  constructor({ canvas, hero, reducedMotion }) {
    this.canvas = canvas;
    this.hero = hero;
    this.reducedMotion = reducedMotion;
    this.ctx = canvas.getContext('2d');
    this.active = canUseCanvas() && !!this.ctx;
    this.time = 0;
    this.scrollTarget = 0;
    this.scrollCurrent = 0;
    this.viewport = { width: 0, height: 0, dpr: 1 };
    this.raf = 0;

    if (!this.active) {
      document.documentElement.classList.add('no-canvas');
      return;
    }

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    this.raf = requestAnimationFrame(this.tick);
  }

  resize() {
    this.viewport.width = window.innerWidth;
    this.viewport.height = window.innerHeight;
    this.viewport.dpr = dpr(window.innerWidth < 720 ? 1.5 : 2);
    this.canvas.width = Math.round(this.viewport.width * this.viewport.dpr);
    this.canvas.height = Math.round(this.viewport.height * this.viewport.dpr);
    this.canvas.style.width = `${this.viewport.width}px`;
    this.canvas.style.height = `${this.viewport.height}px`;
    this.ctx.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
  }

  setScrollProgress(progress) {
    this.scrollTarget = clamp(progress, 0, 1);
  }

  getState() {
    const progress = this.reducedMotion ? this.scrollTarget : lerp(this.scrollCurrent, this.scrollTarget, 0.075);
    this.scrollCurrent = progress;

    const immersion = easeInOutCubic(progress);
    const surfaceStart = this.viewport.height * mapRange(this.viewport.width, 360, 1600, 0.58, 0.52);
    const surfaceEnd = -this.viewport.height * 0.22;
    const waterlineY = lerp(surfaceStart, surfaceEnd, immersion);
    const rightLift = this.viewport.height * (this.reducedMotion ? 0.03 : 0.04 + immersion * 0.19);
    const leftDrop = this.viewport.height * immersion * 0.03;
    const amplitude = this.viewport.height * (this.reducedMotion ? 0.004 : 0.005 + immersion * 0.008);
    const ripple = this.reducedMotion ? 0.45 : 0.75 + immersion * 0.35;
    const distortion = 0.18 + immersion * 0.92;
    const reflectionStrength = 0.5 + immersion * 0.95;

    return {
      progress,
      immersion,
      waterlineY,
      rightLift,
      leftDrop,
      amplitude,
      ripple,
      distortion,
      reflectionStrength,
    };
  }

  applyCssState(state) {
    const root = document.documentElement;
    root.style.setProperty('--waterline', `${state.waterlineY}px`);
    root.style.setProperty('--water-offset', `${state.progress * 6}px`);
    root.style.setProperty('--water-intensity', `${1 + state.distortion * 1.3}`);
    root.style.setProperty('--copy-shift-x', `${Math.sin(this.time * 0.35) * (2 + state.distortion * 6)}px`);
    root.style.setProperty('--copy-shift-y', `${4 + Math.cos(this.time * 0.42) * (2 + state.distortion * 8)}px`);
    root.style.setProperty('--copy-blur', `${state.progress * 0.8}px`);
    root.style.setProperty('--hero-progress', state.progress.toFixed(4));
    root.style.setProperty('--surface-tilt', `${state.rightLift}px`);

    const turbulence = document.getElementById('underwater-turbulence');
    if (turbulence) {
      const xFreq = 0.009 + state.distortion * 0.0026;
      const yFreq = 0.04 + state.distortion * 0.015;
      turbulence.setAttribute('baseFrequency', `${xFreq.toFixed(4)} ${yFreq.toFixed(4)}`);
    }

    const displacement = document.getElementById('underwater-displacement');
    if (displacement) {
      displacement.setAttribute('scale', `${12 + state.distortion * 22}`);
    }
  }

  sampleWaterY(x, state) {
    const normalized = x / this.viewport.width;
    const controlledTilt = -state.rightLift * normalized * normalized * 1.05 + state.leftDrop * (1 - normalized) * 0.7;
    const longWave = Math.sin(normalized * 4.8 + this.time * 0.38) * state.amplitude;
    const midWave = Math.sin(normalized * 9.4 - this.time * 0.52 + 1.2) * state.amplitude * 0.42;
    const detail = Math.cos(normalized * 18 + this.time * 0.85) * state.amplitude * 0.12;
    return state.waterlineY + controlledTilt + (longWave + midWave + detail) * state.ripple;
  }

  drawBackground(state) {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, this.viewport.height);
    sky.addColorStop(0, 'rgba(13, 25, 43, 0.08)');
    sky.addColorStop(0.45, 'rgba(22, 40, 63, 0.04)');
    sky.addColorStop(1, 'rgba(2, 8, 15, 0.42)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const lightX = this.viewport.width * 0.78;
    const lightY = this.viewport.height * 0.18;
    const source = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, this.viewport.width * 0.24);
    source.addColorStop(0, `rgba(244, 251, 255, ${0.28 + state.reflectionStrength * 0.1})`);
    source.addColorStop(0.22, `rgba(171, 208, 240, ${0.18 + state.reflectionStrength * 0.08})`);
    source.addColorStop(1, 'rgba(112, 155, 194, 0)');
    ctx.fillStyle = source;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const beam = ctx.createLinearGradient(this.viewport.width * 0.62, 0, this.viewport.width * 0.52, this.viewport.height);
    beam.addColorStop(0, `rgba(198, 227, 255, ${0.08 + state.reflectionStrength * 0.04})`);
    beam.addColorStop(0.3, 'rgba(119, 166, 204, 0.05)');
    beam.addColorStop(1, 'rgba(15, 37, 58, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(this.viewport.width * 0.58, 0);
    ctx.lineTo(this.viewport.width * 0.88, 0);
    ctx.lineTo(this.viewport.width * 0.62, this.viewport.height);
    ctx.lineTo(this.viewport.width * 0.42, this.viewport.height);
    ctx.closePath();
    ctx.fill();
  }

  buildSurfacePoints(state, step = 8) {
    const points = [];
    for (let x = -step; x <= this.viewport.width + step; x += step) {
      points.push([x, this.sampleWaterY(x, state)]);
    }
    return points;
  }

  drawWaterBody(points, state) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0][0], this.viewport.height);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], this.viewport.height);
    ctx.closePath();

    const fill = ctx.createLinearGradient(0, state.waterlineY - 40, 0, this.viewport.height);
    fill.addColorStop(0, 'rgba(148, 189, 222, 0.14)');
    fill.addColorStop(0.08, 'rgba(89, 124, 158, 0.22)');
    fill.addColorStop(0.24, 'rgba(31, 59, 85, 0.84)');
    fill.addColorStop(0.66, 'rgba(8, 18, 31, 0.98)');
    fill.addColorStop(1, 'rgba(3, 8, 14, 1)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  drawSpecularReflections(points, state) {
    const { ctx } = this;
    const sourceX = this.viewport.width * 0.76;
    const sourceY = this.viewport.height * 0.16;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const crest = ctx.createLinearGradient(0, state.waterlineY - 18, 0, state.waterlineY + 80);
    crest.addColorStop(0, `rgba(255,255,255,${0.16 + state.reflectionStrength * 0.16})`);
    crest.addColorStop(0.25, `rgba(203, 228, 250, ${0.1 + state.reflectionStrength * 0.12})`);
    crest.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = crest;
    ctx.fillRect(0, state.waterlineY - 18, this.viewport.width, 120);

    const mainReflection = ctx.createLinearGradient(sourceX, sourceY, this.viewport.width * 0.4, this.viewport.height);
    mainReflection.addColorStop(0, `rgba(255,255,255,${0.22 + state.reflectionStrength * 0.12})`);
    mainReflection.addColorStop(0.2, `rgba(208, 236, 255, ${0.14 + state.reflectionStrength * 0.12})`);
    mainReflection.addColorStop(0.5, 'rgba(114, 168, 214, 0.08)');
    mainReflection.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = mainReflection;
    ctx.lineWidth = 24 + state.reflectionStrength * 26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY + 50);
    ctx.bezierCurveTo(
      sourceX - this.viewport.width * 0.05,
      state.waterlineY + 24,
      this.viewport.width * 0.62,
      state.waterlineY + 120,
      this.viewport.width * 0.56,
      this.viewport.height,
    );
    ctx.stroke();

    ctx.lineWidth = 9 + state.reflectionStrength * 14;
    ctx.strokeStyle = `rgba(250, 252, 255, ${0.08 + state.reflectionStrength * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(sourceX + 30, sourceY + 80);
    ctx.bezierCurveTo(
      sourceX,
      state.waterlineY + 12,
      this.viewport.width * 0.67,
      state.waterlineY + 110,
      this.viewport.width * 0.63,
      this.viewport.height,
    );
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(232, 243, 255, ${0.12 + state.reflectionStrength * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawWaterStrata(state) {
    const { ctx } = this;
    const lineCount = this.viewport.width < 720 ? 18 : 24;
    for (let index = 0; index < lineCount; index += 1) {
      const depth = index / lineCount;
      const yBase = state.waterlineY + 28 + depth * (this.viewport.height - state.waterlineY) * 0.92;
      const spread = (1 - depth) * state.amplitude * 2.2 + 1.6;
      ctx.beginPath();
      for (let x = -12; x <= this.viewport.width + 12; x += 12) {
        const nx = x / this.viewport.width;
        const rightPull = -state.rightLift * nx * nx * (1 - depth * 0.78);
        const wave = Math.sin(nx * (5.4 + depth * 1.2) - this.time * (0.42 + depth * 0.24) + index * 0.26) * spread;
        const ribbon = Math.cos(nx * (12 + depth * 2.6) + this.time * 0.55 + index * 0.3) * spread * 0.14;
        const y = yBase + rightPull + wave + ribbon + depth * depth * 10;
        if (x <= -12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(214, 232, 250, ${0.04 + (1 - depth) * 0.08})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawSubsurfaceGlow(state) {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(
      this.viewport.width * 0.63,
      state.waterlineY + this.viewport.height * 0.24,
      0,
      this.viewport.width * 0.63,
      state.waterlineY + this.viewport.height * 0.24,
      this.viewport.width * 0.34,
    );
    glow.addColorStop(0, `rgba(122, 170, 212, ${0.08 + state.reflectionStrength * 0.08})`);
    glow.addColorStop(1, 'rgba(122, 170, 212, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, Math.max(0, state.waterlineY), this.viewport.width, this.viewport.height);
  }

  draw(state) {
    const points = this.buildSurfacePoints(state, this.viewport.width < 720 ? 10 : 8);
    this.drawBackground(state);
    this.drawWaterBody(points, state);
    this.drawSubsurfaceGlow(state);
    this.drawWaterStrata(state);
    this.drawSpecularReflections(points, state);
  }

  tick(frame) {
    if (!this.active) return;
    this.time = frame * 0.001;
    const state = this.getState();
    this.applyCssState(state);

    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.draw(state);

    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}
