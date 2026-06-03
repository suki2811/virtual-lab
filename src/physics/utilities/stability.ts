import Matter from 'matter-js';
import { 
  MAX_LINEAR_SPEED_MPS, 
  MAX_ANGULAR_SPEED_RADPS,
  WORLD_PIXELS_PER_METER
} from '../constants';

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Applies numerical stability constraints to prevent "tunneling" and NaN explosions.
 */
export const applyNumericalStability = (engine: Matter.Engine) => {
  const bodies = Matter.Composite.allBodies(engine.world);
  
  // Convert speed limit from m/s to px/update
  const maxSpeedPx = (MAX_LINEAR_SPEED_MPS * WORLD_PIXELS_PER_METER) / 60;

  for (const body of bodies) {
    if (body.isStatic) continue;

    // 1. NaN Protection
    if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) {
      console.warn(`[Physics] Resetting body ${body.label} due to NaN position`);
      Matter.Body.setPosition(body, { x: 400, y: 100 });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      continue;
    }

    // 2. Velocity Clamping
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed > maxSpeedPx) {
      const ratio = maxSpeedPx / speed;
      Matter.Body.setVelocity(body, {
        x: body.velocity.x * ratio,
        y: body.velocity.y * ratio
      });
    }

    // 3. Angular Velocity Clamping
    if (!Number.isFinite(body.angularVelocity)) {
      Matter.Body.setAngularVelocity(body, 0);
    } else {
      Matter.Body.setAngularVelocity(body, clamp(body.angularVelocity, -MAX_ANGULAR_SPEED_RADPS, MAX_ANGULAR_SPEED_RADPS));
    }
  }

  // Rope slack/tension is handled by the custom rope force solver in usePhysics2.
  // Do not toggle Matter's native constraint stiffness here; doing so creates a
  // second solver path that injects hard impulses when a slack rope becomes taut.
};
