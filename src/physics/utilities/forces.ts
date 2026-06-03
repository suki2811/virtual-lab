import Matter from 'matter-js';
import { 
  WORLD_PIXELS_PER_METER, 
  MATTER_BASE_TIMESTEP_MS,
  REAL_FORCE_TO_MATTER
} from '../constants';

const MATTER_BASE_TIMESTEP_SECONDS = MATTER_BASE_TIMESTEP_MS / 1000;

export interface SpringConfig {
  naturalLength: number;
  springConstant: number;
  dampingRatio: number;
}

export interface RopeTensionConfig {
  bodyA: Matter.Body;
  bodyB: Matter.Body;
  pointA: Matter.Vector;
  pointB: Matter.Vector;
  restLength: number;
  externalAccelerationA?: Matter.Vector;
  externalAccelerationB?: Matter.Vector;
  gravityMps2?: number;
  slackTolerancePx?: number;
}

/**
 * Converts degrees to a unit vector.
 * Maps 0° to Right, 90° to Up (screen -Y), 180° to Left, 270° to Down (screen +Y).
 */
export const degreesToUnitVector = (angleDeg: number): Matter.Vector => {
  const radians = (angleDeg * Math.PI) / 180;
  // In screen coordinates, Y increases downwards. 
  // We negate sine so 90° points Up.
  return { x: Math.cos(radians), y: -Math.sin(radians) };
};

/**
 * Calculates a body's reference area in m^2.
 */
export const getBodyReferenceAreaM2 = (body: Matter.Body): number => {
  if (body.circleRadius && body.circleRadius > 0) {
    const radiusM = body.circleRadius / WORLD_PIXELS_PER_METER;
    return Math.PI * radiusM * radiusM;
  }

  const widthM = Math.max(0.01, (body.bounds.max.x - body.bounds.min.x) / WORLD_PIXELS_PER_METER);
  const heightM = Math.max(0.01, (body.bounds.max.y - body.bounds.min.y) / WORLD_PIXELS_PER_METER);
  return widthM * heightM;
};

/**
 * Converts a speed in m/s and angle in degrees to Matter's 60Hz-normalized velocity.
 */
export const speedMpsToWorldVelocity = (speedMps: number, angleDeg: number, maxSpeedMps: number): Matter.Vector => {
  const direction = degreesToUnitVector(angleDeg);
  const clampedSpeed = Math.max(-maxSpeedMps, Math.min(maxSpeedMps, speedMps));
  const worldSpeed = clampedSpeed * WORLD_PIXELS_PER_METER * MATTER_BASE_TIMESTEP_SECONDS;
  return {
    x: worldSpeed * direction.x,
    y: worldSpeed * direction.y
  };
};

export const worldVelocityToMps = (velocity: Matter.Vector): Matter.Vector => ({
  x: velocity.x / WORLD_PIXELS_PER_METER / MATTER_BASE_TIMESTEP_SECONDS,
  y: velocity.y / WORLD_PIXELS_PER_METER / MATTER_BASE_TIMESTEP_SECONDS
});

/**
 * Calculates and applies spring forces between two bodies.
 */
export const applySpringForce = (
  bodyA: Matter.Body,
  bodyB: Matter.Body,
  pointA: Matter.Vector,
  pointB: Matter.Vector,
  config: SpringConfig
) => {
  const cosA = Math.cos(bodyA.angle);
  const sinA = Math.sin(bodyA.angle);
  const start = {
    x: bodyA.position.x + pointA.x * cosA - pointA.y * sinA,
    y: bodyA.position.y + pointA.x * sinA + pointA.y * cosA
  };
  
  const cosB = Math.cos(bodyB.angle);
  const sinB = Math.sin(bodyB.angle);
  const end = {
    x: bodyB.position.x + pointB.x * cosB - pointB.y * sinB,
    y: bodyB.position.y + pointB.x * sinB + pointB.y * cosB
  };

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthWorld = Math.hypot(dx, dy);
  if (lengthWorld < 0.001) return { fx: 0, fy: 0 };

  const dirX = dx / lengthWorld;
  const dirY = dy / lengthWorld;
  
  const extensionMeters = (lengthWorld - config.naturalLength) / WORLD_PIXELS_PER_METER;
  
  const relVelocityWorld = {
    x: bodyB.velocity.x - bodyA.velocity.x,
    y: bodyB.velocity.y - bodyA.velocity.y
  };
  
  const relVelocityMetersPerSecond =
    ((relVelocityWorld.x * dirX + relVelocityWorld.y * dirY) / WORLD_PIXELS_PER_METER) / MATTER_BASE_TIMESTEP_SECONDS;

  const massA = bodyA.isStatic ? Infinity : bodyA.mass;
  const massB = bodyB.isStatic ? Infinity : bodyB.mass;
  const effectiveMass =
    Number.isFinite(massA) && Number.isFinite(massB)
      ? (massA * massB) / (massA + massB)
      : Number.isFinite(massA) ? massA : Number.isFinite(massB) ? massB : 0;

  const dampingCoefficient = effectiveMass > 0
    ? config.dampingRatio * 2 * Math.sqrt(config.springConstant * effectiveMass)
    : 0;

  const forceNewtons = config.springConstant * extensionMeters + dampingCoefficient * relVelocityMetersPerSecond;
  
  const force = {
    x: forceNewtons * REAL_FORCE_TO_MATTER * dirX,
    y: forceNewtons * REAL_FORCE_TO_MATTER * dirY
  };

  if (!bodyA.isStatic) Matter.Body.applyForce(bodyA, start, force);
  if (!bodyB.isStatic) Matter.Body.applyForce(bodyB, end, { x: -force.x, y: -force.y });

  return { fx: forceNewtons * dirX, fy: forceNewtons * dirY };
};

const getConstraintWorldPoint = (body: Matter.Body, localPoint: Matter.Vector) => {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return {
    x: body.position.x + localPoint.x * cos - localPoint.y * sin,
    y: body.position.y + localPoint.x * sin + localPoint.y * cos
  };
};

/**
 * Estimates physical rope tension from the constrained-body state.
 *
 * For a massless rope between any two bodies, radial force balance gives:
 *   T = ((aB_ext - aA_ext) dot n + v_tangent^2 / L) / (1/mA + 1/mB)
 *
 * This reports real tension in newtons without feeding solver correction impulses
 * back into the value shown in the UI.
 */
export const calculateRopeTension = ({
  bodyA,
  bodyB,
  pointA,
  pointB,
  restLength,
  externalAccelerationA,
  externalAccelerationB,
  gravityMps2 = 0,
  slackTolerancePx = 0
}: RopeTensionConfig): number => {
  const start = getConstraintWorldPoint(bodyA, pointA);
  const end = getConstraintWorldPoint(bodyB, pointB);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthPx = Math.hypot(dx, dy);

  if (lengthPx < 0.001 || restLength <= 0 || lengthPx < restLength - slackTolerancePx) {
    return 0;
  }

  const invMassA = bodyA.isStatic ? 0 : 1 / Math.max(bodyA.mass, 1e-12);
  const invMassB = bodyB.isStatic ? 0 : 1 / Math.max(bodyB.mass, 1e-12);
  const invMassTotal = invMassA + invMassB;
  if (invMassTotal <= 0) return 0;

  const nx = dx / lengthPx;
  const ny = dy / lengthPx;
  const relVxMps = ((bodyB.velocity.x - bodyA.velocity.x) / WORLD_PIXELS_PER_METER) / MATTER_BASE_TIMESTEP_SECONDS;
  const relVyMps = ((bodyB.velocity.y - bodyA.velocity.y) / WORLD_PIXELS_PER_METER) / MATTER_BASE_TIMESTEP_SECONDS;
  const radialVelocityMps = relVxMps * nx + relVyMps * ny;
  const tangentVxMps = relVxMps - radialVelocityMps * nx;
  const tangentVyMps = relVyMps - radialVelocityMps * ny;
  const tangentSpeedSq = tangentVxMps * tangentVxMps + tangentVyMps * tangentVyMps;
  const lengthM = Math.max(restLength, lengthPx) / WORLD_PIXELS_PER_METER;

  const accelA = externalAccelerationA ?? { x: 0, y: bodyA.isStatic ? 0 : gravityMps2 };
  const accelB = externalAccelerationB ?? { x: 0, y: bodyB.isStatic ? 0 : gravityMps2 };
  const externalAccelAlongRope = (accelB.x - accelA.x) * nx + (accelB.y - accelA.y) * ny;
  const requiredRadialAccel = externalAccelAlongRope + tangentSpeedSq / Math.max(lengthM, 1e-9);
  const tension = requiredRadialAccel / invMassTotal;

  return Number.isFinite(tension) ? Math.max(0, tension) : 0;
};

/**
 * Calculates air resistance (drag) based on body velocity and environment.
 */
export const applyAirResistance = (
  body: Matter.Body,
  airDensity: number,
  dragCoefficient: number,
  maxForceNewtons: number
) => {
  const dragForce = calculateAirResistanceForce(body, airDensity, dragCoefficient, maxForceNewtons);

  Matter.Body.applyForce(body, body.position, {
    x: dragForce.fx * REAL_FORCE_TO_MATTER,
    y: dragForce.fy * REAL_FORCE_TO_MATTER
  });

  return dragForce;
};

export const calculateAirResistanceForce = (
  body: Matter.Body,
  airDensity: number,
  dragCoefficient: number,
  maxForceNewtons: number
) => {
  const vxMps = (body.velocity.x / WORLD_PIXELS_PER_METER) / MATTER_BASE_TIMESTEP_SECONDS;
  const vyMps = (body.velocity.y / WORLD_PIXELS_PER_METER) / MATTER_BASE_TIMESTEP_SECONDS;
  const speedMps = Math.hypot(vxMps, vyMps);

  if (speedMps > 0.001) {
    const area = getBodyReferenceAreaM2(body);
    const drag = 0.5 * dragCoefficient * airDensity * area * speedMps * speedMps;
    const dragForce = Math.min(drag, maxForceNewtons);
    
    return {
      fx: -dragForce * (vxMps / speedMps),
      fy: -dragForce * (vyMps / speedMps)
    };
  }

  return { fx: 0, fy: 0 };
};
