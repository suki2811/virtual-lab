import Matter from 'matter-js';
import { PhysicsConstraint } from '../../types/physics';

export interface SpringState {
  naturalLength: number;
  springConstant: number;
  dampingRatio: number;
}

const isPivotAnchor = (body: Matter.Body) => {
  const label = body.label.toLowerCase();
  return label.includes('pivot') || label.includes('anchor');
};

const getBodySize = (body: Matter.Body) => ({
  width: body.bounds.max.x - body.bounds.min.x,
  height: body.bounds.max.y - body.bounds.min.y
});

const rotateVector = (vector: Matter.Vector, angle: number): Matter.Vector => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
};

const _getEdgeAttachmentPoint = (body: Matter.Body, towardBody: Matter.Body): Matter.Vector => {
  if (isPivotAnchor(body)) {
    return { x: 0, y: 0 };
  }

  const worldDirection = {
    x: towardBody.position.x - body.position.x,
    y: towardBody.position.y - body.position.y
  };
  const distance = Math.hypot(worldDirection.x, worldDirection.y);
  if (distance < 0.001) {
    return { x: 0, y: 0 };
  }

  const localDirection = rotateVector(
    { x: worldDirection.x / distance, y: worldDirection.y / distance },
    -body.angle
  );

  const radius = body.circleRadius;
  if (radius && radius > 0) {
    return {
      x: localDirection.x * radius,
      y: localDirection.y * radius
    };
  }

  const width = body.bounds.max.x - body.bounds.min.x;
  const height = body.bounds.max.y - body.bounds.min.y;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const tx = Math.abs(localDirection.x) > 0.001 ? halfWidth / Math.abs(localDirection.x) : Infinity;
  const ty = Math.abs(localDirection.y) > 0.001 ? halfHeight / Math.abs(localDirection.y) : Infinity;
  const scale = Math.min(tx, ty);

  if (!Number.isFinite(scale)) {
    return { x: 0, y: 0 };
  }

  return {
    x: localDirection.x * scale,
    y: localDirection.y * scale
  };
};

const getTopAttachmentPoint = (body: Matter.Body): Matter.Vector => {
  if (isPivotAnchor(body)) {
    return { x: 0, y: 0 };
  }

  const { width, height } = getBodySize(body);
  const radius = body.circleRadius;

  if (radius && radius > 0) {
    return { x: 0, y: -radius };
  }

  if (Math.abs(width - height) < 2) {
    return { x: 0, y: -height * 0.5 };
  }

  return { x: 0, y: -height * 0.5 };
};

const getWorldPoint = (body: Matter.Body, localPoint: Matter.Vector): Matter.Vector => {
  const rotated = rotateVector(localPoint, body.angle);
  return {
    x: body.position.x + rotated.x,
    y: body.position.y + rotated.y
  };
};

const getAttachmentDistance = (
  bodyA: Matter.Body,
  pointA: Matter.Vector,
  bodyB: Matter.Body,
  pointB: Matter.Vector
) => {
  const worldA = getWorldPoint(bodyA, pointA);
  const worldB = getWorldPoint(bodyB, pointB);
  return Math.hypot(worldB.x - worldA.x, worldB.y - worldA.y);
};

export const createConstraint = (
  input: PhysicsConstraint,
  bodyA: Matter.Body,
  bodyB: Matter.Body
): { constraint: Matter.Constraint; spring?: SpringState } | null => {
  if (input.type === 'rope') {
    const pointA: Matter.Vector = input.pointA ?? { x: 0, y: 0 };
    const pointB: Matter.Vector = input.pointB ?? { x: 0, y: 0 };
    const attachmentLength = getAttachmentDistance(bodyA, pointA, bodyB, pointB);

    return {
      constraint: Matter.Constraint.create({
        bodyA,
        bodyB,
        pointA,
        pointB,
        length: input.length ?? attachmentLength,
        stiffness: input.stiffness ?? 1,
        damping: input.damping ?? 0,
        label: 'rope',
        render: { visible: false, type: 'line', strokeStyle: '#000000', lineWidth: 2, anchors: false }
      })
    };
  }

  if (input.type === 'spring') {
    const pointA: Matter.Vector = input.pointA ?? { x: 0, y: 0 };
    const pointB: Matter.Vector = input.pointB ?? { x: 0, y: 0 };
    const attachmentLength = getAttachmentDistance(bodyA, pointA, bodyB, pointB);
    const naturalLength = input.naturalLength ?? input.length ?? attachmentLength;
    const springConstant = input.springConstant ?? 40;
    const dampingRatio = Math.max(input.damping ?? 0, 0);

    return {
      constraint: Matter.Constraint.create({
        bodyA,
        bodyB,
        pointA,
        pointB,
        length: naturalLength,
        stiffness: 0,
        damping: 0,
        render: { visible: false, type: 'spring', strokeStyle: '#000000', lineWidth: 2, anchors: false }
      }),
      spring: { naturalLength, springConstant, dampingRatio }
    };
  }

  if (input.type === 'pivot') {
    const pivotOnA = isPivotAnchor(bodyA);
    const pivotOnB = isPivotAnchor(bodyB);

    // Ensure one side is pivot anchor when possible.
    const anchorBody = pivotOnA ? bodyA : pivotOnB ? bodyB : bodyA;
    const targetBody = pivotOnA ? bodyB : pivotOnB ? bodyA : bodyB;

    const pointA: Matter.Vector = { x: 0, y: 0 };
    const pointB: Matter.Vector = input.pointB ?? getTopAttachmentPoint(targetBody);

    return {
      constraint: Matter.Constraint.create({
        bodyA: anchorBody,
        bodyB: targetBody,
        pointA,
        pointB,
        length: 0,
        stiffness: 0.98,
        damping: 0.05,
        render: { visible: false, type: 'line', strokeStyle: '#000000', lineWidth: 2, anchors: false }
      })
    };
  }

  return null;
};
