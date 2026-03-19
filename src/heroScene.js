import { clamp, dpr, easeInOutCubic, lerp, mapRange } from './utils.js';

const TITLE_LINES = ['THE OCEAN', 'DOES NOT HIDE', 'WHAT WE THROW AWAY'];

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

    this.sourceCanvas = document.createElement('canvas');
    this.sourceCtx = this.sourceCanvas.getContext('2d');
    this.reflectionCanvas = document.createElement('canvas');
    this.reflectionCtx = this.reflectionCanvas.getContext('2d');

    if (!this.active || !this.sourceCtx || !this.reflectionCtx) {
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
    this.viewport.dpr = dpr(window.innerWidth < 720 ? 1.35 : 1.8);

    [this.canvas, this.sourceCanvas, this.reflectionCanvas].forEach((canvas) => {
      canvas.width = Math.round(this.viewport.width * this.viewport.dpr);
      canvas.height = Math.round(this.viewport.height * this.viewport.dpr);
    });

    this.canvas.style.width = `${this.viewport.width}px`;
    this.canvas.style.height = `${this.viewport.height}px`;

    [this.ctx, this.sourceCtx, this.reflectionCtx].forEach((ctx) => {
      ctx.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
    });
  }

  setScrollProgress(progress) {
    this.scrollTarget = clamp(progress, 0, 1);
  }

  getState() {
    const progress = this.reducedMotion ? this.scrollTarget : lerp(this.scrollCurrent, this.scrollTarget, 0.08);
    this.scrollCurrent = progress;

    const immersion = easeInOutCubic(progress);
    const surfaceStart = this.viewport.height * mapRange(this.viewport.width, 360, 1600, 0.63, 0.57);
    const surfaceEnd = this.viewport.height * 0.08;
    const waterlineY = lerp(surfaceStart, surfaceEnd, immersion);
    const rightLift = this.viewport.height * (this.reducedMotion ? 0.05 : 0.06 + immersion * 0.26);
    const leftDrop = this.viewport.height * immersion * 0.035;
    const amplitude = this.viewport.height * (this.reducedMotion ? 0.0035 : 0.004 + immersion * 0.0065);
    const ripple = this.reducedMotion ? 0.4 : 0.6 + immersion * 0.4;
    const distortion = 0.24 + immersion * 1.12;
    const lensThickness = this.viewport.height * (0.11 + immersion * 0.065);
    const reflectionStrength = 0.72 + immersion * 0.68;

    return {
      progress,
      immersion,
      waterlineY,
      rightLift,
      leftDrop,
      amplitude,
      ripple,
      distortion,
      lensThickness,
      reflectionStrength,
    };
  }

  applyCssState(state) {
    const root = document.documentElement;
    root.style.setProperty('--waterline', `${state.waterlineY}px`);
    root.style.setProperty('--water-offset', `${state.progress * 4}px`);
    root.style.setProperty('--water-intensity', `${1 + state.distortion * 1.1}`);
    root.style.setProperty('--copy-shift-x', `${Math.sin(this.time * 0.4) * (2 + state.distortion * 4)}px`);
    root.style.setProperty('--copy-shift-y', `${3 + Math.cos(this.time * 0.46) * (3 + state.distortion * 7)}px`);
    root.style.setProperty('--copy-blur', `${0.2 + state.progress * 1.1}px`);
    root.style.setProperty('--hero-progress', state.progress.toFixed(4));

    const turbulence = document.getElementById('underwater-turbulence');
    if (turbulence) {
      const xFreq = 0.009 + state.distortion * 0.0022;
      const yFreq = 0.042 + state.distortion * 0.016;
      turbulence.setAttribute('baseFrequency', `${xFreq.toFixed(4)} ${yFreq.toFixed(4)}`);
    }

    const displacement = document.getElementById('underwater-displacement');
    if (displacement) {
      displacement.setAttribute('scale', `${18 + state.distortion * 22}`);
    }
  }

  sampleWaterY(x, state) {
    const normalized = x / this.viewport.width;
    const tilt = -state.rightLift * normalized * normalized * 1.04 + state.leftDrop * (1 - normalized) * 0.65;
    const longWave = Math.sin(normalized * 4.2 + this.time * 0.3) * state.amplitude;
    const midWave = Math.sin(normalized * 8.7 - this.time * 0.42 + 1.4) * state.amplitude * 0.46;
    const detail = Math.cos(normalized * 15 + this.time * 0.75) * state.amplitude * 0.15;
    return state.waterlineY + tilt + (longWave + midWave + detail) * state.ripple;
  }

  buildSurfacePoints(state, step = 10) {
    const points = [];
    for (let x = -step; x <= this.viewport.width + step; x += step) {
      points.push([x, this.sampleWaterY(x, state)]);
    }
    return points;
  }

  buildLensPoints(points, state) {
    return points.map(([x, y], index) => {
      const normalized = clamp(x / this.viewport.width, 0, 1);
      const bulge = Math.sin(normalized * Math.PI) * state.lensThickness * 0.18;
      const taper = index / Math.max(points.length - 1, 1);
      return [x, y + state.lensThickness + bulge + taper * state.lensThickness * 0.08];
    });
  }

  clipPolygon(ctx, topPoints, bottomPoints) {
    ctx.beginPath();
    ctx.moveTo(topPoints[0][0], topPoints[0][1]);
    topPoints.forEach(([x, y]) => ctx.lineTo(x, y));
    for (let index = bottomPoints.length - 1; index >= 0; index -= 1) {
      ctx.lineTo(bottomPoints[index][0], bottomPoints[index][1]);
    }
    ctx.closePath();
    ctx.clip();
  }

  drawSourceBackdrop(state) {
    const { sourceCtx: ctx } = this;
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);

    const sky = ctx.createLinearGradient(0, 0, 0, this.viewport.height);
    sky.addColorStop(0, '#587da6');
    sky.addColorStop(0.58, '#48729c');
    sky.addColorStop(1, '#0a2038');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const haze = ctx.createRadialGradient(
      this.viewport.width * 0.18,
      this.viewport.height * 0.8,
      0,
      this.viewport.width * 0.18,
      this.viewport.height * 0.8,
      this.viewport.width * 0.42,
    );
    haze.addColorStop(0, 'rgba(245, 246, 242, 0.38)');
    haze.addColorStop(1, 'rgba(245, 246, 242, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const light = ctx.createRadialGradient(
      this.viewport.width * 0.8,
      this.viewport.height * 0.12,
      0,
      this.viewport.width * 0.8,
      this.viewport.height * 0.12,
      this.viewport.width * 0.32,
    );
    light.addColorStop(0, `rgba(255,255,255,${0.22 + state.reflectionStrength * 0.12})`);
    light.addColorStop(0.24, 'rgba(220,236,255,0.16)');
    light.addColorStop(1, 'rgba(220,236,255,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const beam = ctx.createLinearGradient(this.viewport.width * 0.7, 0, this.viewport.width * 0.55, this.viewport.height);
    beam.addColorStop(0, 'rgba(247,251,255,0.16)');
    beam.addColorStop(0.28, 'rgba(201,226,248,0.08)');
    beam.addColorStop(1, 'rgba(201,226,248,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(this.viewport.width * 0.64, 0);
    ctx.lineTo(this.viewport.width * 0.94, 0);
    ctx.lineTo(this.viewport.width * 0.62, this.viewport.height);
    ctx.lineTo(this.viewport.width * 0.42, this.viewport.height);
    ctx.closePath();
    ctx.fill();

    const starCount = this.viewport.width < 720 ? 18 : 30;
    for (let index = 0; index < starCount; index += 1) {
      const nx = (index * 0.6180339887) % 1;
      const ny = (index * 0.3819660113) % 1;
      const radius = 0.8 + (index % 3) * 0.45;
      ctx.fillStyle = `rgba(255, 241, 202, ${0.35 - (index % 5) * 0.04})`;
      ctx.beginPath();
      ctx.arc(nx * this.viewport.width, ny * this.viewport.height * 0.9 + 30, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSourceDebris() {
    const { sourceCtx: ctx } = this;
    const shapes = [
      { x: 0.08, y: 0.16, w: 0.07, h: 0.34, r: -0.02, alpha: 0.46 },
      { x: 0.55, y: 0.06, w: 0.05, h: 0.28, r: 0.06, alpha: 0.36 },
      { x: 0.84, y: 0.22, w: 0.04, h: 0.16, r: -0.16, alpha: 0.22 },
      { x: 0.47, y: 0.68, w: 0.05, h: 0.22, r: 0.28, alpha: 0.26 },
    ];

    shapes.forEach((shape, index) => {
      const x = this.viewport.width * shape.x;
      const y = this.viewport.height * shape.y;
      const w = this.viewport.width * shape.w;
      const h = this.viewport.height * shape.h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(shape.r + Math.sin(this.time * 0.25 + index) * 0.03);
      const material = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      material.addColorStop(0, `rgba(82, 110, 156, ${shape.alpha})`);
      material.addColorStop(0.42, `rgba(235, 243, 250, ${shape.alpha * 0.78})`);
      material.addColorStop(0.62, `rgba(92, 124, 176, ${shape.alpha * 0.92})`);
      material.addColorStop(1, `rgba(41, 60, 97, ${shape.alpha * 0.72})`);
      ctx.fillStyle = material;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.22);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${shape.alpha * 0.45})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });
  }

  drawSourceTypography() {
    const { sourceCtx: ctx } = this;
    const fontSize = Math.min(this.viewport.width * 0.118, this.viewport.height * 0.21);
    const lineHeight = fontSize * 0.9;
    const startX = this.viewport.width * 0.16;
    const startY = this.viewport.height * 0.26;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.font = `800 ${fontSize}px Manrope, Inter, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(21, 33, 50, 0.18)';
    ctx.shadowBlur = 24;

    TITLE_LINES.forEach((line, index) => {
      let x = startX;
      if (index === 1) x = this.viewport.width * 0.5;
      if (index === 2) x = this.viewport.width * 0.1;
      ctx.fillText(line, x, startY + index * lineHeight * 1.04);
    });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${Math.min(this.viewport.width * 0.024, 34)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('PLASTIC, METAL, AND SYNTHETIC WASTE DRIFT BELOW THE SURFACE.', this.viewport.width * 0.54, this.viewport.height * 0.78);
    ctx.restore();
  }

  updateReflectionCanvas() {
    const { reflectionCtx: ctx } = this;
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    ctx.save();
    ctx.translate(0, this.viewport.height);
    ctx.scale(1, -1);
    ctx.drawImage(this.sourceCanvas, 0, 0, this.viewport.width, this.viewport.height);
    ctx.restore();
  }

  drawLensBand(points, lowerPoints, state) {
    const { ctx } = this;
    ctx.save();
    this.clipPolygon(ctx, points, lowerPoints);

    const refractionScale = 1 + state.distortion * 0.03;
    for (let pass = 0; pass < 3; pass += 1) {
      const passOffsetX = (pass - 1) * (8 + state.distortion * 5);
      const passOffsetY = -10 + pass * 8;
      ctx.globalAlpha = 0.16 + pass * 0.08;
      ctx.drawImage(
        this.sourceCanvas,
        this.viewport.width * -0.01 + passOffsetX,
        this.viewport.height * -0.02 + passOffsetY,
        this.viewport.width * refractionScale,
        this.viewport.height * (1.02 + pass * 0.01),
      );
    }

    const sheen = ctx.createLinearGradient(0, points[0][1], 0, lowerPoints[0][1] + state.lensThickness * 0.2);
    sheen.addColorStop(0, `rgba(248, 252, 255, ${0.26 + state.reflectionStrength * 0.1})`);
    sheen.addColorStop(0.32, 'rgba(212, 230, 246, 0.18)');
    sheen.addColorStop(0.58, 'rgba(135, 171, 201, 0.12)');
    sheen.addColorStop(1, 'rgba(25, 44, 70, 0.06)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,255,255,${0.2 + state.reflectionStrength * 0.16})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = `rgba(208, 226, 244, ${0.18 + state.reflectionStrength * 0.12})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    lowerPoints.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawWaterReflection(points, state) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0][0], this.viewport.height);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], this.viewport.height);
    ctx.closePath();
    ctx.clip();

    const stripWidth = this.viewport.width < 720 ? 5 : 4;
    for (let x = 0; x < this.viewport.width; x += stripWidth) {
      const surfaceY = this.sampleWaterY(x + stripWidth * 0.5, state);
      const depth = this.viewport.height - surfaceY;
      const nx = x / this.viewport.width;
      const distortX = Math.sin(nx * 26 + this.time * 1.35) * (2 + state.distortion * 2.2);
      const waveStretch = 0.55 + nx * 0.18;
      const srcX = clamp(x + distortX * 2, 0, this.viewport.width - stripWidth);
      const srcY = clamp(this.viewport.height - surfaceY - depth * 0.08, 0, this.viewport.height - 8);
      const srcH = clamp(depth * waveStretch, 18, this.viewport.height - srcY);
      const destY = surfaceY + Math.sin(nx * 18 - this.time * 0.9) * (1.4 + state.distortion * 0.5);
      ctx.globalAlpha = 0.58 + (1 - nx) * 0.08;
      ctx.drawImage(this.reflectionCanvas, srcX, srcY, stripWidth, srcH, x + distortX, destY, stripWidth, depth + 14);
    }

    const tint = ctx.createLinearGradient(0, state.waterlineY, 0, this.viewport.height);
    tint.addColorStop(0, 'rgba(132, 168, 200, 0.08)');
    tint.addColorStop(0.18, 'rgba(77, 104, 134, 0.16)');
    tint.addColorStop(0.58, 'rgba(16, 31, 49, 0.56)');
    tint.addColorStop(1, 'rgba(6, 15, 25, 0.94)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint;
    ctx.fillRect(0, state.waterlineY, this.viewport.width, this.viewport.height - state.waterlineY);

    ctx.restore();
  }

  drawWaterRidges(state) {
    const { ctx } = this;
    const lineCount = this.viewport.width < 720 ? 24 : 30;
    for (let index = 0; index < lineCount; index += 1) {
      const depth = index / lineCount;
      const yBase = state.waterlineY + 24 + depth * (this.viewport.height - state.waterlineY) * 0.94;
      const spread = (1 - depth) * state.amplitude * 2.6 + 1.4;
      ctx.beginPath();
      for (let x = -12; x <= this.viewport.width + 12; x += 12) {
        const nx = x / this.viewport.width;
        const pull = -state.rightLift * nx * nx * (1 - depth * 0.75) * 0.9;
        const wave = Math.sin(nx * (4.8 + depth * 1.3) - this.time * (0.34 + depth * 0.22) + index * 0.22) * spread;
        const ripple = Math.cos(nx * (11 + depth * 2.1) + this.time * 0.52 + index * 0.28) * spread * 0.2;
        const y = yBase + pull + wave + ripple + depth * depth * 11;
        if (x <= -12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(232, 241, 250, ${0.13 - depth * 0.09})`;
      ctx.lineWidth = depth < 0.12 ? 1.5 : 1;
      ctx.stroke();
    }
  }

  drawWaterGlow(state) {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(
      this.viewport.width * 0.62,
      state.waterlineY + this.viewport.height * 0.18,
      0,
      this.viewport.width * 0.62,
      state.waterlineY + this.viewport.height * 0.18,
      this.viewport.width * 0.34,
    );
    glow.addColorStop(0, `rgba(214, 231, 246, ${0.12 + state.reflectionStrength * 0.08})`);
    glow.addColorStop(0.4, 'rgba(122, 164, 198, 0.08)');
    glow.addColorStop(1, 'rgba(122, 164, 198, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, state.waterlineY, this.viewport.width, this.viewport.height - state.waterlineY);
  }

  drawSurfaceSpecular(points, state) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + state.reflectionStrength * 0.14})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const streak = ctx.createLinearGradient(this.viewport.width * 0.9, 0, this.viewport.width * 0.54, this.viewport.height);
    streak.addColorStop(0, 'rgba(255,255,255,0.38)');
    streak.addColorStop(0.28, 'rgba(233, 244, 255, 0.18)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = streak;
    ctx.lineWidth = 18 + state.reflectionStrength * 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.viewport.width * 0.9, 0);
    ctx.bezierCurveTo(
      this.viewport.width * 0.88,
      state.waterlineY - 80,
      this.viewport.width * 0.76,
      state.waterlineY + state.lensThickness * 0.4,
      this.viewport.width * 0.58,
      this.viewport.height,
    );
    ctx.stroke();
    ctx.restore();
  }

  draw(state) {
    const points = this.buildSurfacePoints(state, this.viewport.width < 720 ? 12 : 10);
    const lowerPoints = this.buildLensPoints(points, state);

    this.drawSourceBackdrop(state);
    this.drawSourceDebris();
    this.drawSourceTypography();
    this.updateReflectionCanvas();

    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.ctx.drawImage(this.sourceCanvas, 0, 0, this.viewport.width, this.viewport.height);
    this.drawLensBand(points, lowerPoints, state);
    this.drawWaterReflection(lowerPoints, state);
    this.drawWaterGlow(state);
    this.drawWaterRidges(state);
    this.drawSurfaceSpecular(points, state);
  }

  tick(frame) {
    if (!this.active) return;
    this.time = frame * 0.001;
    const state = this.getState();
    this.applyCssState(state);
    this.draw(state);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}
