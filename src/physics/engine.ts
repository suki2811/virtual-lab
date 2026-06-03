import Matter from 'matter-js';
import { STANDARD_GRAVITY_MPS2 } from './constants';

export interface PhysicsEngineOptions {
  gravityScale?: number;
}

/**
 * Creates a Matter.js engine with scientifically calibrated defaults.
 */
export const createPhysicsEngine = (options: PhysicsEngineOptions = {}) => {
  const engine = Matter.Engine.create({
    gravity: { 
      x: 0, 
      y: (options.gravityScale ?? STANDARD_GRAVITY_MPS2) / 9.80665 // Normalize to Matter's 1.0 unit
    },
    positionIterations: 12, // Higher precision for a "lab" environment
    velocityIterations: 10,
    constraintIterations: 8,
    enableSleeping: false // Usually disabled for active lab experiments
  });

  return engine;
};

/**
 * Sets world gravity using real-world m/s^2 units.
 */
export const setWorldGravity = (engine: Matter.Engine, mps2: number) => {
  // Matter.js default gravity 1.0 is ~9.8 m/s^2
  engine.gravity.y = mps2 / 9.80665;
};
