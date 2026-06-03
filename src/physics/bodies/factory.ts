import Matter from 'matter-js';
import { PhysicsObject } from '../../types/physics';
import {
  DEFAULT_BODY_FRICTION,
  DEFAULT_BODY_MASS_KG,
  DEFAULT_BODY_RESTITUTION,
  MATERIALS,
  KG_M2_TO_MATTER_DENSITY
} from '../constants';

/**
 * Creates a Matter.js body with properties derived from physical laws and materials.
 */
export const createRigidBody = (obj: PhysicsObject): Matter.Body | null => {
  const material = MATERIALS.WOOD; // Default material

  const base: Matter.IBodyDefinition = {
    label: obj.label ?? obj.id,
    isStatic: !!obj.isStatic,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0,
    restitution: 0,
    density: material.density * KG_M2_TO_MATTER_DENSITY,
    slop: 0.05
  } as Matter.IChamferableBodyDefinition;

  let body: Matter.Body | null = null;

  if (obj.type === 'box') {
    body = Matter.Bodies.rectangle(obj.x, obj.y, obj.width ?? 80, obj.height ?? 80, base as Matter.IChamferableBodyDefinition);
  } else if (obj.type === 'circle') {
    body = Matter.Bodies.circle(obj.x, obj.y, obj.radius ?? 40, base as Matter.IChamferableBodyDefinition);
  } else if (obj.type === 'ground') {
    body = Matter.Bodies.rectangle(obj.x, obj.y, obj.width ?? 1200, obj.height ?? 80, {
      ...base,
      isStatic: true,
      friction: 0,
      frictionStatic: 0,
      restitution: 0
    } as Matter.IChamferableBodyDefinition);
  }

  if (body) {
    (body as any).physicalFriction = Number.isFinite(obj.friction) ? obj.friction : DEFAULT_BODY_FRICTION;
    (body as any).physicalRestitution = Number.isFinite(obj.restitution) ? obj.restitution : DEFAULT_BODY_RESTITUTION;
    if (!body.isStatic) {
      Matter.Body.setMass(
        body,
        Number.isFinite(obj.mass) && (obj.mass ?? 0) > 0 ? obj.mass ?? DEFAULT_BODY_MASS_KG : DEFAULT_BODY_MASS_KG
      );
    }
  }

  if (body && obj.placementState === 'preview') {
    body.isSensor = true;
    (body as any).opacity = 0.5;
  }

  return body;
};

/**
 * Updates a body's mass in KG, automatically adjusting Matter.js density.
 */
export const applyMassKg = (body: Matter.Body, massKg: number) => {
  if (body.isStatic) return;
  
  // In Matter, Mass = Area * Density.
  // We want to set the mass directly but keep it consistent with the physical area.
  Matter.Body.setMass(body, massKg);
};
