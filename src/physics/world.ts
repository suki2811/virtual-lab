import Matter from 'matter-js';
import {
  FIXED_TIMESTEP_MS,
  MAX_FRAME_DELTA_MS,
  MAX_SUBSTEPS
} from './constants';
import { applyNumericalStability } from './utilities/stability';

export interface FixedStepLoop {
  start: () => void;
  stop: () => void;
  setPaused: (paused: boolean) => void;
  isPaused: () => boolean;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
}

/**
 * Creates a fixed-timestep loop for deterministic and accurate physics simulation.
 */
export const createFixedStepLoop = (engine: Matter.Engine, render?: Matter.Render): FixedStepLoop => {
  let rafId = 0;
  let accumulatorMs = 0;
  let lastTimeMs = 0;
  let paused = true;
  let speed = 1;

  const frame = (nowMs: number) => {
    // Prevent huge jumps if the tab was inactive (Spiral of Death protection)
    const deltaMs = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, nowMs - lastTimeMs));
    lastTimeMs = nowMs;

    if (!paused) {
      accumulatorMs += deltaMs * speed;
      let substeps = 0;

      // Run fixed updates
      while (accumulatorMs >= FIXED_TIMESTEP_MS && substeps < MAX_SUBSTEPS) {
        Matter.Engine.update(engine, FIXED_TIMESTEP_MS);
        applyNumericalStability(engine);
        accumulatorMs -= FIXED_TIMESTEP_MS;
        substeps += 1;
      }
    }

    if (render) {
      Matter.Render.world(render);
    }

    rafId = window.requestAnimationFrame(frame);
  };

  return {
    start: () => {
      if (rafId) return;
      lastTimeMs = performance.now();
      accumulatorMs = 0;
      rafId = window.requestAnimationFrame(frame);
    },
    stop: () => {
      if (!rafId) return;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    },
    setPaused: (value: boolean) => {
      paused = value;
    },
    isPaused: () => paused,
    setSpeed: (value: number) => {
      speed = Math.max(0.25, Math.min(2, Number.isFinite(value) ? value : 1));
    },
    getSpeed: () => speed
  };
};
