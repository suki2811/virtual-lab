import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { evaluatePhysicsExpression, lerp, lerpVector } from '../physics/utilities/math';
import { 
  applySpringForce, 
  calculateRopeTension,
  applyAirResistance, 
  degreesToUnitVector, 
  speedMpsToWorldVelocity,
  worldVelocityToMps
} from '../physics/utilities/forces';
import { PhysicsObject, PhysicsConstraint, Experiment } from '../types/physics';
import { BodyVelocitySeries, VelocityPlotData, VelocityPlotState } from '../types/velocityPlot';
import { createPhysicsEngine, setWorldGravity } from '../physics/engine';
import { createFixedStepLoop } from '../physics/world';
import { createRigidBody, applyMassKg } from '../physics/bodies/factory';
import { createConstraint } from '../physics/constraints/factory';
import { wireDebugEvents } from '../physics/debug';
import {
  addDebugForceVector,
  calculateSpringDebugForce,
  createDebugForceVectorMap,
  drawDebugVectorOverlays,
  DebugForceVectorMap
} from '../physics/vectorDebug';

import { 
  DEFAULT_BODY_MASS_KG,
  WORLD_PIXELS_PER_METER, 
  FIXED_TIMESTEP_MS,
  MATTER_BASE_TIMESTEP_MS,
  REAL_FORCE_TO_MATTER
} from '../physics/constants';

const STEP_SECONDS = FIXED_TIMESTEP_MS / 1000;
const MAX_FORCE_NEWTONS = 1_000_000;
const MAX_SPEED_MPS = 1_000;
const ROPE_LENGTH_SLOP_PX = 0.25;
const ROPE_CORRECTION_RATIO = 0.9;
const MAX_ROPE_CORRECTION_PX = 12;
const HORIZONTAL_CONTACT_NORMAL_Y = 0.55;
const RESTITUTION_MIN_CLOSING_SPEED = 0.02;
const SPRING_REST_SPEED_MPS = 0.012;
const SPRING_REST_ACCEL_MPS2 = 0.08;
const MAX_UNDO_SNAPSHOTS = 80;
const MAX_REPLAY_SNAPSHOTS = 600;
const MAX_VELOCITY_SAMPLES_PER_BODY = 60000;
const VELOCITY_SAMPLE_TRIM_BATCH = 1000;

type VariableMode = 't' | 'x' | 'x_t';
type ForceType = 'constant' | 'timed' | 'variable' | 'instantaneous';
type VelocityType = 'constant' | 'initial' | 'variable';

export interface EnvironmentPhysicsConfig {
  neglectAirResistance: boolean;
  dragCoefficient: number;
  airDensity: number;
}

export interface ForceConfig {
  enabled: boolean;
  type: ForceType;
  magnitude: number;
  angleDeg: number;
  startTime: number;
  endTime: number;
  variableMode: VariableMode;
  expression: string;
}

export interface VelocityConfig {
  enabled: boolean;
  type: VelocityType;
  speed: number;
  angleDeg: number;
  variableMode: VariableMode;
  expression: string;
}

const defaultEnvironmentPhysics: EnvironmentPhysicsConfig = {
  neglectAirResistance: true,
  dragCoefficient: 0.47,
  airDensity: 1.225
};

const defaultForceConfig: ForceConfig = {
  enabled: false,
  type: 'constant',
  magnitude: 0,
  angleDeg: 0,
  startTime: 0,
  endTime: 1,
  variableMode: 't',
  expression: '0'
};

const defaultVelocityConfig: VelocityConfig = {
  enabled: false,
  type: 'initial',
  speed: 0,
  angleDeg: 0,
  variableMode: 't',
  expression: '0'
};

const clampFinite = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
};

const getWorldConstraintPoint = (body: Matter.Body, localPoint: Matter.Vector) => {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return {
    x: body.position.x + localPoint.x * cos - localPoint.y * sin,
    y: body.position.y + localPoint.x * sin + localPoint.y * cos
  };
};

interface PreviewObject {
  id: string;
  body: Matter.Body;
  type: 'box' | 'circle' | 'ground' | 'polygon';
  originalProps: PhysicsObject;
}

export interface RemoteUpdate {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
}

type SnapshotBodyType = 'box' | 'circle' | 'ground' | 'polygon';

interface BodySnapshot {
  id: string;
  type: SnapshotBodyType;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  angle: number;
  velocity: Matter.Vector;
  angularVelocity: number;
  isStatic: boolean;
  mass: number;
  color?: string;
  physicalFriction: number;
  physicalRestitution: number;
}

interface ConstraintSnapshot {
  id: string;
  type: 'rope' | 'spring' | 'pivot';
  bodyAId: string;
  bodyBId: string;
  pointA: Matter.Vector;
  pointB: Matter.Vector;
  length: number;
  stiffness: number;
  damping: number;
  maxTension?: number;
  restLength?: number;
  springConstant?: number;
  dampingRatio?: number;
}

interface WorldSnapshot {
  bodies: BodySnapshot[];
  constraints: ConstraintSnapshot[];
  forceConfigs: Array<[string, ForceConfig]>;
  velocityConfigs: Array<[string, VelocityConfig]>;
  massOverrides: Array<[string, number]>;
  pausedDynamicKeys: string[];
  environmentPhysics: EnvironmentPhysicsConfig;
  selectedBody: string | null;
  selectedBodyLabel: string | null;
  selectedConstraintId: string | null;
  simulationTime: number;
}

interface ReplaySnapshot {
  time: number;
  bodies: Array<{
    id: string;
    position: Matter.Vector;
    velocity: Matter.Vector;
    angle: number;
    angularVelocity: number;
  }>;
}

interface MutableBodyVelocitySeries extends BodyVelocitySeries {
  lastVx?: number;
  lastVy?: number;
  lastTime?: number;
}

type DistancePlacementResult = {
  success: boolean;
  reason?:
    | 'Object would leave simulation bounds'
    | 'Object would overlap another object'
    | 'Object would intersect ground'
    | 'Invalid coordinates generated'
    | 'Placement constraint violation'
    | 'Cannot move restricted object';
};

type GroundPropertiesResult = {
  success: boolean;
  reason?:
    | 'Ground object not found'
    | 'Angle must be between 0 and 180 degrees'
    | 'Ground length must be greater than zero'
    | 'Ground geometry update failed';
};

export interface PhysicsOptions {
  onSyncState?: (updates: RemoteUpdate[]) => void;
}

export const usePhysics = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: PhysicsOptions = {}
) => {
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const loopRef = useRef<ReturnType<typeof createFixedStepLoop> | null>(null);
  const [bodies, setBodies] = useState<Map<string, Matter.Body>>(new Map());
  const [constraints, setConstraints] = useState<Map<string, Matter.Constraint>>(new Map());
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [selectedBodyLabel, setSelectedBodyLabel] = useState<string | null>(null);
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);
  const [previewObject, setPreviewObject] = useState<PreviewObject | null>(null);
  const mousePositionRef = useRef({ x: 400, y: 300 });
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const constraintsRef = useRef<Map<string, Matter.Constraint>>(new Map());
  const pausedDynamicLabelsRef = useRef<Set<string>>(new Set());
  const isPausedRef = useRef<boolean>(true);
  const gravityValueRef = useRef<number>(9.8);
  const springConfigRef = useRef<Map<string, { naturalLength: number; springConstant: number; dampingRatio: number }>>(new Map());
  const constraintConfigRef = useRef<Map<string, { maxTension?: number; tension: number; restLength?: number; stiffness?: number; type?: string }>>(new Map());
  const massOverridesRef = useRef<Map<string, number>>(new Map());
  const environmentPhysicsRef = useRef<EnvironmentPhysicsConfig>(defaultEnvironmentPhysics);
  const forceConfigRef = useRef<Map<string, ForceConfig>>(new Map());
  const velocityConfigRef = useRef<Map<string, VelocityConfig>>(new Map());
  const externalForceNewtonsRef = useRef<Map<number, { fx: number; fy: number }>>(new Map());
  const externalDebugForcesRef = useRef<DebugForceVectorMap>(new Map());
  const internalDebugForcesRef = useRef<DebugForceVectorMap>(new Map());
  const pausedDebugVelocityRef = useRef<Map<number, Matter.Vector>>(new Map());
  const previousVelocityRef = useRef<Map<number, Matter.Vector>>(new Map());
  const restitutionPairsRef = useRef<Array<{
    bodyA: Matter.Body;
    bodyB: Matter.Body;
    normal: Matter.Vector;
    restitution: number;
  }>>([]);
  const simulationTimeRef = useRef(0);
  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);
  const mouseConstraintEnabledRef = useRef(false);
  const repositionModeBodyIdRef = useRef<string | null>(null);
  const selectedBodyIdRef = useRef<string | null>(null);
  const distanceToolActiveRef = useRef(false);
  const distanceToolSelectionRef = useRef<{ referenceId: string | null; targetId: string | null }>({
    referenceId: null,
    targetId: null
  });
  const isRepositionDraggingRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickedBodyIdRef = useRef<string | null>(null);
  const remoteUpdatesRef = useRef<Map<string, RemoteUpdate>>(new Map());
  const undoStackRef = useRef<WorldSnapshot[]>([]);
  const redoStackRef = useRef<WorldSnapshot[]>([]);
  const replaySnapshotsRef = useRef<ReplaySnapshot[]>([]);
  const velocityPlotDataRef = useRef<Map<string, MutableBodyVelocitySeries>>(new Map());
  const velocityPlotStartedAtRef = useRef(0);
  const velocityPlotSampleCountRef = useRef(0);
  const isVelocityRecordingRef = useRef(false);
  const replayIndexRef = useRef(0);
  const suppressHistoryRef = useRef(false);
  const dragHistorySnapshotRef = useRef<WorldSnapshot | null>(null);
  const showAllVelocitiesRef = useRef(false);
  const showAllForcesRef = useRef(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [replayState, setReplayState] = useState({ index: 0, max: 0, time: 0 });
  const [velocityPlotState, setVelocityPlotState] = useState<VelocityPlotState>({
    hasData: false,
    isRecording: false,
    revision: 0,
    sampleCount: 0
  });
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [overlayState, setOverlayState] = useState({ showAllVelocities: false, showAllForces: false });
  const [, setPhysicsConfigRevision] = useState(0);

  const getBodyConfigKey = (body: Matter.Body) => String((body as any).appBodyId ?? body.label);

  const getBodySnapshotType = (body: Matter.Body): SnapshotBodyType => {
    const storedType = (body as any).appBodyType as SnapshotBodyType | undefined;
    if (storedType) return storedType;
    if (body.label.toLowerCase().includes('ground')) return 'ground';
    if (body.circleRadius && body.circleRadius > 0) return 'circle';
    return 'box';
  };

  const getFiniteBodyMass = (body: Matter.Body) => {
    const originalMass = (body as any)._original?.mass;
    if (Number.isFinite(body.mass)) return body.mass;
    if (Number.isFinite(originalMass)) return originalMass;
    return DEFAULT_BODY_MASS_KG;
  };

  const getPhysicalBodyProps = (body: Matter.Body) => ({
    friction: Number.isFinite((body as any).physicalFriction) ? (body as any).physicalFriction : body.friction,
    restitution: Number.isFinite((body as any).physicalRestitution) ? (body as any).physicalRestitution : body.restitution
  });

  const isInfrastructureBody = (body: Matter.Body) => {
    const label = body.label.toLowerCase();
    return label.includes('ground') || label.includes('anchor') || label.includes('pivot') || label === 'mouse constraint';
  };

  const isRestrictedPlacementTarget = (body: Matter.Body) => isInfrastructureBody(body);

  const cloneForceConfig = (config: ForceConfig): ForceConfig => ({ ...config });
  const cloneVelocityConfig = (config: VelocityConfig): VelocityConfig => ({ ...config });

  const captureWorldSnapshot = (): WorldSnapshot => {
    const bodiesSnapshot = Array.from(bodiesRef.current.entries()).map(([id, body]) => {
      const type = getBodySnapshotType(body);
      const physical = getPhysicalBodyProps(body);
      const storedWidth = (body as any).appBodyWidth;
      const storedHeight = (body as any).appBodyHeight;
      const storedRadius = (body as any).appBodyRadius;

      return {
        id,
        type,
        label: body.label,
        x: body.position.x,
        y: body.position.y,
        width: Number.isFinite(storedWidth) ? storedWidth : body.bounds.max.x - body.bounds.min.x,
        height: Number.isFinite(storedHeight) ? storedHeight : body.bounds.max.y - body.bounds.min.y,
        radius: Number.isFinite(storedRadius) ? storedRadius : body.circleRadius,
        angle: body.angle,
        velocity: { x: body.velocity.x, y: body.velocity.y },
        angularVelocity: body.angularVelocity,
        isStatic: body.isStatic,
        mass: getFiniteBodyMass(body),
        color: body.render?.fillStyle,
        physicalFriction: physical.friction,
        physicalRestitution: physical.restitution
      };
    });

    const constraintsSnapshot = Array.from(constraintsRef.current.entries()).flatMap(([id, constraint]) => {
      if (!constraint.bodyA || !constraint.bodyB) return [];
      const config = constraintConfigRef.current.get(id);
      const springConfig = springConfigRef.current.get(id);
      const type = constraint.length === 0 ? 'pivot' : constraint.render?.type === 'spring' ? 'spring' : 'rope';

      return [{
        id,
        type: type as 'rope' | 'spring' | 'pivot',
        bodyAId: getBodyConfigKey(constraint.bodyA),
        bodyBId: getBodyConfigKey(constraint.bodyB),
        pointA: { x: constraint.pointA.x, y: constraint.pointA.y },
        pointB: { x: constraint.pointB.x, y: constraint.pointB.y },
        length: constraint.length,
        stiffness: constraint.stiffness,
        damping: constraint.damping,
        maxTension: config?.maxTension,
        restLength: config?.restLength,
        springConstant: springConfig?.springConstant,
        dampingRatio: springConfig?.dampingRatio
      }];
    });

    return {
      bodies: bodiesSnapshot,
      constraints: constraintsSnapshot,
      forceConfigs: Array.from(forceConfigRef.current.entries()).map(([key, value]) => [key, cloneForceConfig(value)]),
      velocityConfigs: Array.from(velocityConfigRef.current.entries()).map(([key, value]) => [key, cloneVelocityConfig(value)]),
      massOverrides: Array.from(massOverridesRef.current.entries()),
      pausedDynamicKeys: Array.from(pausedDynamicLabelsRef.current),
      environmentPhysics: { ...environmentPhysicsRef.current },
      selectedBody,
      selectedBodyLabel,
      selectedConstraintId,
      simulationTime: simulationTimeRef.current
    };
  };

  const refreshHistoryState = () => {
    setHistoryState({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0
    });
  };

  const pushUndoSnapshot = () => {
    if (suppressHistoryRef.current || !engineRef.current) return;
    undoStackRef.current.push(captureWorldSnapshot());
    if (undoStackRef.current.length > MAX_UNDO_SNAPSHOTS) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    refreshHistoryState();
  };

  const createBodyFromSnapshot = (snapshot: BodySnapshot) => {
    const base: PhysicsObject = {
      id: snapshot.id,
      type: snapshot.type,
      x: snapshot.x,
      y: snapshot.y,
      width: snapshot.width,
      height: snapshot.height,
      radius: snapshot.radius,
      isStatic: false,
      color: snapshot.color,
      label: snapshot.label
    };
    const body = createRigidBody(base);
    if (!body) return null;

    (body as any).appBodyId = snapshot.id;
    (body as any).appBodyType = snapshot.type;
    (body as any).appBodyWidth = snapshot.width;
    (body as any).appBodyHeight = snapshot.height;
    (body as any).appBodyRadius = snapshot.radius;
    (body as any).physicalFriction = snapshot.physicalFriction;
    (body as any).physicalRestitution = snapshot.physicalRestitution;
    body.render.fillStyle = snapshot.color || body.render.fillStyle;

    Matter.Body.setPosition(body, { x: snapshot.x, y: snapshot.y });
    Matter.Body.setAngle(body, snapshot.angle);
    if (Number.isFinite(snapshot.mass) && snapshot.mass > 0 && snapshot.type !== 'ground') {
      Matter.Body.setMass(body, snapshot.mass);
    }
    Matter.Body.setVelocity(body, snapshot.velocity);
    Matter.Body.setAngularVelocity(body, snapshot.angularVelocity);
    if (snapshot.isStatic) {
      Matter.Body.setStatic(body, true);
    }

    return body;
  };

  const applyWorldSnapshot = (snapshot: WorldSnapshot) => {
    const engine = engineRef.current;
    if (!engine) return;

    suppressHistoryRef.current = true;

    Matter.Composite.allConstraints(engine.world).forEach((constraint) => {
      if (constraint.label !== 'Mouse Constraint') {
        Matter.Composite.remove(engine.world, constraint);
      }
    });
    Matter.Composite.allBodies(engine.world).forEach((body) => {
      Matter.Composite.remove(engine.world, body);
    });

    const restoredBodies = new Map<string, Matter.Body>();
    snapshot.bodies.forEach((bodySnapshot) => {
      const body = createBodyFromSnapshot(bodySnapshot);
      if (!body) return;
      restoredBodies.set(bodySnapshot.id, body);
      Matter.Composite.add(engine.world, body);
    });

    const restoredConstraints = new Map<string, Matter.Constraint>();
    springConfigRef.current.clear();
    constraintConfigRef.current.clear();

    snapshot.constraints.forEach((constraintSnapshot) => {
      const bodyA = restoredBodies.get(constraintSnapshot.bodyAId);
      const bodyB = restoredBodies.get(constraintSnapshot.bodyBId);
      if (!bodyA || !bodyB) return;

      const created = createConstraint({
        id: constraintSnapshot.id,
        type: constraintSnapshot.type,
        bodyA: bodyA.label,
        bodyB: bodyB.label,
        pointA: constraintSnapshot.pointA,
        pointB: constraintSnapshot.pointB,
        length: constraintSnapshot.length,
        stiffness: constraintSnapshot.stiffness,
        damping: constraintSnapshot.damping,
        naturalLength: constraintSnapshot.length,
        springConstant: constraintSnapshot.springConstant,
        maxTension: constraintSnapshot.maxTension
      }, bodyA, bodyB);

      if (!created) return;
      const matterConstraint = created.constraint;
      matterConstraint.length = constraintSnapshot.length;
      matterConstraint.stiffness = constraintSnapshot.type === 'rope' ? 0 : constraintSnapshot.stiffness;
      matterConstraint.damping = constraintSnapshot.damping;

      restoredConstraints.set(constraintSnapshot.id, matterConstraint);
      Matter.Composite.add(engine.world, matterConstraint);

      if (constraintSnapshot.type === 'spring') {
        springConfigRef.current.set(constraintSnapshot.id, {
          naturalLength: constraintSnapshot.length,
          springConstant: constraintSnapshot.springConstant ?? 40,
          dampingRatio: constraintSnapshot.dampingRatio ?? 0
        });
      }

      constraintConfigRef.current.set(constraintSnapshot.id, {
        maxTension: constraintSnapshot.maxTension,
        tension: 0,
        restLength: constraintSnapshot.restLength ?? constraintSnapshot.length,
        stiffness: constraintSnapshot.type === 'rope' ? 0.7 : constraintSnapshot.stiffness,
        type: constraintSnapshot.type
      });
    });

    bodiesRef.current = restoredBodies;
    constraintsRef.current = restoredConstraints;
    forceConfigRef.current = new Map(snapshot.forceConfigs.map(([key, value]) => [key, cloneForceConfig(value)]));
    velocityConfigRef.current = new Map(snapshot.velocityConfigs.map(([key, value]) => [key, cloneVelocityConfig(value)]));
    massOverridesRef.current = new Map(snapshot.massOverrides);
    pausedDynamicLabelsRef.current = new Set(snapshot.pausedDynamicKeys);
    environmentPhysicsRef.current = { ...snapshot.environmentPhysics };
    externalForceNewtonsRef.current.clear();
    externalDebugForcesRef.current.clear();
    internalDebugForcesRef.current.clear();
    pausedDebugVelocityRef.current.clear();
    previousVelocityRef.current.clear();
    restitutionPairsRef.current = [];
    simulationTimeRef.current = snapshot.simulationTime;
    remoteUpdatesRef.current.clear();

    setBodies(restoredBodies);
    setConstraints(restoredConstraints);
    setSelectedBody(snapshot.selectedBody);
    setSelectedBodyLabel(snapshot.selectedBodyLabel);
    setSelectedConstraintId(snapshot.selectedConstraintId);
    setPhysicsConfigRevision((value) => value + 1);

    suppressHistoryRef.current = false;
  };

  const undo = () => {
    if (undoStackRef.current.length === 0) return;
    const current = captureWorldSnapshot();
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(current);
    applyWorldSnapshot(previous);
    refreshHistoryState();
  };

  const redo = () => {
    if (redoStackRef.current.length === 0) return;
    const current = captureWorldSnapshot();
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(current);
    applyWorldSnapshot(next);
    refreshHistoryState();
  };

  const refreshReplayState = () => {
    const max = Math.max(0, replaySnapshotsRef.current.length - 1);
    const index = Math.min(replayIndexRef.current, max);
    const snapshot = replaySnapshotsRef.current[index];
    setReplayState({
      index,
      max,
      time: snapshot?.time ?? simulationTimeRef.current
    });
  };

  const clearVelocityRecordingData = () => {
    velocityPlotDataRef.current.clear();
    velocityPlotStartedAtRef.current = simulationTimeRef.current;
    velocityPlotSampleCountRef.current = 0;
    isVelocityRecordingRef.current = false;
    setVelocityPlotState((prev) => ({
      hasData: false,
      isRecording: false,
      revision: prev.revision + 1,
      sampleCount: 0
    }));
  };

  const beginVelocityRecording = () => {
    velocityPlotDataRef.current.clear();
    velocityPlotStartedAtRef.current = simulationTimeRef.current;
    velocityPlotSampleCountRef.current = 0;
    isVelocityRecordingRef.current = true;
    setVelocityPlotState((prev) => ({
      hasData: false,
      isRecording: true,
      revision: prev.revision + 1,
      sampleCount: 0
    }));
  };

  const finishVelocityRecording = () => {
    isVelocityRecordingRef.current = false;
    const sampleCount = velocityPlotSampleCountRef.current;
    setVelocityPlotState((prev) => ({
      hasData: sampleCount > 0,
      isRecording: false,
      revision: prev.revision + 1,
      sampleCount
    }));
  };

  const recordVelocitySamples = (time: number) => {
    if (!isVelocityRecordingRef.current || !engineRef.current) return;

    const bodySamples = velocityPlotDataRef.current;
    let recordedThisStep = 0;

    Matter.Composite.allBodies(engineRef.current.world).forEach((body) => {
      if (body.label === 'Mouse Constraint') return;

      const id = getBodyConfigKey(body);
      const velocityMps = worldVelocityToMps(body.velocity);
      const existing = bodySamples.get(id);
      const dt = existing?.lastTime !== undefined
        ? Math.max(1e-9, time - existing.lastTime)
        : STEP_SECONDS;
      const ax = existing?.lastVx !== undefined ? (velocityMps.x - existing.lastVx) / dt : 0;
      const ay = existing?.lastVy !== undefined ? (velocityMps.y - existing.lastVy) / dt : 0;
      const series = existing ?? {
        id,
        label: body.label || id,
        samples: []
      };

      series.label = body.label || id;
      series.samples.push({
        time,
        velocity: Math.hypot(velocityMps.x, velocityMps.y),
        vx: velocityMps.x,
        vy: velocityMps.y,
        angularVelocity: body.angularVelocity / STEP_SECONDS,
        ax,
        ay,
        acceleration: Math.hypot(ax, ay)
      });
      series.lastVx = velocityMps.x;
      series.lastVy = velocityMps.y;
      series.lastTime = time;

      if (series.samples.length > MAX_VELOCITY_SAMPLES_PER_BODY) {
        series.samples.splice(0, VELOCITY_SAMPLE_TRIM_BATCH);
      }

      bodySamples.set(id, series);
      recordedThisStep += 1;
    });

    velocityPlotSampleCountRef.current += recordedThisStep;
  };

  const getVelocityPlotData = (): VelocityPlotData => {
    const bodies = Array.from(velocityPlotDataRef.current.values())
      .map(({ id, label, samples }) => ({
        id,
        label,
        samples: samples.map((sample) => ({ ...sample }))
      }))
      .filter((series) => series.samples.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));

    const endedAt = bodies.reduce((latest, series) => {
      const last = series.samples[series.samples.length - 1];
      return last ? Math.max(latest, last.time) : latest;
    }, velocityPlotStartedAtRef.current);

    return {
      startedAt: velocityPlotStartedAtRef.current,
      endedAt,
      sampleInterval: STEP_SECONDS,
      totalSamples: velocityPlotSampleCountRef.current,
      bodies
    };
  };

  const recordReplaySnapshot = () => {
    if (isPausedRef.current || replayIndexRef.current < replaySnapshotsRef.current.length - 1) return;

    replaySnapshotsRef.current.push({
      time: simulationTimeRef.current,
      bodies: Array.from(bodiesRef.current.entries()).map(([id, body]) => ({
        id,
        position: { x: body.position.x, y: body.position.y },
        velocity: { x: body.velocity.x, y: body.velocity.y },
        angle: body.angle,
        angularVelocity: body.angularVelocity
      }))
    });

    if (replaySnapshotsRef.current.length > MAX_REPLAY_SNAPSHOTS) {
      replaySnapshotsRef.current.shift();
    }

    replayIndexRef.current = Math.max(0, replaySnapshotsRef.current.length - 1);
    refreshReplayState();
  };

  const applyReplaySnapshot = (index: number) => {
    const snapshot = replaySnapshotsRef.current[index];
    if (!snapshot) return;

    snapshot.bodies.forEach((bodySnapshot) => {
      const body = bodiesRef.current.get(bodySnapshot.id);
      if (!body) return;

      const wasStatic = body.isStatic;
      if (wasStatic) {
        Matter.Body.setStatic(body, false);
      }
      Matter.Body.setPosition(body, bodySnapshot.position);
      Matter.Body.setVelocity(body, bodySnapshot.velocity);
      Matter.Body.setAngle(body, bodySnapshot.angle);
      Matter.Body.setAngularVelocity(body, bodySnapshot.angularVelocity);
      pausedDebugVelocityRef.current.set(body.id, { x: bodySnapshot.velocity.x, y: bodySnapshot.velocity.y });
      if (wasStatic) {
        Matter.Body.setStatic(body, true);
      }
    });
  };

  const setReplayIndex = (index: number) => {
    const max = Math.max(0, replaySnapshotsRef.current.length - 1);
    const nextIndex = Math.max(0, Math.min(max, Math.round(index)));
    replayIndexRef.current = nextIndex;
    applyReplaySnapshot(nextIndex);
    refreshReplayState();
  };

  const setPlaybackSpeed = (speed: number) => {
    const nextSpeed = Math.max(0.25, Math.min(2, Number.isFinite(speed) ? speed : 1));
    setPlaybackSpeedState(nextSpeed);
    loopRef.current?.setSpeed(nextSpeed);
  };

  const setShowAllVelocities = (value: boolean) => {
    showAllVelocitiesRef.current = value;
    setOverlayState((prev) => ({ ...prev, showAllVelocities: value }));
  };

  const setShowAllForces = (value: boolean) => {
    showAllForcesRef.current = value;
    setOverlayState((prev) => ({ ...prev, showAllForces: value }));
  };

  useEffect(() => {
    bodiesRef.current = bodies;
  }, [bodies]);

  useEffect(() => {
    constraintsRef.current = constraints;
  }, [constraints]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    // Guard against 0x0 canvas (e.g. during React StrictMode cleanup/remount)
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      console.warn('⚠️ Canvas has 0 dimensions, deferring init');
      return;
    }

    // Create engine with proper settings
    const engine = createPhysicsEngine({ gravityScale: 1 });
    engineRef.current = engine;

    const addExternalForceNewtons = (
      forceMap: Map<number, { fx: number; fy: number }>,
      body: Matter.Body,
      fx: number,
      fy: number
    ) => {
      if (body.isStatic || (!Number.isFinite(fx) && !Number.isFinite(fy))) return;
      const current = forceMap.get(body.id) ?? { fx: 0, fy: 0 };
      current.fx += Number.isFinite(fx) ? fx : 0;
      current.fy += Number.isFinite(fy) ? fy : 0;
      forceMap.set(body.id, current);
    };

    const getExternalAccelerationMps2 = (body: Matter.Body): Matter.Vector => {
      if (body.isStatic) return { x: 0, y: 0 };
      const force = externalForceNewtonsRef.current.get(body.id) ?? { fx: 0, fy: 0 };
      const mass = Math.max(body.mass, 1e-12);
      return {
        x: force.fx / mass,
        y: force.fy / mass + (isPausedRef.current ? 0 : gravityValueRef.current)
      };
    };

    const getPhysicalFriction = (body: Matter.Body) =>
      Number.isFinite((body as any).physicalFriction) ? (body as any).physicalFriction : body.friction;

    const getPhysicalRestitution = (body: Matter.Body) =>
      Number.isFinite((body as any).physicalRestitution) ? (body as any).physicalRestitution : body.restitution;

    const getCollisionNormal = (bodyA: Matter.Body, bodyB: Matter.Body, fallback: Matter.Vector) => {
      const dx = bodyB.position.x - bodyA.position.x;
      const dy = bodyB.position.y - bodyA.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001) return { x: dx / distance, y: dy / distance };
      return fallback;
    };

    console.log('🔧 Physics Engine Created:', {
      gravity: engine.gravity,
      timing: engine.timing
    });

    // Create renderer with white background
    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: canvasRef.current.clientWidth,
        height: canvasRef.current.clientHeight,
        wireframes: false,
        background: '#FFFFFF',
        showAngleIndicator: false,
        showCollisions: false,
        showVelocity: false,
        showIds: false
      }
    });
    renderRef.current = render;

    console.log('🎨 Renderer Created:', {
      width: render.options.width,
      height: render.options.height
    });

    wireDebugEvents(engine);

    // Custom rendering for pivots, ground line, and constraints
    let frameCount = 0;
    Matter.Events.on(render, 'afterRender', () => {
      const context = render.context;
      
      frameCount++;
      if (frameCount % 60 === 0) {
        console.log('🎨 AfterRender called - Frame:', frameCount);
      }
      
      // Enable anti-aliasing
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // Draw custom ground line from the actual static ground body's top edge.
      const allBodies = Matter.Composite.allBodies(engine.world);
      allBodies.forEach(body => {
        if (body.label && body.label.includes('ground')) {
          const groundWidth = Number.isFinite((body as any).appBodyWidth)
            ? (body as any).appBodyWidth
            : body.bounds.max.x - body.bounds.min.x;
          const groundHeight = Number.isFinite((body as any).appBodyHeight)
            ? (body as any).appBodyHeight
            : body.bounds.max.y - body.bounds.min.y;
          const halfWidth = groundWidth * 0.5;
          const halfHeight = groundHeight * 0.5;
          const cos = Math.cos(body.angle);
          const sin = Math.sin(body.angle);
          const toWorld = (localX: number, localY: number) => ({
            x: body.position.x + localX * cos - localY * sin,
            y: body.position.y + localX * sin + localY * cos
          });
          const start = toWorld(-halfWidth, -halfHeight);
          const end = toWorld(halfWidth, -halfHeight);

          context.save();
          context.strokeStyle = '#000000';
          context.lineWidth = 3;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
          context.restore();
        }
      });
      
      // Draw custom constraints (ropes, springs, pivots)
      constraintsRef.current.forEach((constraint, id) => {
        if (!constraint.bodyA || !constraint.bodyB) return;
        
        const pointA = constraint.pointA;
        const pointB = constraint.pointB;
        const bodyA = constraint.bodyA;
        const bodyB = constraint.bodyB;
        
        const start = getConstraintWorldPoint(bodyA, pointA);
        const end = getConstraintWorldPoint(bodyB, pointB);
        const startX = start.x;
        const startY = start.y;
        const endX = end.x;
        const endY = end.y;
        
        context.save();
        
        // Detect constraint type by length and render type
        const isPivot = constraint.length === 0;
        const isSpring = constraint.render?.type === 'spring';
        
        if (isPivot) {
          // Draw pivot with engineering hatch pattern (BLACK)
          drawPivot(context, startX, startY, endX, endY, bodyA, bodyB);
          
        } else if (isSpring) {
          // Draw spring using live endpoint distance; coil spacing changes as it deforms.
          drawSpring(context, startX, startY, endX, endY, constraint.length || 100);
          
        } else {
          // Draw rope as thick black line
          const config = constraintConfigRef.current.get(id);
          const restLength = config?.restLength ?? constraint.length ?? 100;
          
          const dx = endX - startX;
          const dy = endY - startY;
          const currentLength = Math.sqrt(dx * dx + dy * dy);

          context.strokeStyle = '#000000';
          context.lineWidth = 4;
          context.lineCap = 'round';
          
          if (currentLength < restLength - 2) {
            // SLACK ROPE: Draw a curve sagging downwards
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            
            // Sag factor: how much the rope droops
            const slack = restLength - currentLength;
            const droop = Math.min(slack * 1.5, restLength * 0.6); // More aggressive sag
            
            context.beginPath();
            context.moveTo(startX, startY);
            // Dramatic sag for better visibility
            context.quadraticCurveTo(midX, midY + droop, endX, endY);
            context.stroke();
          } else {
            // TAUT ROPE
            context.beginPath();
            context.moveTo(startX, startY);
            context.lineTo(endX, endY);
            context.stroke();
          }
          
          // Draw anchor points (small black dots)
          context.fillStyle = '#000000';
          context.beginPath();
          context.arc(startX, startY, 4, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.arc(endX, endY, 4, 0, Math.PI * 2);
          context.fill();
        }
        
        context.restore();
      });

      // ===== FINAL PASS: Draw ALL pivot/anchor dots on TOP of everything =====
      // This guarantees the black pivot dots are ALWAYS visible above
      // ground, constraints, background, and all other elements.
      allBodies.forEach(body => {
        const lbl = (body.label || '').toLowerCase();
        if (lbl.includes('pivot') || lbl.includes('anchor')) {
          const px = body.position.x;
          const py = body.position.y;
          const dotRadius = 8;
          
          context.save();
          
          // Solid black filled circle
          context.fillStyle = '#000000';
          context.strokeStyle = '#000000';
          context.lineWidth = 1;
          context.globalAlpha = 1;
          context.beginPath();
          context.arc(px, py, dotRadius, 0, Math.PI * 2);
          context.fill();
          context.stroke();
          
          context.restore();
        }
      });

      const drawDistanceToolHighlight = (bodyId: string | null, label: string, color: string) => {
        if (!bodyId) return;
        const body = bodiesRef.current.get(bodyId);
        if (!body || body.vertices.length === 0) return;

        context.save();
        context.beginPath();
        context.moveTo(body.vertices[0].x, body.vertices[0].y);
        for (let j = 1; j < body.vertices.length; j++) {
          context.lineTo(body.vertices[j].x, body.vertices[j].y);
        }
        context.lineTo(body.vertices[0].x, body.vertices[0].y);
        context.lineWidth = 5;
        context.strokeStyle = color;
        context.lineJoin = 'round';
        context.stroke();

        const labelX = body.bounds.min.x;
        const labelY = Math.max(16, body.bounds.min.y - 8);
        context.font = '12px Arial';
        context.textBaseline = 'bottom';
        const metrics = context.measureText(label);
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.fillRect(labelX - 3, labelY - 16, metrics.width + 6, 18);
        context.fillStyle = color;
        context.fillText(label, labelX, labelY);
        context.restore();
      };

      drawDistanceToolHighlight(distanceToolSelectionRef.current.referenceId, 'Reference', 'rgba(22, 163, 74, 0.85)');
      drawDistanceToolHighlight(distanceToolSelectionRef.current.targetId, 'Target', 'rgba(147, 51, 234, 0.85)');

      // ===== HIGHLIGHT SELECTED / REPOSITIONING BODY =====
      const activeId = repositionModeBodyIdRef.current || selectedBodyIdRef.current;
      if (activeId) {
        const body = bodiesRef.current.get(activeId);
        if (body && body.vertices.length > 0) {
          context.save();
          context.beginPath();
          context.moveTo(body.vertices[0].x, body.vertices[0].y);
          for (let j = 1; j < body.vertices.length; j++) {
            context.lineTo(body.vertices[j].x, body.vertices[j].y);
          }
          context.lineTo(body.vertices[0].x, body.vertices[0].y);
          context.lineWidth = repositionModeBodyIdRef.current ? 8 : 6;
          context.strokeStyle = repositionModeBodyIdRef.current ? 'rgba(0, 255, 100, 0.6)' : 'rgba(0, 150, 255, 0.5)';
          context.lineJoin = 'round';
          context.stroke();
          context.restore();
        }
      }

      drawVectorOverlays(context, allBodies);
    });
    
    function getConstraintWorldPoint(body: Matter.Body, localPoint: Matter.Vector) {
      const cos = Math.cos(body.angle);
      const sin = Math.sin(body.angle);
      return {
        x: body.position.x + localPoint.x * cos - localPoint.y * sin,
        y: body.position.y + localPoint.x * sin + localPoint.y * cos
      };
    }

    function collectConstraintDebugForces(target: DebugForceVectorMap) {
      constraintsRef.current.forEach((constraint, id) => {
        if (!constraint.bodyA || !constraint.bodyB) return;

        const start = getConstraintWorldPoint(constraint.bodyA, constraint.pointA);
        const end = getConstraintWorldPoint(constraint.bodyB, constraint.pointB);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return;

        const nx = dx / length;
        const ny = dy / length;
        const isPivot = constraint.length === 0;
        const isSpring = constraint.render?.type === 'spring';

        if (isSpring) {
          const springCfg = springConfigRef.current.get(id);
          if (!springCfg) return;
          const debugForce = calculateSpringDebugForce(
            constraint.bodyA,
            constraint.bodyB,
            constraint.pointA,
            constraint.pointB,
            springCfg,
            getConstraintWorldPoint
          );
          if (!debugForce) return;
          addDebugForceVector(target, constraint.bodyA, 'Spring/damping', debugForce.forceOnA, debugForce.start, 'internal');
          addDebugForceVector(target, constraint.bodyB, 'Spring/damping', debugForce.forceOnB, debugForce.end, 'internal');
          return;
        }

        const config = constraintConfigRef.current.get(id);
        if (!isPivot) {
          const restLength = config?.restLength ?? constraint.length;
          const tension = config?.tension || calculateRopeTension({
            bodyA: constraint.bodyA,
            bodyB: constraint.bodyB,
            pointA: constraint.pointA,
            pointB: constraint.pointB,
            restLength,
            externalAccelerationA: getExternalAccelerationMps2(constraint.bodyA),
            externalAccelerationB: getExternalAccelerationMps2(constraint.bodyB),
            slackTolerancePx: ROPE_LENGTH_SLOP_PX
          });
          if (tension <= 0.001) return;

          addDebugForceVector(target, constraint.bodyA, 'Tension', { x: nx * tension, y: ny * tension }, start, 'internal');
          addDebugForceVector(target, constraint.bodyB, 'Tension', { x: -nx * tension, y: -ny * tension }, end, 'internal');
          return;
        }

        const bodyAStatic = constraint.bodyA.isStatic;
        const bodyBStatic = constraint.bodyB.isStatic;
        const dynamicBody = bodyAStatic && !bodyBStatic ? constraint.bodyB : bodyBStatic && !bodyAStatic ? constraint.bodyA : null;
        if (!dynamicBody) return;

        const dynamicPoint = dynamicBody.id === constraint.bodyA.id ? start : end;
        const directionToAnchor = dynamicBody.id === constraint.bodyA.id
          ? { x: nx, y: ny }
          : { x: -nx, y: -ny };
        const velocityMps = worldVelocityToMps(dynamicBody.velocity);
        const speedMps = Math.hypot(velocityMps.x, velocityMps.y);
        const radiusM = Math.max(length / WORLD_PIXELS_PER_METER, 0.001);
        const estimatedMagnitude = Math.min(
          MAX_FORCE_NEWTONS,
          getFiniteBodyMass(dynamicBody) * (gravityValueRef.current + (speedMps * speedMps) / radiusM)
        );

        addDebugForceVector(
          target,
          dynamicBody,
          'Constraint',
          { x: directionToAnchor.x * estimatedMagnitude, y: directionToAnchor.y * estimatedMagnitude },
          dynamicPoint,
          'internal'
        );
      });
    }

    function drawVectorOverlays(ctx: CanvasRenderingContext2D, allBodies: Matter.Body[]) {
      const internalForces = createDebugForceVectorMap();
      internalDebugForcesRef.current.forEach((vectors, bodyId) => {
        internalForces.set(bodyId, [...vectors]);
      });
      collectConstraintDebugForces(internalForces);

      drawDebugVectorOverlays(ctx, {
        showVelocityComponents: showAllVelocitiesRef.current,
        showForceBreakdown: showAllForcesRef.current,
        bodies: allBodies,
        externalForces: externalDebugForcesRef.current,
        internalForces,
        pausedVelocityByBodyId: pausedDebugVelocityRef.current,
        pausedDynamicKeys: pausedDynamicLabelsRef.current,
        gravityMps2: gravityValueRef.current,
        getBodyKey: getBodyConfigKey,
        getBodyMass: getFiniteBodyMass
      });
    }

    // Helper function to draw spring - smooth, constant-coil deformation.
    function drawSpring(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, restLength: number) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.001) return;

      const angle = Math.atan2(dy, dx);
      
      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(angle);
      
      // Spring style parameters
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const coils = 12;
      const coilAmplitude = 8;
      const hookLength = Math.min(16, distance * 0.18);
      const springStart = hookLength;
      const springEnd = Math.max(springStart, distance - hookLength);
      const springLen = springEnd - springStart;
      const samplesPerCoil = 12;
      const sampleCount = coils * samplesPerCoil;
      const phaseCount = coils * Math.PI * 2;
      const deformationRatio = restLength > 0 ? distance / restLength : 1;
      
      ctx.moveTo(0, 0);
      ctx.lineTo(springStart, 0);
      
      if (springLen > 0.001) {
        for (let i = 1; i <= sampleCount; i++) {
          const t = i / sampleCount;
          const x = springStart + springLen * t;
          const taper = Math.sin(Math.PI * t);
          const y = Math.sin(t * phaseCount) * coilAmplitude * taper;
          ctx.lineTo(x, y);
        }
      }
      
      ctx.lineTo(distance, 0);
      ctx.stroke();
      
      // Draw end hooks (small circles)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(distance, 0, 3, 0, Math.PI * 2);
      ctx.stroke();

      // Small centerline ticks make extension/compression visible without scaling width.
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      const tickSpacing = springLen / coils;
      if (tickSpacing > 0 && Number.isFinite(deformationRatio)) {
        for (let i = 1; i < coils; i++) {
          const x = springStart + tickSpacing * i;
          ctx.beginPath();
          ctx.moveTo(x, -2);
          ctx.lineTo(x, 2);
          ctx.stroke();
        }
      }
      
      ctx.restore();
    }
    
    // Helper function to draw pivot with hatch pattern
    function drawPivot(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, bodyA: Matter.Body, _bodyB: Matter.Body) {
      // Determine which body is the anchor (static)
      const anchorX = bodyA.isStatic ? x1 : x2;
      const anchorY = bodyA.isStatic ? y1 : y2;
      const connectedX = bodyA.isStatic ? x2 : x1;
      const connectedY = bodyA.isStatic ? y2 : y1;
      
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      
      // Draw horizontal support line
      const supportWidth = 40;
      ctx.beginPath();
      ctx.moveTo(anchorX - supportWidth / 2, anchorY);
      ctx.lineTo(anchorX + supportWidth / 2, anchorY);
      ctx.stroke();
      
      // Draw diagonal hatch marks above (ceiling support style)
      const hatchCount = 5;
      const hatchSpacing = supportWidth / hatchCount;
      const hatchLength = 8;
      for (let i = 0; i < hatchCount; i++) {
        const hatchX = anchorX - supportWidth / 2 + i * hatchSpacing;
        ctx.beginPath();
        ctx.moveTo(hatchX, anchorY);
        ctx.lineTo(hatchX - hatchLength * 0.5, anchorY - hatchLength);
        ctx.stroke();
      }
      
      // Draw circular joint/hinge at pivot point
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw connection line from joint to connected body
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.lineTo(connectedX, connectedY);
      ctx.stroke();
    }

    // Start paused by default.
    setWorldGravity(engine, 0);

    // Run with fixed-step loop.
    const loop = createFixedStepLoop(engine, render);
    loopRef.current = loop;
    loop.start();

    const resolveRopeConstraints = () => {
      constraintsRef.current.forEach((constraint, id) => {
        if (!constraint.bodyA || !constraint.bodyB) return;
        const config = constraintConfigRef.current.get(id);
        if (!config || config.type !== 'rope') return;

        constraint.stiffness = 0;
        constraint.damping = 0;

        const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
        const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const currentLength = Math.hypot(dx, dy);
        const restLength = config.restLength || constraint.length;

        if (currentLength < 0.001 || restLength <= 0 || currentLength < restLength - ROPE_LENGTH_SLOP_PX) {
          config.tension = 0;
          return;
        }

        const nx = dx / currentLength;
        const ny = dy / currentLength;
        const stretchPx = currentLength - restLength;
        const correctionPx = Math.min(
          MAX_ROPE_CORRECTION_PX,
          Math.max(0, stretchPx - ROPE_LENGTH_SLOP_PX) * ROPE_CORRECTION_RATIO
        );

        const invMassA = constraint.bodyA.isStatic ? 0 : 1 / Math.max(constraint.bodyA.mass, 1e-12);
        const invMassB = constraint.bodyB.isStatic ? 0 : 1 / Math.max(constraint.bodyB.mass, 1e-12);
        const invMassTotal = invMassA + invMassB;

        if (currentLength > restLength + ROPE_LENGTH_SLOP_PX && invMassTotal > 0 && correctionPx > 0) {
          const correctionA = correctionPx * (invMassA / invMassTotal);
          const correctionB = correctionPx * (invMassB / invMassTotal);

          if (!constraint.bodyA.isStatic) {
            Matter.Body.setPosition(constraint.bodyA, {
              x: constraint.bodyA.position.x + nx * correctionA,
              y: constraint.bodyA.position.y + ny * correctionA
            });
          }
          if (!constraint.bodyB.isStatic) {
            Matter.Body.setPosition(constraint.bodyB, {
              x: constraint.bodyB.position.x - nx * correctionB,
              y: constraint.bodyB.position.y - ny * correctionB
            });
          }
        }

        const relVelX = constraint.bodyB.velocity.x - constraint.bodyA.velocity.x;
        const relVelY = constraint.bodyB.velocity.y - constraint.bodyA.velocity.y;
        const separatingSpeed = relVelX * nx + relVelY * ny;

        if (currentLength > restLength + ROPE_LENGTH_SLOP_PX && invMassTotal > 0 && separatingSpeed > 0) {
          const impulse = separatingSpeed / invMassTotal;

          if (!constraint.bodyA.isStatic) {
            Matter.Body.setVelocity(constraint.bodyA, {
              x: constraint.bodyA.velocity.x + nx * impulse * invMassA,
              y: constraint.bodyA.velocity.y + ny * impulse * invMassA
            });
          }
          if (!constraint.bodyB.isStatic) {
            Matter.Body.setVelocity(constraint.bodyB, {
              x: constraint.bodyB.velocity.x - nx * impulse * invMassB,
              y: constraint.bodyB.velocity.y - ny * impulse * invMassB
            });
          }
        }

        const tension = Math.min(MAX_FORCE_NEWTONS, calculateRopeTension({
          bodyA: constraint.bodyA,
          bodyB: constraint.bodyB,
          pointA: constraint.pointA,
          pointB: constraint.pointB,
          restLength,
          externalAccelerationA: getExternalAccelerationMps2(constraint.bodyA),
          externalAccelerationB: getExternalAccelerationMps2(constraint.bodyB),
          slackTolerancePx: ROPE_LENGTH_SLOP_PX
        }));

        config.tension = tension;
        if (config.maxTension && tension > config.maxTension && !isPausedRef.current) {
          console.log(`Rope broke! Tension ${tension.toFixed(2)}N exceeded Max ${config.maxTension}N`);
          Matter.Composite.remove(engine.world, constraint);
          constraintsRef.current.delete(id);
          constraintConfigRef.current.delete(id);
          setConstraints(new Map(constraintsRef.current));
        }
      });
    };

    const applyRestitutionCorrections = () => {
      const pairs = restitutionPairsRef.current;
      restitutionPairsRef.current = [];

      pairs.forEach(({ bodyA, bodyB, normal, restitution }) => {
        const prevA = previousVelocityRef.current.get(bodyA.id);
        const prevB = previousVelocityRef.current.get(bodyB.id);
        if (!prevA || !prevB || restitution <= 0) return;

        const invMassA = bodyA.isStatic ? 0 : 1 / Math.max(bodyA.mass, 1e-12);
        const invMassB = bodyB.isStatic ? 0 : 1 / Math.max(bodyB.mass, 1e-12);
        const invMassTotal = invMassA + invMassB;
        if (invMassTotal <= 0) return;

        const prevRel = {
          x: prevB.x - prevA.x,
          y: prevB.y - prevA.y
        };
        const closingSpeed = -(prevRel.x * normal.x + prevRel.y * normal.y);
        if (closingSpeed <= RESTITUTION_MIN_CLOSING_SPEED) return;

        const currentRel = {
          x: bodyB.velocity.x - bodyA.velocity.x,
          y: bodyB.velocity.y - bodyA.velocity.y
        };
        const currentNormalSpeed = currentRel.x * normal.x + currentRel.y * normal.y;
        const desiredNormalSpeed = restitution * closingSpeed;
        const deltaSpeed = desiredNormalSpeed - currentNormalSpeed;
        if (deltaSpeed <= 0) return;

        const impulse = deltaSpeed / invMassTotal;
        if (!bodyA.isStatic) {
          Matter.Body.setVelocity(bodyA, {
            x: bodyA.velocity.x - normal.x * impulse * invMassA,
            y: bodyA.velocity.y - normal.y * impulse * invMassA
          });
        }
        if (!bodyB.isStatic) {
          Matter.Body.setVelocity(bodyB, {
            x: bodyB.velocity.x + normal.x * impulse * invMassB,
            y: bodyB.velocity.y + normal.y * impulse * invMassB
          });
        }
      });
    };

    const applyHorizontalFriction = () => {
      const handledBodies = new Set<number>();
      const allBodies = Matter.Composite.allBodies(engine.world);
      const staticBodies = allBodies.filter((body) => body.isStatic);
      const dynamicBodies = allBodies.filter((body) => !body.isStatic);

      dynamicBodies.forEach((dynamicBody) => {
        if (handledBodies.has(dynamicBody.id)) return;

        const support = staticBodies.find((staticBody) => {
          const horizontalOverlap =
            dynamicBody.bounds.max.x > staticBody.bounds.min.x &&
            dynamicBody.bounds.min.x < staticBody.bounds.max.x;
          if (!horizontalOverlap) return false;

          const verticalGap = dynamicBody.bounds.max.y - staticBody.bounds.min.y;
          return verticalGap >= -1 && verticalGap <= 4;
        });
        if (!support) return;

        const mu = Math.min(getPhysicalFriction(support), getPhysicalFriction(dynamicBody));
        const contactPoint = {
          x: dynamicBody.position.x,
          y: dynamicBody.bounds.max.y
        };
        addDebugForceVector(
          externalDebugForcesRef.current,
          dynamicBody,
          'Normal',
          { x: 0, y: -getFiniteBodyMass(dynamicBody) * gravityValueRef.current },
          contactPoint,
          'external'
        );
        if (mu <= 0) return;

        const velocityMps = worldVelocityToMps(dynamicBody.velocity);
        const vx = velocityMps.x;
        const maxDelta = mu * gravityValueRef.current * STEP_SECONDS;
        const frictionDeltaMps = Math.min(Math.abs(vx), maxDelta);
        if (frictionDeltaMps > 0.001) {
          addDebugForceVector(
            externalDebugForcesRef.current,
            dynamicBody,
            'Friction',
            { x: -Math.sign(vx) * getFiniteBodyMass(dynamicBody) * (frictionDeltaMps / STEP_SECONDS), y: 0 },
            contactPoint,
            'external'
          );
        }
        if (Math.abs(vx) <= maxDelta) {
          Matter.Body.setVelocity(dynamicBody, { x: 0, y: dynamicBody.velocity.y });
        } else {
          const nextVxMps = vx - Math.sign(vx) * maxDelta;
          const nextVx = speedMpsToWorldVelocity(
            Math.abs(nextVxMps),
            nextVxMps >= 0 ? 0 : 180,
            MAX_SPEED_MPS
          ).x;
          Matter.Body.setVelocity(dynamicBody, { x: nextVx, y: dynamicBody.velocity.y });
        }

        handledBodies.add(dynamicBody.id);
      });
    };

    const appendContactDebugForces = (pairs: Matter.Pair[]) => {
      pairs.forEach((pair) => {
        const normal = getCollisionNormal(pair.bodyA, pair.bodyB, pair.collision.normal);
        const invMassA = pair.bodyA.isStatic ? 0 : 1 / Math.max(pair.bodyA.mass, 1e-12);
        const invMassB = pair.bodyB.isStatic ? 0 : 1 / Math.max(pair.bodyB.mass, 1e-12);
        const invMassTotal = invMassA + invMassB;
        if (invMassTotal <= 0) return;

        const relVelocityMps = worldVelocityToMps({
          x: pair.bodyB.velocity.x - pair.bodyA.velocity.x,
          y: pair.bodyB.velocity.y - pair.bodyA.velocity.y
        });
        const closingSpeedMps = Math.max(0, -(relVelocityMps.x * normal.x + relVelocityMps.y * normal.y));
        const penetration = Math.max(0, pair.collision.depth || 0);
        const effectiveMass = 1 / invMassTotal;
        const magnitude = Math.min(
          MAX_FORCE_NEWTONS,
          effectiveMass * (closingSpeedMps / STEP_SECONDS + penetration * 0.5)
        );
        if (magnitude <= 0.001) return;

        const support = (pair.collision.supports?.[0] as Matter.Vector | undefined) ?? {
          x: (pair.bodyA.position.x + pair.bodyB.position.x) * 0.5,
          y: (pair.bodyA.position.y + pair.bodyB.position.y) * 0.5
        };

        if (!pair.bodyA.isStatic) {
          addDebugForceVector(
            externalDebugForcesRef.current,
            pair.bodyA,
            'Contact',
            { x: -normal.x * magnitude, y: -normal.y * magnitude },
            support,
            'external'
          );
        }
        if (!pair.bodyB.isStatic) {
          addDebugForceVector(
            externalDebugForcesRef.current,
            pair.bodyB,
            'Contact',
            { x: normal.x * magnitude, y: normal.y * magnitude },
            support,
            'external'
          );
        }
      });
    };

    Matter.Events.on(engine, 'beforeUpdate', () => {
      simulationTimeRef.current += STEP_SECONDS;
      const t = simulationTimeRef.current;
      previousVelocityRef.current.clear();
      Matter.Composite.allBodies(engine.world).forEach((body) => {
        previousVelocityRef.current.set(body.id, { x: body.velocity.x, y: body.velocity.y });
      });
      
      // 0. Apply Remote Updates with Lerp
      remoteUpdatesRef.current.forEach((update, id) => {
        const body = bodiesRef.current.get(id);
        if (body && !body.isStatic) {
          // If we are dragging this body, ignore remote updates to avoid fighting
          if (mouseConstraintRef.current?.body?.id === body.id) return;

          const lerpFactor = 0.2; // Smoothness factor
          const newPos = lerpVector(body.position, update.position, lerpFactor);
          const newVel = lerpVector(body.velocity, update.velocity, lerpFactor);
          const newAngle = lerp(body.angle, update.angle, lerpFactor);
          
          Matter.Body.setPosition(body, newPos);
          Matter.Body.setVelocity(body, newVel);
          Matter.Body.setAngle(body, newAngle);
        }
      });

      // Keep native rope solving disabled; custom one-way resolution runs after integration.
      constraintsRef.current.forEach((constraint, id) => {
        if (!constraint.bodyA || !constraint.bodyB) return;
        const config = constraintConfigRef.current.get(id);
        if (!config || config.type !== 'rope') return;

        constraint.stiffness = 0;
        constraint.damping = 0;
      });

      const springNetForces = new Map<number, { body: Matter.Body; fx: number; fy: number }>();
      const undampedSpringBodyIds = new Set<number>();
      const externalDebugForces = createDebugForceVectorMap();
      const internalDebugForces = createDebugForceVectorMap();

      // Apply Spring Forces
      constraintsRef.current.forEach((constraint, id) => {
        const springCfg = springConfigRef.current.get(id);
        if (!springCfg || !constraint.bodyA || !constraint.bodyB) return;
        if (springCfg.dampingRatio <= 0) {
          undampedSpringBodyIds.add(constraint.bodyA.id);
          undampedSpringBodyIds.add(constraint.bodyB.id);
        }

        const netForce = applySpringForce(
          constraint.bodyA,
          constraint.bodyB,
          constraint.pointA,
          constraint.pointB,
          springCfg
        );

        if (!constraint.bodyA.isStatic) {
          const current = springNetForces.get(constraint.bodyA.id) ?? { body: constraint.bodyA, fx: 0, fy: 0 };
          current.fx += netForce.fx;
          current.fy += netForce.fy;
          springNetForces.set(constraint.bodyA.id, current);
        }
        if (!constraint.bodyB.isStatic) {
          const current = springNetForces.get(constraint.bodyB.id) ?? { body: constraint.bodyB, fx: 0, fy: 0 };
          current.fx -= netForce.fx;
          current.fy -= netForce.fy;
          springNetForces.set(constraint.bodyB.id, current);
        }
      });

      const externalForceNewtons = new Map<number, { fx: number; fy: number }>();
      springNetForces.forEach(({ body, fx, fy }) => {
        addExternalForceNewtons(externalForceNewtons, body, fx, fy);
      });

      const allBodies = Matter.Composite.allBodies(engine.world);
      allBodies.forEach((body) => {
        if (!body.isStatic) {
          const forceConfig = forceConfigRef.current.get(getBodyConfigKey(body));
          if (forceConfig?.enabled) {
            if (forceConfig.type === 'instantaneous') {
              // TRUE IMPULSE: direct velocity change, frame-rate independent.
              // User input is impulse in N·s. Δv = impulse / mass.
              const impulseNs = clampFinite(forceConfig.magnitude, -MAX_FORCE_NEWTONS, MAX_FORCE_NEWTONS, 0);
              const direction = degreesToUnitVector(forceConfig.angleDeg);
              const mass = Math.max(body.mass, 1e-12);
              // Δv in m/s
              const dvMps = impulseNs / mass;
              // Convert Δv to Matter.js world velocity units (60fps-normalized, not physics step)
              const dvWorld = dvMps * WORLD_PIXELS_PER_METER * (MATTER_BASE_TIMESTEP_MS / 1000);
              // Add to existing velocity (additive impulse)
              Matter.Body.setVelocity(body, {
                x: body.velocity.x + dvWorld * direction.x,
                y: body.velocity.y + dvWorld * direction.y
              });
              addDebugForceVector(
                externalDebugForces,
                body,
                'Impulse',
                { x: impulseNs * direction.x, y: impulseNs * direction.y },
                body.position,
                'external'
              );
              // Auto-disable after one application
              forceConfig.enabled = false;
            } else {
              // Continuous force types: constant, timed, variable
              const xMeters = body.position.x / WORLD_PIXELS_PER_METER;
              let magnitude = forceConfig.magnitude;
              if (forceConfig.type === 'timed' && (t < forceConfig.startTime || t > forceConfig.endTime)) {
                magnitude = 0;
              } else if (forceConfig.type === 'variable') {
                magnitude = evaluatePhysicsExpression(forceConfig.expression, { x: xMeters, t });
              }
              magnitude = clampFinite(magnitude, -MAX_FORCE_NEWTONS, MAX_FORCE_NEWTONS, 0);
              const direction = degreesToUnitVector(forceConfig.angleDeg);
              addExternalForceNewtons(
                externalForceNewtons,
                body,
                magnitude * direction.x,
                magnitude * direction.y
              );
              addDebugForceVector(
                externalDebugForces,
                body,
                'Applied',
                { x: magnitude * direction.x, y: magnitude * direction.y },
                body.position,
                'external'
              );
              Matter.Body.applyForce(body, body.position, {
                x: magnitude * REAL_FORCE_TO_MATTER * direction.x,
                y: magnitude * REAL_FORCE_TO_MATTER * direction.y
              });
            }
          }

          // 2. Velocity Control
          const velocityConfig = velocityConfigRef.current.get(getBodyConfigKey(body));
          if (velocityConfig?.enabled && velocityConfig.type !== 'initial') {
            const xMeters = body.position.x / WORLD_PIXELS_PER_METER;
            const speed = velocityConfig.type === 'variable'
              ? evaluatePhysicsExpression(velocityConfig.expression, { x: xMeters, t })
              : velocityConfig.speed;
            Matter.Body.setVelocity(body, speedMpsToWorldVelocity(speed, velocityConfig.angleDeg, MAX_SPEED_MPS));
          }


          // 3. Air Resistance
          const environment = environmentPhysicsRef.current;
          if (!environment.neglectAirResistance) {
            const dragForce = applyAirResistance(body, environment.airDensity, environment.dragCoefficient, MAX_FORCE_NEWTONS);
            addExternalForceNewtons(externalForceNewtons, body, dragForce.fx, dragForce.fy);
            addDebugForceVector(
              externalDebugForces,
              body,
              'Air resistance',
              { x: dragForce.fx, y: dragForce.fy },
              body.position,
              'external'
            );
          }
          
          // NaN Protection (Additional safety)
          if (isNaN(body.position.x) || isNaN(body.position.y)) {
            console.error('❌ NaN detected in body position:', body.label);
            Matter.Body.setPosition(body, { x: 400, y: 100 });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
          }
        }
      });
      externalForceNewtonsRef.current = externalForceNewtons;
      externalDebugForcesRef.current = externalDebugForces;
      internalDebugForcesRef.current = internalDebugForces;

      springNetForces.forEach(({ body, fx, fy }) => {
        if (undampedSpringBodyIds.has(body.id)) return;
        const forceConfig = forceConfigRef.current.get(getBodyConfigKey(body));
        const velocityConfig = velocityConfigRef.current.get(getBodyConfigKey(body));
        if (forceConfig?.enabled || velocityConfig?.enabled) return;

        const velocityMps = worldVelocityToMps(body.velocity);
        const vxMps = velocityMps.x;
        const vyMps = velocityMps.y;
        const speedMps = Math.hypot(vxMps, vyMps);
        const netFx = fx;
        const netFy = fy + body.mass * gravityValueRef.current;
        const accelMps2 = Math.hypot(netFx, netFy) / Math.max(body.mass, 1e-12);

        if (speedMps < SPRING_REST_SPEED_MPS && accelMps2 < SPRING_REST_ACCEL_MPS2) {
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(body, 0);
        }
      });

      // 5. Emit Sync State (Throttle to every ~3 frames to save bandwidth)
      if (options.onSyncState && Math.round(t / STEP_SECONDS) % 3 === 0) {
        const updates: RemoteUpdate[] = [];
        bodiesRef.current.forEach((body, id) => {
          if (!body.isStatic && (body.speed > 0.1 || body.angularSpeed > 0.01 || mouseConstraintRef.current?.body?.id === body.id)) {
            updates.push({
              id,
              position: { x: body.position.x, y: body.position.y },
              velocity: { x: body.velocity.x, y: body.velocity.y },
              angle: body.angle
            });
          }
        });
        if (updates.length > 0) {
          options.onSyncState(updates);
        }
      }
    });

    const handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
      event.pairs.forEach((pair) => {
        const restitution = Math.max(getPhysicalRestitution(pair.bodyA), getPhysicalRestitution(pair.bodyB));
        if (restitution <= 0) return;

        restitutionPairsRef.current.push({
          bodyA: pair.bodyA,
          bodyB: pair.bodyB,
          normal: getCollisionNormal(pair.bodyA, pair.bodyB, pair.collision.normal),
          restitution
        });
      });
      appendContactDebugForces(event.pairs);
    };

    const handleCollisionActive = (event: Matter.IEventCollision<Matter.Engine>) => {
      appendContactDebugForces(event.pairs);
    };

    const handleAfterUpdate = () => {
      applyRestitutionCorrections();
      applyHorizontalFriction();
      resolveRopeConstraints();
      recordReplaySnapshot();
      recordVelocitySamples(simulationTimeRef.current);
    };

    Matter.Events.on(engine, 'collisionStart', handleCollisionStart);
    Matter.Events.on(engine, 'collisionActive', handleCollisionActive);
    Matter.Events.on(engine, 'afterUpdate', handleAfterUpdate);

    // Prevent context menu on right click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Track mouse position
    const handleMouseMove = (event: MouseEvent) => {
      const rect = render.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      mousePositionRef.current = { x, y };

      if (isRepositionDraggingRef.current && repositionModeBodyIdRef.current) {
        const body = bodiesRef.current.get(repositionModeBodyIdRef.current);
        if (body) {
          Matter.Body.setPosition(body, { x, y });
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(body, 0);
        }
      }
    };

    const handleMouseUp = () => {
      if (isRepositionDraggingRef.current) {
        isRepositionDraggingRef.current = false;
        if (repositionModeBodyIdRef.current) {
          const body = bodiesRef.current.get(repositionModeBodyIdRef.current);
          if (body) {
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
          }
        }
        
        // Finalize undo snapshot for custom drag
        if (dragHistorySnapshotRef.current && !suppressHistoryRef.current) {
          undoStackRef.current.push(dragHistorySnapshotRef.current);
          if (undoStackRef.current.length > MAX_UNDO_SNAPSHOTS) {
            undoStackRef.current.shift();
          }
          redoStackRef.current = [];
          dragHistorySnapshotRef.current = null;
          refreshHistoryState();
        }
      }
    };

    render.canvas.addEventListener('contextmenu', handleContextMenu);
    render.canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Mouse control
    const mouse = Matter.Mouse.create(render.canvas);
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    });

    Matter.Composite.add(engine.world, mouseConstraint);
    mouseConstraintRef.current = mouseConstraint;
    mouseConstraintEnabledRef.current = true;
    Matter.Events.on(mouseConstraint, 'startdrag', () => {
      dragHistorySnapshotRef.current = captureWorldSnapshot();
    });
    Matter.Events.on(mouseConstraint, 'enddrag', () => {
      if (!dragHistorySnapshotRef.current || suppressHistoryRef.current) return;
      undoStackRef.current.push(dragHistorySnapshotRef.current);
      if (undoStackRef.current.length > MAX_UNDO_SNAPSHOTS) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      dragHistorySnapshotRef.current = null;
      refreshHistoryState();
    });

    const distanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;
      let xx: number;
      let yy: number;
      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }
      const dx = px - xx;
      const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleBodyClick = (bodyEntry: [string, Matter.Body]) => {
      const bodyId = bodyEntry[0];
      const body = bodyEntry[1];
      
      const now = Date.now();
      const isDoubleClick = lastClickedBodyIdRef.current === bodyId && now - lastClickTimeRef.current < 500;
      lastClickTimeRef.current = now;
      lastClickedBodyIdRef.current = bodyId;

      if (isDoubleClick) {
        // Double-click detected
        setSelectedBody(null);
        selectedBodyIdRef.current = bodyId;
        setSelectedBodyLabel(null);
        setSelectedConstraintId(null);
        repositionModeBodyIdRef.current = bodyId;
        isRepositionDraggingRef.current = true;
        dragHistorySnapshotRef.current = captureWorldSnapshot();
        console.log('🔄 Entered persistent reposition mode for body:', body.label);
        return;
      } else {
        if (repositionModeBodyIdRef.current === bodyId) {
          // Already in reposition mode, drag again
          selectedBodyIdRef.current = bodyId;
          setSelectedBody(null);
          setSelectedBodyLabel(null);
          setSelectedConstraintId(null);
          isRepositionDraggingRef.current = true;
          dragHistorySnapshotRef.current = captureWorldSnapshot();
          return;
        } else {
          // Exit reposition mode
          repositionModeBodyIdRef.current = null;
        }
      }
      setSelectedBody(bodyId);
      selectedBodyIdRef.current = bodyId;
      setSelectedBodyLabel(body.label);
      setSelectedConstraintId(null);
    };

    // Handle click events
    Matter.Events.on(mouseConstraint, 'mousedown', (event: any) => {
      if (distanceToolActiveRef.current) return;

      const bodiesAtMouse = Matter.Query.point(
        Array.from(bodiesRef.current.values()),
        mouse.position
      );
      const clickedBody = (isPausedRef.current ? bodiesAtMouse[0] : null) ?? event.source.body;
      if (clickedBody) {
        const bodyEntry = Array.from(bodiesRef.current.entries()).find(([_, b]) => b.id === clickedBody.id);
        if (bodyEntry) {
          handleBodyClick(bodyEntry);
          if (isRepositionDraggingRef.current) {
            mouseConstraint.body = null as any;
          }
        }
      } else {
        repositionModeBodyIdRef.current = null;
        selectedBodyIdRef.current = null;
        // If no body selected, try selecting nearest constraint.
        const x = mouse.position.x;
        const y = mouse.position.y;
        let bestId: string | null = null;
        let bestDist = 24;
        constraintsRef.current.forEach((constraint, id) => {
          if (!constraint.bodyA || !constraint.bodyB) return;
          const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
          const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
          const d = distanceToSegment(x, y, start.x, start.y, end.x, end.y);
          if (d < bestDist) {
            bestDist = d;
            bestId = id;
          }
        });

        setSelectedBody(null);
        setSelectedBodyLabel(null);
        setSelectedConstraintId(bestId);
      }
    });

    const handlePausedCanvasMouseDown = (event: MouseEvent) => {
      if (distanceToolActiveRef.current) return;
      if (!isPausedRef.current || event.button !== 0) return;

      const rect = render.canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - rect.left) * (render.canvas.width / rect.width),
        y: (event.clientY - rect.top) * (render.canvas.height / rect.height)
      };
      const clickedBody = Matter.Query.point(Array.from(bodiesRef.current.values()), point)[0];
      if (clickedBody) {
        const bodyEntry = Array.from(bodiesRef.current.entries()).find(([_, body]) => body.id === clickedBody.id);
        if (!bodyEntry) return;

        handleBodyClick(bodyEntry);
        return;
      }

      repositionModeBodyIdRef.current = null;
      let bestId: string | null = null;
      let bestDist = 24;
      constraintsRef.current.forEach((constraint, id) => {
        if (!constraint.bodyA || !constraint.bodyB) return;
        const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
        const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
        const d = distanceToSegment(point.x, point.y, start.x, start.y, end.x, end.y);
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      });

      setSelectedBody(null);
      selectedBodyIdRef.current = null;
      setSelectedBodyLabel(null);
      setSelectedConstraintId(bestId);
    };

    render.canvas.addEventListener('mousedown', handlePausedCanvasMouseDown);
    render.mouse = mouse;

    return () => {
      loop.stop();
      Matter.Render.stop(render);
      // Remove all Matter.js event listeners to prevent duplicates on remount
      Matter.Events.off(render, 'afterRender');
      Matter.Events.off(engine, 'beforeUpdate');
      Matter.Events.off(engine, 'collisionStart', handleCollisionStart);
      Matter.Events.off(engine, 'collisionActive', handleCollisionActive);
      Matter.Events.off(engine, 'afterUpdate', handleAfterUpdate);
      Matter.Events.off(mouseConstraint, 'mousedown');
      Matter.Events.off(mouseConstraint, 'startdrag');
      Matter.Events.off(mouseConstraint, 'enddrag');
      Matter.Engine.clear(engine);
      mouseConstraintRef.current = null;
      mouseConstraintEnabledRef.current = false;
      render.canvas.removeEventListener('contextmenu', handleContextMenu);
      render.canvas.removeEventListener('mousemove', handleMouseMove);
      render.canvas.removeEventListener('mousedown', handlePausedCanvasMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      // Do NOT call render.canvas.remove() — the canvas is owned by React.
      // Removing it breaks re-initialization under React StrictMode.
      render.textures = {};
    };
  }, [canvasRef]);

  // Update preview position to follow mouse
  useEffect(() => {
    if (previewObject && engineRef.current) {
      const interval = setInterval(() => {
        Matter.Body.setPosition(previewObject.body, mousePositionRef.current);
      }, 16); // ~60fps

      return () => clearInterval(interval);
    }
  }, [previewObject]);

  const createBodyFromObject = useCallback((obj: PhysicsObject, isPreview: boolean = false): Matter.Body | null => {
    let body: Matter.Body;

    const renderOptions: Matter.IBodyRenderOptions = {
      visible: true,
      fillStyle: isPreview ? '#CCCCCC' : (obj.color || (obj.type === 'box' ? '#DDDDDD' : obj.type === 'circle' ? '#EEEEEE' : 'transparent')),
      opacity: 1,
      strokeStyle: isPreview ? '#666666' : '#000000',
      lineWidth: isPreview ? 3 : 2
    };

    const commonOptions = {
      isStatic: isPreview ? true : (obj.isStatic || false),
      isSensor: isPreview,
      label: obj.label || obj.type,
      collisionFilter: isPreview ? {
        group: -1,
        category: 0x0000,
        mask: 0x0000
      } : undefined
    };

    switch (obj.type) {
      case 'box':
        body = createRigidBody({ ...obj, isStatic: commonOptions.isStatic }) as Matter.Body;
        body.render = renderOptions as Matter.IBodyRenderOptions;
        console.log('📦 Box Created:', {
          position: { x: obj.x, y: obj.y },
          size: { w: obj.width || 80, h: obj.height || 80 },
          isPreview
        });
        break;
      case 'circle':
        // Special rendering for anchor points (pivots, rope anchors, spring anchors)
        const isAnchor = obj.label?.includes('anchor') || obj.label?.includes('pivot') || 
                         (obj.label?.includes('rope') && obj.label?.includes('anchor')) ||
                         (obj.label?.includes('spring') && obj.label?.includes('anchor'));
        const anchorRenderOptions: Matter.IBodyRenderOptions = isAnchor ? {
          visible: true,
          fillStyle: isPreview ? '#666666' : '#000000',
          strokeStyle: isPreview ? '#999999' : '#000000',
          lineWidth: 2,
          opacity: 1
        } : renderOptions;

        body = createRigidBody({ ...obj, isStatic: commonOptions.isStatic }) as Matter.Body;
        body.render = anchorRenderOptions as Matter.IBodyRenderOptions;
        console.log('⚪ Circle Created:', {
          position: { x: obj.x, y: obj.y },
          radius: obj.radius || 40,
          isPreview,
          isAnchor
        });
        break;
      case 'ground':
        // Ground can be full-screen or custom length, while staying a static Matter rectangle.
        const canvasWidth = canvasRef.current?.clientWidth || 800;
        const canvasHeight = canvasRef.current?.clientHeight || 600;
        const width = Number.isFinite(obj.width) && (obj.width ?? 0) > 0 ? obj.width ?? canvasWidth : canvasWidth;
        const height = Number.isFinite(obj.height) && (obj.height ?? 0) > 0 ? obj.height ?? 60 : 60;
        const x = Number.isFinite(obj.x) ? obj.x : canvasWidth / 2;
        const y = Number.isFinite(obj.y) ? obj.y : canvasHeight - height / 2;
        body = createRigidBody({ ...obj, x, y, width, height, isStatic: true }) as Matter.Body;
        body.render = {
          fillStyle: 'transparent',
          opacity: isPreview ? 0.3 : 0,
          strokeStyle: isPreview ? '#666666' : 'transparent',
          lineWidth: isPreview ? 2 : 0
        };
        (body as any).appBodyWidth = width;
        (body as any).appBodyHeight = height;
        console.log('🏗️ Ground Created:', {
          position: { x, y },
          bounds: body.bounds,
          width,
          height,
          angle: obj.angle ?? 0
        });
        break;
      default:
        return null;
    }

    (body as any).appBodyId = obj.id;
    (body as any).appBodyType = obj.type;
    (body as any).appBodyWidth = Number.isFinite((body as any).appBodyWidth) ? (body as any).appBodyWidth : obj.width;
    (body as any).appBodyHeight = Number.isFinite((body as any).appBodyHeight) ? (body as any).appBodyHeight : obj.height;
    (body as any).appBodyRadius = obj.radius;
    if (Number.isFinite(obj.angle)) {
      Matter.Body.setAngle(body, obj.angle ?? 0);
    }
    if (obj.velocity) {
      Matter.Body.setVelocity(body, obj.velocity);
    }
    if (Number.isFinite(obj.angularVelocity)) {
      Matter.Body.setAngularVelocity(body, obj.angularVelocity ?? 0);
    }
    if (!body.isStatic && Number.isFinite(obj.mass) && (obj.mass ?? 0) > 0) {
      applyMassKg(body, obj.mass ?? 1);
      massOverridesRef.current.set(getBodyConfigKey(body), obj.mass ?? 1);
    }
    if (Number.isFinite(obj.friction)) {
      (body as any).physicalFriction = obj.friction;
    }
    if (Number.isFinite(obj.restitution)) {
      (body as any).physicalRestitution = obj.restitution;
    }

    return body;
  }, [canvasRef]);

  const startPreview = useCallback((obj: PhysicsObject) => {
    if (!engineRef.current || previewObject) return;

    const body = createBodyFromObject(obj, true);
    if (!body) return;

    Matter.Composite.add(engineRef.current.world, body);
    setPreviewObject({
      id: obj.id,
      body,
      type: obj.type,
      originalProps: obj
    });
  }, [createBodyFromObject, previewObject]);

  const getBodyClearanceRadius = (body: Matter.Body) => {
    const width = body.bounds.max.x - body.bounds.min.x;
    const height = body.bounds.max.y - body.bounds.min.y;
    return Math.max(width, height) * 0.5;
  };

  const distanceToSegment = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const segmentX = x2 - x1;
    const segmentY = y2 - y1;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    const t = segmentLengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * segmentX + (py - y1) * segmentY) / segmentLengthSq));
    const closestX = x1 + segmentX * t;
    const closestY = y1 + segmentY * t;
    return Math.hypot(px - closestX, py - closestY);
  };

  const getBodyIdAtPoint = useCallback((x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const point = { x, y };
    const matches = Matter.Query.point(Array.from(bodiesRef.current.values()), point)
      .filter((body) => {
        const label = body.label.toLowerCase();
        return label !== 'mouse constraint' && !label.includes('ground');
      })
      .sort((a, b) => {
        const areaA = (a.bounds.max.x - a.bounds.min.x) * (a.bounds.max.y - a.bounds.min.y);
        const areaB = (b.bounds.max.x - b.bounds.min.x) * (b.bounds.max.y - b.bounds.min.y);
        return areaA - areaB;
      });

    const body = matches[0];
    if (!body) return null;

    return Array.from(bodiesRef.current.entries()).find(([, candidate]) => candidate.id === body.id)?.[0] ?? null;
  }, []);

  const setDistanceToolSelection = useCallback((referenceId: string | null, targetId: string | null) => {
    distanceToolSelectionRef.current = { referenceId, targetId };
  }, []);

  const setDistanceToolActive = useCallback((isActive: boolean) => {
    distanceToolActiveRef.current = isActive;
    if (!isActive) {
      distanceToolSelectionRef.current = { referenceId: null, targetId: null };
    }
  }, []);

  const validateDistancePlacement = (
    targetBody: Matter.Body,
    candidatePosition: Matter.Vector
  ): DistancePlacementResult => {
    if (!Number.isFinite(candidatePosition.x) || !Number.isFinite(candidatePosition.y)) {
      return { success: false, reason: 'Invalid coordinates generated' };
    }

    if (isRestrictedPlacementTarget(targetBody)) {
      return { success: false, reason: 'Cannot move restricted object' };
    }

    const render = renderRef.current;
    const width = render?.canvas.width || canvasRef.current?.clientWidth || 800;
    const height = render?.canvas.height || canvasRef.current?.clientHeight || 600;
    const delta = {
      x: candidatePosition.x - targetBody.position.x,
      y: candidatePosition.y - targetBody.position.y
    };
    const nextBounds = {
      min: {
        x: targetBody.bounds.min.x + delta.x,
        y: targetBody.bounds.min.y + delta.y
      },
      max: {
        x: targetBody.bounds.max.x + delta.x,
        y: targetBody.bounds.max.y + delta.y
      }
    };

    if (
      nextBounds.min.x < 0 ||
      nextBounds.min.y < 0 ||
      nextBounds.max.x > width ||
      nextBounds.max.y > height
    ) {
      return { success: false, reason: 'Object would leave simulation bounds' };
    }

    const originalPosition = { x: targetBody.position.x, y: targetBody.position.y };
    const originalVelocity = { x: targetBody.velocity.x, y: targetBody.velocity.y };
    const originalAngle = targetBody.angle;
    const originalAngularVelocity = targetBody.angularVelocity;

    try {
      Matter.Body.setPosition(targetBody, candidatePosition);

      if (!Number.isFinite(targetBody.position.x) || !Number.isFinite(targetBody.position.y)) {
        return { success: false, reason: 'Invalid coordinates generated' };
      }

      const otherBodies = Array.from(bodiesRef.current.values()).filter((body) => {
        if (body.id === targetBody.id) return false;
        return body.label.toLowerCase() !== 'mouse constraint';
      });
      const collisions = Matter.Query.collides(targetBody, otherBodies);
      const blockingCollision = collisions.find((collision) => ((collision as any).depth ?? collision.collision?.depth ?? 0) > 0.5);
      if (blockingCollision) {
        const collisionBodies = [
          (blockingCollision as any).bodyA,
          (blockingCollision as any).bodyB,
          (blockingCollision as any).collision?.bodyA,
          (blockingCollision as any).collision?.bodyB
        ].filter(Boolean) as Matter.Body[];
        const hitsGround = collisionBodies.some((body) =>
          body.id !== targetBody.id && body.label.toLowerCase().includes('ground')
        );
        return {
          success: false,
          reason: hitsGround ? 'Object would intersect ground' : 'Object would overlap another object'
        };
      }

      const targetRadius = getBodyClearanceRadius(targetBody);
      const constraintGap = 18;
      for (const constraint of constraintsRef.current.values()) {
        if (!constraint.bodyA || !constraint.bodyB) continue;
        if (constraint.bodyA.id === targetBody.id || constraint.bodyB.id === targetBody.id) continue;

        const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
        const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
        if (distanceToSegment(candidatePosition.x, candidatePosition.y, start.x, start.y, end.x, end.y) < targetRadius + constraintGap) {
          return { success: false, reason: 'Placement constraint violation' };
        }
      }
    } finally {
      Matter.Body.setPosition(targetBody, originalPosition);
      Matter.Body.setVelocity(targetBody, originalVelocity);
      Matter.Body.setAngle(targetBody, originalAngle);
      Matter.Body.setAngularVelocity(targetBody, originalAngularVelocity);
    }

    return { success: true };
  };

  const applyDistancePlacement = useCallback((
    referenceBodyId: string,
    targetBodyId: string,
    dxWorld: number,
    dyWorld: number
  ): DistancePlacementResult => {
    const referenceBody = bodiesRef.current.get(referenceBodyId);
    const targetBody = bodiesRef.current.get(targetBodyId);
    if (!referenceBody || !targetBody || referenceBodyId === targetBodyId) {
      return { success: false, reason: 'Invalid coordinates generated' };
    }

    if (!Number.isFinite(dxWorld) || !Number.isFinite(dyWorld)) {
      return { success: false, reason: 'Invalid coordinates generated' };
    }

    const candidatePosition = {
      x: referenceBody.position.x + dxWorld,
      y: referenceBody.position.y + dyWorld
    };
    const validation = validateDistancePlacement(targetBody, candidatePosition);
    if (!validation.success) return validation;

    const originalVelocity = { x: targetBody.velocity.x, y: targetBody.velocity.y };
    const originalAngularVelocity = targetBody.angularVelocity;

    pushUndoSnapshot();
    Matter.Body.setPosition(targetBody, candidatePosition);
    Matter.Body.setVelocity(targetBody, originalVelocity);
    Matter.Body.setAngularVelocity(targetBody, originalAngularVelocity);
    selectedBodyIdRef.current = targetBodyId;
    setSelectedBody(targetBodyId);
    setSelectedBodyLabel(targetBody.label);
    setSelectedConstraintId(null);
    setBodies((prev) => {
      const next = new Map(prev);
      bodiesRef.current = next;
      return next;
    });
    setPhysicsConfigRevision((value) => value + 1);

    return { success: true };
  }, [canvasRef]);

  const resolveSpawnPosition = useCallback((previewBody: Matter.Body, desiredPosition: Matter.Vector) => {
    const render = renderRef.current;
    const width = render?.canvas.width || canvasRef.current?.clientWidth || 800;
    const height = render?.canvas.height || canvasRef.current?.clientHeight || 600;
    const spawnGap = 24;
    const constraintGap = 18;
    const radius = getBodyClearanceRadius(previewBody);

    const clampToCanvas = (position: Matter.Vector): Matter.Vector => ({
      x: Math.max(radius, Math.min(width - radius, position.x)),
      y: Math.max(radius, Math.min(height - radius, position.y))
    });

    const isClear = (position: Matter.Vector) => {
      for (const body of bodiesRef.current.values()) {
        const existingRadius = getBodyClearanceRadius(body);
        const distance = Math.hypot(position.x - body.position.x, position.y - body.position.y);
        if (distance < radius + existingRadius + spawnGap) {
          return false;
        }
      }

      for (const constraint of constraintsRef.current.values()) {
        if (!constraint.bodyA || !constraint.bodyB) continue;
        const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
        const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
        if (distanceToSegment(position.x, position.y, start.x, start.y, end.x, end.y) < radius + constraintGap) {
          return false;
        }
      }

      return true;
    };

    const initial = clampToCanvas(desiredPosition);
    if (isClear(initial)) {
      return initial;
    }

    const step = 28;
    const maxRadius = 420;
    for (let ring = step; ring <= maxRadius; ring += step) {
      const samples = Math.max(12, Math.ceil((Math.PI * 2 * ring) / step));
      for (let i = 0; i < samples; i++) {
        const angle = (Math.PI * 2 * i) / samples;
        const candidate = clampToCanvas({
          x: desiredPosition.x + Math.cos(angle) * ring,
          y: desiredPosition.y + Math.sin(angle) * ring
        });
        if (isClear(candidate)) {
          return candidate;
        }
      }
    }

    return initial;
  }, [canvasRef]);

  const finalizePreview = useCallback(() => {
    if (!previewObject || !engineRef.current) return;

    const position = previewObject.type === 'ground'
      ? previewObject.body.position
      : resolveSpawnPosition(previewObject.body, previewObject.body.position);

    // Remove preview body
    Matter.Composite.remove(engineRef.current.world, previewObject.body);
    pushUndoSnapshot();

    // Create final object with proper physics
    const finalObj: PhysicsObject = {
      ...previewObject.originalProps,
      x: position.x,
      y: position.y
    };

    const finalBody = createBodyFromObject(finalObj, false);
    if (!finalBody) {
      setPreviewObject(null);
      return;
    }

    (finalBody as any).appBodyId = previewObject.id;
    Matter.Composite.add(engineRef.current.world, finalBody);
    Matter.Body.setPosition(finalBody, position);
    setBodies(prev => {
      const next = new Map(prev).set(previewObject.id, finalBody);
      bodiesRef.current = next;
      return next;
    });

    if (isPausedRef.current && !finalBody.isStatic) {
      Matter.Body.setStatic(finalBody, true);
      pausedDynamicLabelsRef.current.add(getBodyConfigKey(finalBody));
    }

    setPreviewObject(null);

    return previewObject.id;
  }, [previewObject, createBodyFromObject, resolveSpawnPosition]);

  const cancelPreview = useCallback(() => {
    if (!previewObject || !engineRef.current) return;
    Matter.Composite.remove(engineRef.current.world, previewObject.body);
    setPreviewObject(null);
  }, [previewObject]);

  const addBody = (obj: PhysicsObject) => {
    if (!engineRef.current) {
      console.error('❌ Cannot add body: No engine');
      return;
    }

    const body = createBodyFromObject(obj, false);
    if (!body) {
      console.error('❌ Failed to create body from object:', obj);
      return;
    }

    pushUndoSnapshot();
    (body as any).appBodyId = obj.id;
    Matter.Composite.add(engineRef.current.world, body);
    body.frictionAir = 0;
    setBodies(prev => {
      const next = new Map(prev).set(obj.id, body);
      bodiesRef.current = next;
      return next;
    });

    // Keep newly created dynamic bodies suspended while paused.
    if (isPausedRef.current && !body.isStatic) {
      Matter.Body.setStatic(body, true);
      pausedDynamicLabelsRef.current.add(getBodyConfigKey(body));
    }
    
    console.log('✅ Body added:', {
      id: obj.id,
      type: obj.type,
      label: body.label,
      position: body.position,
      totalBodies: bodies.size + 1
    });
    
    return body;
  };

  const addConstraint = (constraint: PhysicsConstraint) => {
    if (!engineRef.current) {
      console.error('❌ Cannot add constraint: No engine');
      return;
    }

    console.log('🔗 Attempting to create constraint:', constraint);

    const bodyA = Array.from(bodiesRef.current.values()).find(b => b.label === constraint.bodyA);
    const bodyB = Array.from(bodiesRef.current.values()).find(b => b.label === constraint.bodyB);

    if (!bodyA) {
      console.error('❌ Body A not found:', constraint.bodyA);
      console.log('Available bodies:', Array.from(bodiesRef.current.values()).map(b => b.label));
      return;
    }
    if (!bodyB) {
      console.error('❌ Body B not found:', constraint.bodyB);
      console.log('Available bodies:', Array.from(bodiesRef.current.values()).map(b => b.label));
      return;
    }

    console.log('✅ Found bodies:', {
      bodyA: { label: bodyA.label, pos: bodyA.position },
      bodyB: { label: bodyB.label, pos: bodyB.position }
    });

    const created = createConstraint(constraint, bodyA, bodyB);
    if (!created) {
      console.error('❌ Unknown constraint type:', constraint.type);
      return;
    }
    pushUndoSnapshot();
    const matterConstraint = created.constraint;
    if (created.spring) {
      springConfigRef.current.set(constraint.id, created.spring);
    }
    
    const isRope = constraint.type === 'rope';
    if (isRope) {
      // For ropes, we use custom force application for one-way (slack) behavior.
      // We set the native stiffness to 0 so it doesn't interfere.
      matterConstraint.stiffness = 0;
    }

    constraintConfigRef.current.set(constraint.id, {
      maxTension: constraint.maxTension,
      tension: 0,
      restLength: constraint.length ?? matterConstraint.length,
      stiffness: isRope ? 0.7 : undefined,
      type: constraint.type
    });

    Matter.Composite.add(engineRef.current.world, matterConstraint);
    setConstraints(prev => {
      const next = new Map(prev).set(constraint.id, matterConstraint);
      constraintsRef.current = next;
      return next;
    });
    
    console.log('✅ Constraint added to world:', {
      id: constraint.id,
      type: constraint.type,
      totalConstraints: constraints.size + 1,
      matterConstraint: {
        length: matterConstraint.length,
        stiffness: matterConstraint.stiffness,
        renderType: matterConstraint.render?.type,
        visible: matterConstraint.render?.visible
      }
    });

    // Verify it was added
    const worldConstraints = Matter.Composite.allConstraints(engineRef.current.world);
    console.log('🌍 Total constraints in world:', worldConstraints.length);
  };

  const disableMouseConstraint = useCallback(() => {
    const engine = engineRef.current;
    const mouseConstraint = mouseConstraintRef.current;
    if (!engine || !mouseConstraint || !mouseConstraintEnabledRef.current) return;

    Matter.Composite.remove(engine.world, mouseConstraint);
    mouseConstraintEnabledRef.current = false;
  }, []);

  const enableMouseConstraint = useCallback(() => {
    const engine = engineRef.current;
    const mouseConstraint = mouseConstraintRef.current;
    if (!engine || !mouseConstraint || mouseConstraintEnabledRef.current) return;

    Matter.Composite.add(engine.world, mouseConstraint);
    mouseConstraintEnabledRef.current = true;
  }, []);

  const removeBody = (id: string) => {
    if (!engineRef.current) return;
    const body = bodies.get(id);
    if (body) {
      pushUndoSnapshot();
      Matter.Composite.remove(engineRef.current.world, body);
      setBodies(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
    }
  };

  const clearWorld = () => {
    if (!engineRef.current) return;
    pushUndoSnapshot();
    Matter.Composite.clear(engineRef.current.world, false);
    const emptyBodies = new Map<string, Matter.Body>();
    const emptyConstraints = new Map<string, Matter.Constraint>();
    bodiesRef.current = emptyBodies;
    constraintsRef.current = emptyConstraints;
    forceConfigRef.current.clear();
    velocityConfigRef.current.clear();
    externalForceNewtonsRef.current.clear();
    externalDebugForcesRef.current.clear();
    internalDebugForcesRef.current.clear();
    pausedDebugVelocityRef.current.clear();
    previousVelocityRef.current.clear();
    restitutionPairsRef.current = [];
    massOverridesRef.current.clear();
    simulationTimeRef.current = 0;
    replaySnapshotsRef.current = [];
    replayIndexRef.current = 0;
    clearVelocityRecordingData();
    refreshReplayState();
    setBodies(emptyBodies);
    setConstraints(emptyConstraints);
    setPreviewObject(null);
  };

  const getAnalytics = (bodyId: string) => {
    const body = bodies.get(bodyId);
    if (!body) return null;

    const velocityMps = worldVelocityToMps(body.velocity);
    const velocity = Math.hypot(velocityMps.x, velocityMps.y);
    const mass = getFiniteBodyMass(body);
    const kineticEnergy = 0.5 * mass * velocity ** 2;
    const heightMeters = (600 - body.position.y) / WORLD_PIXELS_PER_METER;
    const potentialEnergy = mass * gravityValueRef.current * heightMeters;

    return {
      velocity,
      kineticEnergy,
      potentialEnergy,
      totalEnergy: kineticEnergy + potentialEnergy,
      position: body.position,
      angle: body.angle
    };
  };

  const getAllBodies = () => {
    return Array.from(bodies.entries()).map(([id, body]) => ({
      id,
      position: body.position,
      velocity: body.velocity,
      angle: body.angle,
      label: body.label,
      isStatic: body.isStatic
    }));
  };

  const getExperimentSnapshot = (): Pick<Experiment, 'objects' | 'constraints'> => {
    const snapshot = captureWorldSnapshot();
    const labelById = new Map(snapshot.bodies.map((body) => [body.id, body.label]));

    return {
      objects: snapshot.bodies.map((body) => ({
        id: body.id,
        type: body.type,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        radius: body.radius,
        isStatic: body.isStatic,
        color: body.color,
        label: body.label,
        angle: body.angle,
        velocity: body.velocity,
        angularVelocity: body.angularVelocity,
        mass: body.mass,
        friction: body.physicalFriction,
        restitution: body.physicalRestitution
      })),
      constraints: snapshot.constraints.map((constraint) => ({
        id: constraint.id,
        type: constraint.type,
        bodyA: labelById.get(constraint.bodyAId) ?? constraint.bodyAId,
        bodyB: labelById.get(constraint.bodyBId) ?? constraint.bodyBId,
        pointA: constraint.pointA,
        pointB: constraint.pointB,
        length: constraint.restLength ?? constraint.length,
        stiffness: constraint.stiffness,
        damping: constraint.damping,
        naturalLength: constraint.type === 'spring' ? constraint.length : undefined,
        springConstant: constraint.springConstant,
        maxTension: constraint.maxTension
      }))
    };
  };

  const resizeViewport = (width: number, height: number) => {
    if (!renderRef.current) return;
    const render = renderRef.current;
    render.canvas.width = width;
    render.canvas.height = height;
    render.options.width = width;
    render.options.height = height;
    render.bounds.max.x = width;
    render.bounds.max.y = height;
  };

  const setGravityValue = (value: number) => {
    gravityValueRef.current = value;
    if (!engineRef.current) return;
    if (!isPausedRef.current) {
      setWorldGravity(engineRef.current, value);
    }
  };

  const pauseSimulation = () => {
    if (!engineRef.current) return;
    isPausedRef.current = true;
    setWorldGravity(engineRef.current, 0);
    loopRef.current?.setPaused(true);
    finishVelocityRecording();

    const allBodies = Matter.Composite.allBodies(engineRef.current.world);
    pausedDynamicLabelsRef.current.clear();
    pausedDebugVelocityRef.current.clear();
    allBodies.forEach((body) => {
      if (!body.isStatic && body.label !== 'Mouse Constraint') {
        pausedDynamicLabelsRef.current.add(getBodyConfigKey(body));
        pausedDebugVelocityRef.current.set(body.id, { x: body.velocity.x, y: body.velocity.y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        Matter.Body.setStatic(body, true);
      }
    });
  };

  const startSimulation = () => {
    if (!engineRef.current) return;
    if (replayIndexRef.current < replaySnapshotsRef.current.length - 1) {
      replaySnapshotsRef.current = replaySnapshotsRef.current.slice(0, replayIndexRef.current + 1);
      refreshReplayState();
    }
    isPausedRef.current = false;
    simulationTimeRef.current = 0;
    beginVelocityRecording();
    setWorldGravity(engineRef.current, gravityValueRef.current);
    loopRef.current?.setPaused(false);

    const allBodies = Matter.Composite.allBodies(engineRef.current.world);
    allBodies.forEach((body) => {
      if (pausedDynamicLabelsRef.current.has(getBodyConfigKey(body))) {
        Matter.Body.setStatic(body, false);
        const overrideMass = massOverridesRef.current.get(getBodyConfigKey(body));
        if (overrideMass) {
          Matter.Body.setMass(body, Math.max(1e-12, overrideMass));
        }
        const velocityConfig = velocityConfigRef.current.get(getBodyConfigKey(body));
        if (velocityConfig?.enabled && velocityConfig.type === 'initial') {
          Matter.Body.setVelocity(body, speedMpsToWorldVelocity(velocityConfig.speed, velocityConfig.angleDeg, MAX_SPEED_MPS));
        }
      }
    });
    recordVelocitySamples(0);
    pausedDynamicLabelsRef.current.clear();
    pausedDebugVelocityRef.current.clear();
  };

  const getBodyByLabel = (label: string) => {
    const body = Array.from(bodies.values()).find(b => b.label === label);
    if (!body) return null;
    return {
      position: body.position,
      isStatic: body.isStatic,
      id: body.id,
      label: body.label
    };
  };

  const setBodyStaticByLabel = (label: string, isStatic: boolean) => {
    const body = Array.from(bodies.values()).find(b => b.label === label);
    if (body) {
      Matter.Body.setStatic(body, isStatic);
      console.log(`🔒 Body ${label} static set to:`, isStatic);
    }
  };

  const updateBodyMass = (bodyId: string, massKg: number) => {
    const body = bodies.get(bodyId);
    if (!body) return;
    pushUndoSnapshot();
    const safeMass = Math.max(1e-12, massKg);
    massOverridesRef.current.set(getBodyConfigKey(body), safeMass);

    // If paused bodies are static, temporarily unlock to set mass then restore.
    const wasStatic = body.isStatic;
    if (wasStatic) {
      Matter.Body.setStatic(body, false);
      applyMassKg(body, safeMass);
      Matter.Body.setStatic(body, true);
    } else {
      applyMassKg(body, safeMass);
    }
    console.log('⚖️ Mass updated:', { body: body.label, massKg: safeMass, wasStatic: body.isStatic });
  };

  const updateBodySurfaceProperties = (
    bodyId: string,
    updates: { restitution?: number; friction?: number }
  ) => {
    const body = bodiesRef.current.get(bodyId);
    if (!body) return;
    pushUndoSnapshot();

    const currentRestitution = Number.isFinite((body as any).physicalRestitution)
      ? (body as any).physicalRestitution
      : body.restitution;
    const currentFriction = Number.isFinite((body as any).physicalFriction)
      ? (body as any).physicalFriction
      : body.friction;
    const restitution = clampFinite(updates.restitution ?? currentRestitution, 0, 1, currentRestitution);
    const friction = clampFinite(updates.friction ?? currentFriction, 0, 5, currentFriction);
    (body as any).physicalRestitution = restitution;
    (body as any).physicalFriction = friction;
    Matter.Body.set(body, {
      restitution: 0,
      friction: 0,
      frictionStatic: 0
    });
    body.frictionAir = 0;
    setPhysicsConfigRevision((v) => v + 1);
  };

  const updateEnvironmentPhysics = (updates: Partial<EnvironmentPhysicsConfig>) => {
    pushUndoSnapshot();
    environmentPhysicsRef.current = {
      ...environmentPhysicsRef.current,
      ...updates,
      dragCoefficient: clampFinite(updates.dragCoefficient ?? environmentPhysicsRef.current.dragCoefficient, 0, 5, environmentPhysicsRef.current.dragCoefficient),
      airDensity: clampFinite(updates.airDensity ?? environmentPhysicsRef.current.airDensity, 0, 20, environmentPhysicsRef.current.airDensity)
    };
    bodiesRef.current.forEach((body) => {
      body.frictionAir = 0;
    });
    setPhysicsConfigRevision((v) => v + 1);
  };

  const updateBodyForceConfig = (bodyId: string, updates: Partial<ForceConfig>) => {
    const body = bodiesRef.current.get(bodyId);
    if (!body) return;
    pushUndoSnapshot();
    const key = getBodyConfigKey(body);
    const current = forceConfigRef.current.get(key) ?? defaultForceConfig;
    forceConfigRef.current.set(key, {
      ...current,
      ...updates,
      magnitude: clampFinite(updates.magnitude ?? current.magnitude, -MAX_FORCE_NEWTONS, MAX_FORCE_NEWTONS, current.magnitude),
      angleDeg: clampFinite(updates.angleDeg ?? current.angleDeg, -3600, 3600, current.angleDeg),
      startTime: clampFinite(updates.startTime ?? current.startTime, 0, 3600, current.startTime),
      endTime: clampFinite(updates.endTime ?? current.endTime, 0, 3600, current.endTime)
    });
    setPhysicsConfigRevision((v) => v + 1);
  };

  const updateBodyVelocityConfig = (bodyId: string, updates: Partial<VelocityConfig>) => {
    const body = bodiesRef.current.get(bodyId);
    if (!body) return;
    pushUndoSnapshot();
    const key = getBodyConfigKey(body);
    const current = velocityConfigRef.current.get(key) ?? defaultVelocityConfig;
    const next = {
      ...current,
      ...updates,
      speed: clampFinite(updates.speed ?? current.speed, -MAX_SPEED_MPS, MAX_SPEED_MPS, current.speed),
      angleDeg: clampFinite(updates.angleDeg ?? current.angleDeg, -3600, 3600, current.angleDeg)
    };
    velocityConfigRef.current.set(key, next);
    if (!isPausedRef.current && next.enabled && next.type === 'initial') {
      Matter.Body.setVelocity(body, speedMpsToWorldVelocity(next.speed, next.angleDeg, MAX_SPEED_MPS));
    }
    setPhysicsConfigRevision((v) => v + 1);
  };

  const getStoredBodyWidth = (body: Matter.Body) => {
    const storedWidth = (body as any).appBodyWidth;
    if (Number.isFinite(storedWidth) && storedWidth > 0) return storedWidth;
    if (body.vertices.length < 2) return body.bounds.max.x - body.bounds.min.x;

    let longestEdge = 0;
    for (let i = 0; i < body.vertices.length; i++) {
      const current = body.vertices[i];
      const next = body.vertices[(i + 1) % body.vertices.length];
      const edgeLength = Math.hypot(next.x - current.x, next.y - current.y);
      longestEdge = Math.max(longestEdge, edgeLength);
    }
    return longestEdge || (body.bounds.max.x - body.bounds.min.x);
  };

  const getStoredBodyHeight = (body: Matter.Body) => {
    const storedHeight = (body as any).appBodyHeight;
    if (Number.isFinite(storedHeight) && storedHeight > 0) return storedHeight;
    if (body.vertices.length < 2) return body.bounds.max.y - body.bounds.min.y;

    let shortestEdge = Infinity;
    for (let i = 0; i < body.vertices.length; i++) {
      const current = body.vertices[i];
      const next = body.vertices[(i + 1) % body.vertices.length];
      const edgeLength = Math.hypot(next.x - current.x, next.y - current.y);
      if (edgeLength > 0) shortestEdge = Math.min(shortestEdge, edgeLength);
    }
    return Number.isFinite(shortestEdge) ? shortestEdge : body.bounds.max.y - body.bounds.min.y;
  };

  const getGroundAngleDeg = (body: Matter.Body) => {
    const rawDegrees = body.angle * 180 / Math.PI;
    const normalized = ((rawDegrees % 360) + 360) % 360;
    return normalized > 180 ? normalized - 180 : normalized;
  };

  const updateGroundProperties = (
    bodyId: string,
    updates: { angleDeg?: number; length?: number }
  ): GroundPropertiesResult => {
    const body = bodiesRef.current.get(bodyId);
    if (!body || !body.label.toLowerCase().includes('ground')) {
      return { success: false, reason: 'Ground object not found' };
    }

    const currentWidth = getStoredBodyWidth(body);
    const currentHeight = getStoredBodyHeight(body);
    const nextLength = updates.length ?? currentWidth;
    const nextAngleDeg = updates.angleDeg ?? getGroundAngleDeg(body);

    if (!Number.isFinite(nextAngleDeg) || nextAngleDeg < 0 || nextAngleDeg > 180) {
      return { success: false, reason: 'Angle must be between 0 and 180 degrees' };
    }
    if (!Number.isFinite(nextLength) || nextLength <= 0 || !Number.isFinite(currentWidth) || currentWidth <= 0) {
      return { success: false, reason: 'Ground length must be greater than zero' };
    }

    try {
      pushUndoSnapshot();
      const nextAngleRad = nextAngleDeg * Math.PI / 180;
      Matter.Body.setAngle(body, 0);
      const lengthScale = nextLength / currentWidth;
      if (Math.abs(lengthScale - 1) > 1e-6) {
        Matter.Body.scale(body, lengthScale, 1, body.position);
      }
      Matter.Body.setAngle(body, nextAngleRad);
      (body as any).appBodyWidth = nextLength;
      (body as any).appBodyHeight = currentHeight;
      setBodies((prev) => {
        const next = new Map(prev);
        next.set(bodyId, body);
        bodiesRef.current = next;
        return next;
      });
      setPhysicsConfigRevision((v) => v + 1);
      return { success: true };
    } catch (error) {
      console.error('Ground geometry update failed:', error);
      return { success: false, reason: 'Ground geometry update failed' };
    }
  };

  const getBodyDetails = (bodyId: string) => {
    const body = bodies.get(bodyId);
    if (!body) return null;
    const lowerLabel = body.label.toLowerCase();
    const infrastructureStatic =
      lowerLabel.includes('ground') ||
      lowerLabel.includes('anchor') ||
      lowerLabel.includes('pivot');
    const key = getBodyConfigKey(body);
    const wasDynamicBeforePause = pausedDynamicLabelsRef.current.has(key);
    const canEditMass = !infrastructureStatic && (!body.isStatic || wasDynamicBeforePause);
    const canEditMotion = !infrastructureStatic && (!body.isStatic || wasDynamicBeforePause);

    return {
      id: bodyId,
      label: body.label,
      mass: getFiniteBodyMass(body),
      restitution: Number.isFinite((body as any).physicalRestitution)
        ? (body as any).physicalRestitution
        : body.restitution,
      friction: Number.isFinite((body as any).physicalFriction)
        ? (body as any).physicalFriction
        : body.friction,
      isStatic: body.isStatic,
      position: body.position,
      canEditMass,
      canEditMotion,
      isGround: lowerLabel.includes('ground'),
      groundLength: lowerLabel.includes('ground') ? getStoredBodyWidth(body) : undefined,
      groundAngleDeg: lowerLabel.includes('ground') ? getGroundAngleDeg(body) : undefined,
      forceConfig: forceConfigRef.current.get(key) ?? defaultForceConfig,
      velocityConfig: velocityConfigRef.current.get(key) ?? defaultVelocityConfig
    };
  };

  const getBodyLabelById = (bodyId: string) => {
    return bodiesRef.current.get(bodyId)?.label ?? null;
  };

  const updateSpringProperties = (
    constraintId: string,
    updates: { naturalLength?: number; springConstant?: number }
  ) => {
    const constraint = constraints.get(constraintId) ?? constraintsRef.current.get(constraintId);
    if (!constraint) return;
    pushUndoSnapshot();
    const prev = springConfigRef.current.get(constraintId) ?? {
      naturalLength: constraint.length,
      springConstant: 40,
      dampingRatio: 0
    };
    const next = {
      naturalLength: updates.naturalLength ?? prev.naturalLength,
      springConstant: updates.springConstant ?? prev.springConstant,
      dampingRatio: prev.dampingRatio
    };
    springConfigRef.current.set(constraintId, next);
    constraint.length = next.naturalLength;
    constraint.stiffness = 0;
    setPhysicsConfigRevision((v) => v + 1);
  };

  const updateRopeProperties = (
    constraintId: string,
    updates: { length?: number; maxTension?: number }
  ) => {
    const constraint = constraints.get(constraintId) ?? constraintsRef.current.get(constraintId);
    if (!constraint) return;
    pushUndoSnapshot();
    
    if (updates.length !== undefined) {
      constraint.length = updates.length;
      const config = constraintConfigRef.current.get(constraintId) || { tension: 0 };
      config.restLength = updates.length;
      constraintConfigRef.current.set(constraintId, config);
    }
    
    if (Object.prototype.hasOwnProperty.call(updates, 'maxTension')) {
      const config = constraintConfigRef.current.get(constraintId) || { tension: 0 };
      config.maxTension = updates.maxTension;
      constraintConfigRef.current.set(constraintId, config);
    }
    setPhysicsConfigRevision((v) => v + 1);
  };

  const updateRopeMaxTension = (constraintId: string, maxTension: number) => {
    pushUndoSnapshot();
    const config = constraintConfigRef.current.get(constraintId) || { tension: 0 };
    config.maxTension = maxTension;
    constraintConfigRef.current.set(constraintId, config);
    setPhysicsConfigRevision((v) => v + 1);
  };

  const getConstraintDetails = (constraintId: string) => {
    const constraint = constraints.get(constraintId);
    if (!constraint || !constraint.bodyA || !constraint.bodyB) return null;
    const type = constraint.length === 0 ? 'pivot' : constraint.render?.type === 'spring' ? 'spring' : 'rope';
    const start = getWorldConstraintPoint(constraint.bodyA, constraint.pointA);
    const end = getWorldConstraintPoint(constraint.bodyB, constraint.pointB);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy);

    const springCfg = springConfigRef.current.get(constraintId);
    const naturalLength = springCfg?.naturalLength ?? constraint.length;
    const springConstant = springCfg?.springConstant ?? 40;
    const delta = currentLength - naturalLength;

    const config = constraintConfigRef.current.get(constraintId);
    const getDisplayedExternalAcceleration = (body: Matter.Body): Matter.Vector => {
      if (body.isStatic) return { x: 0, y: 0 };
      const force = externalForceNewtonsRef.current.get(body.id) ?? { fx: 0, fy: 0 };
      const mass = Math.max(body.mass, 1e-12);
      return {
        x: force.fx / mass,
        y: force.fy / mass + (isPausedRef.current ? 0 : gravityValueRef.current)
      };
    };
    const tension = type === 'rope'
      ? calculateRopeTension({
        bodyA: constraint.bodyA,
        bodyB: constraint.bodyB,
        pointA: constraint.pointA,
        pointB: constraint.pointB,
        restLength: config?.restLength ?? constraint.length,
        externalAccelerationA: getDisplayedExternalAcceleration(constraint.bodyA),
        externalAccelerationB: getDisplayedExternalAcceleration(constraint.bodyB),
        slackTolerancePx: ROPE_LENGTH_SLOP_PX
      })
      : config?.tension ?? 0;

    return {
      id: constraintId,
      type,
      bodyA: constraint.bodyA.label,
      bodyB: constraint.bodyB.label,
      currentLength,
      naturalLength,
      springConstant,
      extension: delta > 0 ? delta : 0,
      compression: delta < 0 ? Math.abs(delta) : 0,
      tension,
      maxTension: config?.maxTension
    };
  };

  const applyRemoteUpdate = (update: RemoteUpdate) => {
    remoteUpdatesRef.current.set(update.id, update);
  };

  const applyInstantaneousForce = (bodyId: string, magnitudeNs: number, angleDeg: number) => {
    const body = bodiesRef.current.get(bodyId);
    if (!body || body.isStatic) return;
    const key = getBodyConfigKey(body);
    forceConfigRef.current.set(key, {
      enabled: true,
      type: 'instantaneous',
      magnitude: magnitudeNs,
      angleDeg,
      startTime: 0,
      endTime: 0,
      variableMode: 't',
      expression: '0'
    });
    setPhysicsConfigRevision((v) => v + 1);
  };

  return {
    engine: engineRef.current,
    addBody,
    addConstraint,
    removeBody,
    clearWorld,
    bodies,
    constraints,
    selectedBody,
    setSelectedBody,
    getAnalytics,
    getAllBodies,
    getBodyIdAtPoint,
    getExperimentSnapshot,
    getBodyByLabel,
    setBodyStaticByLabel,
    selectedBodyLabel,
    selectedConstraintId,
    getBodyDetails,
    getBodyLabelById,
    updateBodyMass,
    updateBodySurfaceProperties,
    updateGroundProperties,
    updateEnvironmentPhysics,
    updateBodyForceConfig,
    updateBodyVelocityConfig,
    environmentPhysics: environmentPhysicsRef.current,
    getConstraintDetails,
    updateSpringProperties,
    updateRopeProperties,
    updateRopeMaxTension,
    resizeViewport,
    setGravityValue,
    pauseSimulation,
    startSimulation,
    startPreview,
    finalizePreview,
    cancelPreview,
    hasPreview: previewObject !== null,
    previewObject,
    disableMouseConstraint,
    enableMouseConstraint,
    applyRemoteUpdate,
    applyInstantaneousForce,
    applyDistancePlacement,
    setDistanceToolActive,
    setDistanceToolSelection,
    undo,
    redo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    replayIndex: replayState.index,
    replayMax: replayState.max,
    replayTime: replayState.time,
    setReplayIndex,
    velocityPlotState,
    getVelocityPlotData,
    playbackSpeed,
    setPlaybackSpeed,
    showAllVelocities: overlayState.showAllVelocities,
    setShowAllVelocities,
    showAllForces: overlayState.showAllForces,
    setShowAllForces
  };
};
