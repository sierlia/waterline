export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (start, end, alpha) => start + (end - start) * alpha;
export const mapRange = (value, inMin, inMax, outMin, outMax) => {
  if (inMax === inMin) return outMin;
  const ratio = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, ratio);
};
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
export const dpr = (max = 2) => Math.min(window.devicePixelRatio || 1, max);
