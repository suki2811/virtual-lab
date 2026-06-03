import Matter from 'matter-js';
import {
  MATTER_BASE_TIMESTEP_MS,
  WORLD_PIXELS_PER_METER
} from './constants';

const STEP_SECONDS = MATTER_BASE_TIMESTEP_MS / 1000;

export type DebugForceCategory = 'external' | 'internal';

export interface DebugForceVector {
  bodyId: number;
  name: string;
  category: DebugForceCategory;
  point: Matter.Vector;
  force: Matter.Vector;
}

export type DebugForceVectorMap = Map<number, DebugForceVector[]>;

interface DrawVectorOverlayOptions {
  showVelocityComponents: boolean;
  showForceBreakdown: boolean;
  bodies: Matter.Body[];
  externalForces: DebugForceVectorMap;
  internalForces: DebugForceVectorMap;
  pausedVelocityByBodyId: Map<number, Matter.Vector>;
  pausedDynamicKeys: Set<string>;
  gravityMps2: number;
  getBodyKey: (body: Matter.Body) => string;
  getBodyMass: (body: Matter.Body) => number;
}

const NET_VELOCITY_COLOR = '#2563eb';
const NET_FORCE_COLOR = '#dc2626';
const VELOCITY_COMPONENT_COLOR = '#0891b2';
const EXTERNAL_FORCE_COLOR = '#60a5fa';
const INTERNAL_FORCE_COLOR = '#f97316';
const MIN_ARROW_LENGTH = 16;
const MAX_ARROW_LENGTH = 118;
const FORCE_PIXELS_PER_NEWTON = 2.5;
const VELOCITY_PIXELS_PER_MPS = 18;
const VECTOR_EPSILON = 0.001;
const FORCE_NOISE_FLOOR_NEWTONS = 0.05;
const FORCE_NOISE_MAX_NEWTONS = 0.75;
const FORCE_NOISE_RELATIVE_RATIO = 0.005;
const PASSIVE_SUPPORT_FORCE_NAMES = new Set(['Gravity', 'Normal', 'Contact']);

export const createDebugForceVectorMap = (): DebugForceVectorMap => new Map();

export const addDebugForceVector = (
  target: DebugForceVectorMap,
  body: Matter.Body,
  name: string,
  force: Matter.Vector,
  point: Matter.Vector,
  category: DebugForceCategory
) => {
  if (!Number.isFinite(force.x) || !Number.isFinite(force.y)) return;
  if (Math.hypot(force.x, force.y) < 0.001) return;

  const vectors = target.get(body.id) ?? [];
  vectors.push({
    bodyId: body.id,
    name,
    category,
    point: { x: point.x, y: point.y },
    force: { x: force.x, y: force.y }
  });
  target.set(body.id, vectors);
};

export const worldVelocityToMetersPerSecond = (velocity: Matter.Vector): Matter.Vector => ({
  x: velocity.x / WORLD_PIXELS_PER_METER / STEP_SECONDS,
  y: velocity.y / WORLD_PIXELS_PER_METER / STEP_SECONDS
});

export const calculateSpringDebugForce = (
  bodyA: Matter.Body,
  bodyB: Matter.Body,
  pointA: Matter.Vector,
  pointB: Matter.Vector,
  config: { naturalLength: number; springConstant: number; dampingRatio: number },
  getWorldPoint: (body: Matter.Body, localPoint: Matter.Vector) => Matter.Vector
) => {
  const start = getWorldPoint(bodyA, pointA);
  const end = getWorldPoint(bodyB, pointB);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthWorld = Math.hypot(dx, dy);
  if (lengthWorld < 0.001) return null;

  const dirX = dx / lengthWorld;
  const dirY = dy / lengthWorld;
  const extensionMeters = (lengthWorld - config.naturalLength) / WORLD_PIXELS_PER_METER;
  const relVelocityWorld = {
    x: bodyB.velocity.x - bodyA.velocity.x,
    y: bodyB.velocity.y - bodyA.velocity.y
  };
  const relVelocityMps =
    ((relVelocityWorld.x * dirX + relVelocityWorld.y * dirY) / WORLD_PIXELS_PER_METER) / STEP_SECONDS;

  const massA = bodyA.isStatic ? Infinity : bodyA.mass;
  const massB = bodyB.isStatic ? Infinity : bodyB.mass;
  const effectiveMass =
    Number.isFinite(massA) && Number.isFinite(massB)
      ? (massA * massB) / (massA + massB)
      : Number.isFinite(massA) ? massA : Number.isFinite(massB) ? massB : 0;
  const dampingCoefficient = effectiveMass > 0
    ? config.dampingRatio * 2 * Math.sqrt(config.springConstant * effectiveMass)
    : 0;

  const forceNewtons = config.springConstant * extensionMeters + dampingCoefficient * relVelocityMps;
  return {
    start,
    end,
    forceOnA: { x: forceNewtons * dirX, y: forceNewtons * dirY },
    forceOnB: { x: -forceNewtons * dirX, y: -forceNewtons * dirY }
  };
};

const isInfrastructureBody = (body: Matter.Body) => {
  const label = (body.label || '').toLowerCase();
  return label.includes('ground') || label === 'mouse constraint';
};

const formatMagnitude = (value: number, unit: string) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value.toExponential(2)} ${unit}`;
  if (abs >= 10) return `${value.toFixed(1)} ${unit}`;
  return `${value.toFixed(2)} ${unit}`;
};

const getLaneOffset = (laneIndex: number) =>
  laneIndex === 0 ? 0 : ((laneIndex % 2 === 0 ? -1 : 1) * Math.ceil(laneIndex / 2) * 8);

const drawLabel = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) => {
  ctx.font = '12px Arial';
  ctx.textBaseline = 'middle';

  const paddingX = 4;
  const paddingY = 2;
  const metrics = ctx.measureText(text);
  const height = 14;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fillRect(x - paddingX, y - height / 2 - paddingY, metrics.width + paddingX * 2, height + paddingY * 2);

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
};

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  start: Matter.Vector,
  direction: Matter.Vector,
  magnitude: number,
  label: string,
  color: string,
  pixelsPerUnit: number,
  options: {
    originLaneIndex?: number;
    labelLaneIndex?: number;
    lineWidth?: number;
    alpha?: number;
    dashed?: boolean;
  } = {}
) => {
  if (!Number.isFinite(magnitude) || magnitude < VECTOR_EPSILON) return;

  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength < VECTOR_EPSILON) return;

  const unitX = direction.x / directionLength;
  const unitY = direction.y / directionLength;
  const normalX = -unitY;
  const normalY = unitX;
  const laneOffset = getLaneOffset(options.originLaneIndex ?? 0);
  const origin = {
    x: start.x + normalX * laneOffset,
    y: start.y + normalY * laneOffset
  };
  const length = Math.max(MIN_ARROW_LENGTH, Math.min(MAX_ARROW_LENGTH, magnitude * pixelsPerUnit));
  const end = {
    x: origin.x + unitX * length,
    y: origin.y + unitY * length
  };
  const headSize = 7;
  const angle = Math.atan2(unitY, unitX);

  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = options.lineWidth ?? 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (options.dashed) ctx.setLineDash([7, 5]);

  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - Math.cos(angle - Math.PI / 6) * headSize, end.y - Math.sin(angle - Math.PI / 6) * headSize);
  ctx.lineTo(end.x - Math.cos(angle + Math.PI / 6) * headSize, end.y - Math.sin(angle + Math.PI / 6) * headSize);
  ctx.closePath();
  ctx.fill();

  const labelLaneOffset = getLaneOffset(options.labelLaneIndex ?? 0);
  const textX = end.x + unitX * 6 + normalX * (6 + labelLaneOffset);
  const textY = end.y + unitY * 6 + normalY * (6 + labelLaneOffset);
  drawLabel(ctx, label, textX, textY, color);
  ctx.restore();
};

const getDisplayForceVectors = (
  body: Matter.Body,
  wasDynamicBeforePause: boolean,
  gravityMps2: number,
  externalForces: DebugForceVectorMap,
  internalForces: DebugForceVectorMap,
  getBodyMass: (body: Matter.Body) => number
) => {
  const forceVectors: DebugForceVector[] = [];

  if (!body.isStatic || wasDynamicBeforePause) {
    const mass = getBodyMass(body);
    if (Math.abs(gravityMps2) > VECTOR_EPSILON && Number.isFinite(mass)) {
      forceVectors.push({
        bodyId: body.id,
        name: 'Gravity',
        category: 'external',
        point: { x: body.position.x, y: body.position.y },
        force: { x: 0, y: mass * gravityMps2 }
      });
    }
  }

  forceVectors.push(...(externalForces.get(body.id) ?? []));
  forceVectors.push(...(internalForces.get(body.id) ?? []));

  return forceVectors;
};

const sumForces = (forceVectors: DebugForceVector[]): Matter.Vector =>
  forceVectors.reduce(
    (total, forceVector) => ({
      x: total.x + forceVector.force.x,
      y: total.y + forceVector.force.y
    }),
    { x: 0, y: 0 }
  );

const getForceMagnitude = (forceVector: DebugForceVector) =>
  Math.hypot(forceVector.force.x, forceVector.force.y);

const getForceNoiseThreshold = (forceVectors: DebugForceVector[]) => {
  const totalMagnitude = forceVectors.reduce((total, forceVector) => total + getForceMagnitude(forceVector), 0);
  return Math.min(
    FORCE_NOISE_MAX_NEWTONS,
    Math.max(FORCE_NOISE_FLOOR_NEWTONS, totalMagnitude * FORCE_NOISE_RELATIVE_RATIO)
  );
};

const getNetForceVectors = (forceVectors: DebugForceVector[]) => {
  const threshold = getForceNoiseThreshold(forceVectors);
  const hasSupportNormal = forceVectors.some((forceVector) => forceVector.name === 'Normal');

  return forceVectors.filter((forceVector) => {
    if (forceVector.name !== 'Contact') return true;
    if (!hasSupportNormal) return getForceMagnitude(forceVector) > FORCE_NOISE_FLOOR_NEWTONS;
    return getForceMagnitude(forceVector) > threshold;
  });
};

const shouldDrawNetForce = (forceVectors: DebugForceVector[], netForceMagnitude: number) => {
  if (netForceMagnitude <= VECTOR_EPSILON) return false;
  const hasOnlyPassiveSupportForces = forceVectors.every((forceVector) =>
    PASSIVE_SUPPORT_FORCE_NAMES.has(forceVector.name)
  );

  return !hasOnlyPassiveSupportForces || netForceMagnitude > getForceNoiseThreshold(forceVectors);
};

export const drawDebugVectorOverlays = (
  ctx: CanvasRenderingContext2D,
  options: DrawVectorOverlayOptions
) => {
  const {
    showVelocityComponents,
    showForceBreakdown,
    bodies,
    externalForces,
    internalForces,
    pausedVelocityByBodyId,
    pausedDynamicKeys,
    gravityMps2,
    getBodyKey,
    getBodyMass
  } = options;

  bodies.forEach((body) => {
    if (isInfrastructureBody(body)) return;

    const wasDynamicBeforePause = pausedDynamicKeys.has(getBodyKey(body));
    const velocity = body.isStatic && wasDynamicBeforePause
      ? pausedVelocityByBodyId.get(body.id) ?? body.velocity
      : body.velocity;
    const velocityMps = worldVelocityToMetersPerSecond(velocity);
    const speedMps = Math.hypot(velocityMps.x, velocityMps.y);

    if (speedMps > VECTOR_EPSILON) {
      drawArrow(
        ctx,
        body.position,
        velocityMps,
        speedMps,
        `v = ${formatMagnitude(speedMps, 'm/s')}`,
        NET_VELOCITY_COLOR,
        VELOCITY_PIXELS_PER_MPS,
        {
          labelLaneIndex: 0,
          lineWidth: 3.5,
          alpha: 0.82
        }
      );
    }

    if (showVelocityComponents) {
      const vxMagnitude = Math.abs(velocityMps.x);
      const vyMagnitude = Math.abs(velocityMps.y);

      if (vxMagnitude > VECTOR_EPSILON) {
        drawArrow(
          ctx,
          body.position,
          { x: velocityMps.x, y: 0 },
          vxMagnitude,
          `vx = ${formatMagnitude(velocityMps.x, 'm/s')}`,
          VELOCITY_COMPONENT_COLOR,
          VELOCITY_PIXELS_PER_MPS,
          {
            labelLaneIndex: 2,
            lineWidth: 1.5,
            alpha: 0.7,
            dashed: true
          }
        );
      }

      if (vyMagnitude > VECTOR_EPSILON) {
        drawArrow(
          ctx,
          body.position,
          { x: 0, y: velocityMps.y },
          vyMagnitude,
          `vy = ${formatMagnitude(velocityMps.y, 'm/s')}`,
          VELOCITY_COMPONENT_COLOR,
          VELOCITY_PIXELS_PER_MPS,
          {
            labelLaneIndex: 3,
            lineWidth: 1.5,
            alpha: 0.7,
            dashed: true
          }
        );
      }
    }

    const forceVectors = getDisplayForceVectors(
      body,
      wasDynamicBeforePause,
      gravityMps2,
      externalForces,
      internalForces,
      getBodyMass
    );
    const netForceVectors = getNetForceVectors(forceVectors);
    const netForce = sumForces(netForceVectors);
    const netForceMagnitude = Math.hypot(netForce.x, netForce.y);

    if (shouldDrawNetForce(netForceVectors, netForceMagnitude)) {
      drawArrow(
        ctx,
        body.position,
        netForce,
        netForceMagnitude,
        `F = ${formatMagnitude(netForceMagnitude, 'N')}`,
        NET_FORCE_COLOR,
        FORCE_PIXELS_PER_NEWTON,
        {
          labelLaneIndex: 1,
          lineWidth: 2.5
        }
      );
    }

    if (showForceBreakdown) {
      netForceVectors.forEach((forceVector, index) => {
        const magnitude = Math.hypot(forceVector.force.x, forceVector.force.y);
        drawArrow(
          ctx,
          forceVector.point,
          forceVector.force,
          magnitude,
          `${forceVector.name}: ${formatMagnitude(magnitude, 'N')}`,
          forceVector.category === 'external' ? EXTERNAL_FORCE_COLOR : INTERNAL_FORCE_COLOR,
          FORCE_PIXELS_PER_NEWTON,
          {
            originLaneIndex: index + 1,
            labelLaneIndex: index + 2,
            lineWidth: 1.5,
            alpha: 0.75
          }
        );
      });
    }
  });
};
