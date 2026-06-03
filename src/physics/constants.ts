/**
 * Physical Constants and Conversion Factors
 */

// Visual Calibration
export const WORLD_PIXELS_PER_METER = 100;
export const MATTER_BASE_TIMESTEP_MS = 1000 / 60;
export const REAL_FORCE_TO_MATTER = WORLD_PIXELS_PER_METER / 1_000_000;

// Matter.js defaults
// In Matter.js, gravity 1 is approximately 9.8 m/s^2 at 60fps
// We want to be explicit.
export const STANDARD_GRAVITY_MPS2 = 9.80665;
export const DEFAULT_BODY_MASS_KG = 10;
export const DEFAULT_BODY_FRICTION = 0.5;
export const DEFAULT_BODY_RESTITUTION = 1;

// Stability Constants
export const FIXED_TIMESTEP_MS = 1000 / 120; // 120Hz for better stability
export const MAX_FRAME_DELTA_MS = 1000 / 15;
export const MAX_SUBSTEPS = 16; // Increased for higher frequency stability

// Safety Limits
export const MAX_LINEAR_SPEED_MPS = 50; 
export const MAX_ANGULAR_SPEED_RADPS = Math.PI * 2; // 1 rotation per second limit

// Material Presets (Density in kg/m^3)
export const MATERIALS = {
  STEEL: { density: 7850, friction: 0.2, restitution: 0.3 },
  WOOD: { density: 700, friction: 0.5, restitution: 0.2 },
  ICE: { density: 917, friction: 0.02, restitution: 0.1 },
  RUBBER: { density: 1100, friction: 0.8, restitution: 0.8 },
  LEAD: { density: 11340, friction: 0.4, restitution: 0.05 },
  AIR: { density: 1.225, dragCoefficient: 0.47 }
} as const;

// Matter.js uses a density where 0.001 is "standard" (approx water).
// We need to convert our real-world kg/m^3 to Matter density.
// If 1m = 100px, then 1m^2 = 10,000px^2.
// In Matter, mass = area * density.
// We want mass (kg) = (area_px / 10000) * density_kg_m2
export const KG_M2_TO_MATTER_DENSITY = 1 / (WORLD_PIXELS_PER_METER * WORLD_PIXELS_PER_METER);
