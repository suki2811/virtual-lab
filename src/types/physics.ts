export type PlacementState = 'preview' | 'dragging' | 'fixed';

export interface PhysicsObject {
  id: string;
  type: 'box' | 'circle' | 'ground' | 'polygon';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  isStatic?: boolean;
  color?: string;
  label?: string;
  placementState?: PlacementState;
  angle?: number;
  velocity?: { x: number; y: number };
  angularVelocity?: number;
  mass?: number;
  friction?: number;
  restitution?: number;
}

export interface PhysicsConstraint {
  id: string;
  type: 'rope' | 'spring' | 'pivot' | 'motor';
  bodyA: string;
  bodyB: string;
  pointA?: { x: number; y: number };
  pointB?: { x: number; y: number };
  stiffness?: number;
  damping?: number;
  length?: number;
  speed?: number;
  naturalLength?: number;
  springConstant?: number;
  maxTension?: number;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  objects: PhysicsObject[];
  constraints: PhysicsConstraint[];
  createdAt: Date;
  thumbnail?: string;
}

export interface Room {
  id: string;
  name: string;
  users: string[];
  experiment: Experiment | null;
}

export interface AnalyticsData {
  time: number;
  velocity: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
}

export interface User {
  id: string;
  name: string;
  color: string;
}
