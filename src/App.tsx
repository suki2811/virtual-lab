import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Undo2, Redo2 } from 'lucide-react';
import { usePhysics } from './hooks/usePhysics';
import { useWebSocket } from './hooks/useWebSocket';
import Toolbar from './components/Toolbar';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ExperimentLibrary from './components/ExperimentLibrary';
import RoomManager from './components/RoomManager';
import InstructionsPanel from './components/InstructionsPanel';
import WelcomeScreen from './components/WelcomeScreen';
import PhysicsDebug from './components/PhysicsDebug';
import SpringPreview from './components/SpringPreview';
import PhysicsCanvas from './components/PhysicsCanvas';
import VelocityPlotsModal from './components/VelocityPlotsModal';
import { PhysicsObject, PhysicsConstraint, Experiment } from './types/physics';
import { VelocityPlotData } from './types/velocityPlot';
import {
  DEFAULT_BODY_FRICTION,
  DEFAULT_BODY_MASS_KG,
  DEFAULT_BODY_RESTITUTION,
  WORLD_PIXELS_PER_METER
} from './physics/constants';
import { saveExperiment } from './utils/experimentsApi';
import { v4 as uuidv4 } from 'uuid';

type ActiveTool = 'box' | 'circle' | 'ground' | 'pivot' | 'rope' | 'spring' | 'distance' | null;
type GroundLengthMode = 'full' | 'custom';

type DistanceSelection = {
  referenceId: string | null;
  targetId: string | null;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // WebSocket setup (must be declared before usePhysics so emitPhysicsUpdate/onPhysicsUpdate are in scope)
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const {
    connected,
    users,
    emitObjectAdded,
    onObjectAdded,
    onConstraintAdded,
    emitPhysicsUpdate,
    onPhysicsUpdate
  } = useWebSocket(roomId, userName);

  useEffect(() => {
    setIsConnected(connected);
  }, [connected]);

  const {
    addBody,
    addConstraint,
    clearWorld,
    selectedBody,
    selectedBodyLabel,
    selectedConstraintId,
    getAnalytics,
    getAllBodies,
    getBodyIdAtPoint,
    getExperimentSnapshot,
    getBodyDetails,
    getBodyLabelById,
    updateBodyMass,
    updateBodySurfaceProperties,
    updateGroundProperties,
    updateEnvironmentPhysics,
    updateBodyForceConfig,
    updateBodyVelocityConfig,
    environmentPhysics,
    getConstraintDetails,
    updateSpringProperties,
    updateRopeProperties,
    resizeViewport,
    setGravityValue,
    pauseSimulation,
    startSimulation,
    startPreview,
    finalizePreview,
    cancelPreview,
    hasPreview,
    bodies,
    constraints,
    engine,
    disableMouseConstraint,
    enableMouseConstraint,
    applyRemoteUpdate,
    applyInstantaneousForce,
    applyDistancePlacement,
    setDistanceToolActive,
    setDistanceToolSelection,
    undo,
    redo,
    canUndo,
    canRedo,
    replayIndex,
    replayMax,
    replayTime,
    setReplayIndex,
    velocityPlotState,
    getVelocityPlotData,
    playbackSpeed,
    setPlaybackSpeed,
    showAllVelocities,
    setShowAllVelocities,
    showAllForces,
    setShowAllForces
  } = usePhysics(canvasRef, {
    onSyncState: (updates) => {
      if (isConnected) {
        emitPhysicsUpdate(updates);
      }
    }
  });

  // Handle incoming physics updates from other users
  useEffect(() => {
    if (isConnected) {
      onPhysicsUpdate((updates: any[]) => {
        if (Array.isArray(updates)) {
          updates.forEach((update) => {
            applyRemoteUpdate(update);
          });
        }
      });
    }
  }, [isConnected, applyRemoteUpdate]);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showVelocityPlots, setShowVelocityPlots] = useState(false);
  const [velocityPlotData, setVelocityPlotData] = useState<VelocityPlotData | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [libraryMode, setLibraryMode] = useState<'save' | 'load'>('load');
  const [currentExperiment, setCurrentExperiment] = useState<Experiment | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [gravityValue, setGravityValueState] = useState<0 | 9.8 | 10>(9.8);
  const [massValue, setMassValue] = useState(String(DEFAULT_BODY_MASS_KG));
  const [massUnit, setMassUnit] = useState('kg');
  const [restitutionValue, setRestitutionValue] = useState(String(DEFAULT_BODY_RESTITUTION));
  const [frictionValue, setFrictionValue] = useState(String(DEFAULT_BODY_FRICTION));
  const [neglectAirResistance, setNeglectAirResistance] = useState(environmentPhysics.neglectAirResistance);
  const [dragCoefficientValue, setDragCoefficientValue] = useState(String(environmentPhysics.dragCoefficient));
  const [airDensityValue, setAirDensityValue] = useState(String(environmentPhysics.airDensity));
  const [forceEnabled, setForceEnabled] = useState(false);
  const [forceType, setForceType] = useState<'constant' | 'timed' | 'variable' | 'instantaneous'>('constant');
  const [forceMagnitudeValue, setForceMagnitudeValue] = useState('0');
  const [forceAngleValue, setForceAngleValue] = useState('0');
  const [forceStartValue, setForceStartValue] = useState('0');
  const [forceEndValue, setForceEndValue] = useState('1');
  const [forceVariableMode, setForceVariableMode] = useState<'t' | 'x' | 'x_t'>('t');
  const [forceExpression, setForceExpression] = useState('0');
  const [velocityEnabled, setVelocityEnabled] = useState(false);
  const [velocityType, setVelocityType] = useState<'constant' | 'initial' | 'variable'>('initial');
  const [velocitySpeedValue, setVelocitySpeedValue] = useState('0');
  const [velocityAngleValue, setVelocityAngleValue] = useState('0');
  const [velocityVariableMode, setVelocityVariableMode] = useState<'t' | 'x' | 'x_t'>('t');
  const [velocityExpression, setVelocityExpression] = useState('0');
  const [naturalLengthValue, setNaturalLengthValue] = useState('1');
  const [naturalLengthUnit, setNaturalLengthUnit] = useState<'mm' | 'cm' | 'm'>('m');
  const [springConstantValue, setSpringConstantValue] = useState('40');
  const [maxTensionValue, setMaxTensionValue] = useState('0');
  const [liveConstraintDetails, setLiveConstraintDetails] = useState<ReturnType<typeof getConstraintDetails> | null>(null);
  const [massDrafts, setMassDrafts] = useState<Record<string, { value: string; unit: string }>>({});
  const [springDrafts, setSpringDrafts] = useState<Record<string, { naturalLengthValue: string; naturalLengthUnit: 'mm' | 'cm' | 'm'; springConstantValue: string }>>({});
  const [selectedTool, setSelectedTool] = useState<ActiveTool>(null);
  const [ropeDrawing, setRopeDrawing] = useState<{
    isDrawing: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startBody: string | null;
  } | null>(null);
  const [distanceSelection, setDistanceSelection] = useState<DistanceSelection>({
    referenceId: null,
    targetId: null
  });
  const [distanceDxValue, setDistanceDxValue] = useState('0');
  const [distanceDyValue, setDistanceDyValue] = useState('0');
  const [showDistanceDialog, setShowDistanceDialog] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [showGroundSettingsDialog, setShowGroundSettingsDialog] = useState(false);
  const [groundAngleValue, setGroundAngleValue] = useState('0');
  const [groundLengthMode, setGroundLengthMode] = useState<GroundLengthMode>('full');
  const [groundLengthValue, setGroundLengthValue] = useState('5');
  const [groundSettingsError, setGroundSettingsError] = useState<string | null>(null);
  const [groundEditAngleValue, setGroundEditAngleValue] = useState('0');
  const [groundEditLengthValue, setGroundEditLengthValue] = useState('5');
  const [groundEditError, setGroundEditError] = useState<string | null>(null);

  // === REFS to mirror state for use inside event handlers (prevents stale closures) ===
  const selectedToolRef = useRef<ActiveTool>(null);
  const ropeDrawingRef = useRef<typeof ropeDrawing>(null);
  const distanceSelectionRef = useRef<DistanceSelection>({ referenceId: null, targetId: null });
  const showGroundSettingsDialogRef = useRef(false);
  const hasPreviewRef = useRef(false);

  useEffect(() => { selectedToolRef.current = selectedTool; }, [selectedTool]);
  useEffect(() => { ropeDrawingRef.current = ropeDrawing; }, [ropeDrawing]);
  useEffect(() => { distanceSelectionRef.current = distanceSelection; }, [distanceSelection]);
  useEffect(() => { showGroundSettingsDialogRef.current = showGroundSettingsDialog; }, [showGroundSettingsDialog]);
  useEffect(() => { hasPreviewRef.current = hasPreview; }, [hasPreview]);

  useEffect(() => {
    const isDistanceToolActive = selectedTool === 'distance';
    setDistanceToolActive(isDistanceToolActive);

    if (selectedTool === 'rope' || selectedTool === 'spring' || isDistanceToolActive) {
      disableMouseConstraint();
    } else {
      enableMouseConstraint();
    }
  }, [selectedTool, disableMouseConstraint, enableMouseConstraint, setDistanceToolActive]);

  useEffect(() => {
    if (selectedTool === 'distance') return;
    setDistanceSelection({ referenceId: null, targetId: null });
    distanceSelectionRef.current = { referenceId: null, targetId: null };
    setDistanceToolSelection(null, null);
    setShowDistanceDialog(false);
    setDistanceError(null);
  }, [selectedTool, setDistanceToolSelection]);

  useEffect(() => {
    if (selectedTool === 'ground') return;
    setShowGroundSettingsDialog(false);
    setGroundSettingsError(null);
  }, [selectedTool]);

  // Listen for remote object additions
  useEffect(() => {
    onObjectAdded((object: PhysicsObject) => {
      addBody(object);
    });

    onConstraintAdded((constraint: PhysicsConstraint) => {
      addConstraint(constraint);
    });
  }, []);

  const clearDistanceToolState = () => {
    const emptySelection = { referenceId: null, targetId: null };
    setDistanceSelection(emptySelection);
    distanceSelectionRef.current = emptySelection;
    setDistanceToolSelection(null, null);
    setShowDistanceDialog(false);
    setDistanceDxValue('0');
    setDistanceDyValue('0');
    setDistanceError(null);
  };

  const handleAddBox = () => {
    // TOOL ISOLATION: only place a box, no rope/spring/pivot logic
    setSelectedTool('box');
    setRopeDrawing(null);
    const canvasWidth = canvasRef.current?.clientWidth || 800;
    const obj: PhysicsObject = {
      id: uuidv4(),
      type: 'box',
      x: canvasWidth / 2,
      y: 100,
      width: 80,
      height: 80,
      color: '#e74c3c',
      label: `box-${Date.now()}`
    };
    console.log('📦 Creating box preview:', obj);
    startPreview(obj);
  };

  const handleAddCircle = () => {
    // TOOL ISOLATION: only place a circle, no rope/spring/pivot logic
    setSelectedTool('circle');
    setRopeDrawing(null);
    const canvasWidth = canvasRef.current?.clientWidth || 800;
    const obj: PhysicsObject = {
      id: uuidv4(),
      type: 'circle',
      x: canvasWidth / 2,
      y: 100,
      radius: 40,
      color: '#3498db',
      label: `circle-${Date.now()}`
    };
    console.log('⚪ Creating circle preview:', obj);
    startPreview(obj);
  };

  const handleAddGround = () => {
    // TOOL ISOLATION: only place ground
    setSelectedTool('ground');
    setRopeDrawing(null);
    setGroundAngleValue('0');
    setGroundLengthMode('full');
    setGroundLengthValue('5');
    setGroundSettingsError(null);
    setShowGroundSettingsDialog(true);
  };

  const cancelGroundSettings = () => {
    setShowGroundSettingsDialog(false);
    setGroundSettingsError(null);
    setSelectedTool(null);
  };

  const createGroundPreviewFromSettings = () => {
    const canvasWidth = canvasRef.current?.clientWidth || 800;
    const canvasHeight = canvasRef.current?.clientHeight || 600;
    const angleDeg = Number.parseFloat(groundAngleValue);
    if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 180) {
      setGroundSettingsError('Angle must be between 0 and 180 degrees.');
      return;
    }

    let width = canvasWidth;
    if (groundLengthMode === 'custom') {
      const lengthMeters = Number.parseFloat(groundLengthValue);
      if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
        setGroundSettingsError('Ground length must be greater than zero.');
        return;
      }
      width = metersToWorldLength(lengthMeters);
    }

    if (!Number.isFinite(width) || width <= 0) {
      setGroundSettingsError('Ground creation failed due to invalid geometry.');
      return;
    }

    const obj: PhysicsObject = {
      id: uuidv4(),
      type: 'ground',
      x: canvasWidth / 2,
      y: canvasHeight - 30,
      width,
      height: 60,
      isStatic: true,
      color: '#2c3e50',
      angle: angleDeg * Math.PI / 180,
      label: `ground-${Date.now()}`
    };
    setGroundSettingsError(null);
    setShowGroundSettingsDialog(false);
    startPreview(obj);
  };

  const handleAddRope = () => {
    console.log('🟡 Rope tool selected - DRAG MODE');
    console.log('📍 Click and drag to create rope');
    
    // Just set the tool mode, no preview
    setSelectedTool('rope');
    setRopeDrawing(null); // Reset any previous drawing state
  };

  const handleAddSpring = () => {
    console.log('🟣 Spring tool selected - DRAG MODE');
    console.log('📍 Click and drag to create spring');
    
    // Just set the tool mode, no preview
    setSelectedTool('spring');
    setRopeDrawing(null); // Reset any previous drawing state
  };

  const handleAddPivot = () => {
    console.log('🟠 Pivot tool selected - PLACE ONLY, no auto-connection');
    
    // TOOL ISOLATION: pivot tool ONLY places a static anchor dot.
    // NO automatic rope/spring/constraint creation.
    setSelectedTool('pivot');
    setRopeDrawing(null);
    
    const pivotObj: PhysicsObject = {
      id: uuidv4(),
      type: 'circle',
      x: 400,
      y: 300,
      radius: 8,
      isStatic: true,
      color: '#000000',
      label: `pivot-${Date.now()}`
    };
    
    console.log('📍 Creating pivot preview (anchor only, no constraint)');
    startPreview(pivotObj);
  };

  const handleDistanceTool = () => {
    if (hasPreview) {
      cancelPreview();
    }
    setDistanceToolActive(true);
    setSelectedTool('distance');
    setRopeDrawing(null);
    clearDistanceToolState();
  };

  // AUTO-CONNECTION LOGIC REMOVED
  // Constraints are ONLY created via explicit rope/spring tool drag workflow.
  // No automatic connection on body selection, spawn, or proximity.

  const handleClear = () => {
    clearDistanceToolState();
    setSelectedTool(null);
    clearWorld();
    setCurrentExperiment(null);
  };

  const handleSave = async (name: string, description: string) => {
    const snapshot = getExperimentSnapshot();
    const experiment: Experiment = {
      id: uuidv4(),
      name,
      description,
      objects: snapshot.objects,
      constraints: snapshot.constraints,
      createdAt: new Date()
    };

    const savedExperiment = await saveExperiment(experiment);
    setCurrentExperiment(savedExperiment);
  };

  const handleLoad = (experiment: Experiment) => {
    clearDistanceToolState();
    setSelectedTool(null);
    clearWorld();
    
    // Add objects
    experiment.objects.forEach(obj => {
      addBody(obj);
    });

    // Add constraints
    setTimeout(() => {
      experiment.constraints.forEach(constraint => {
        addConstraint(constraint);
      });
    }, 100);

    setCurrentExperiment(experiment);
  };

  const handleJoinRoom = (newRoomId: string, newUserName: string) => {
    setRoomId(newRoomId);
    setUserName(newUserName);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      pauseSimulation();
    } else {
      setIsPlaying(true);
      startSimulation();
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    pauseSimulation();
  };

  const handleStart = () => {
    setIsPlaying(true);
    startSimulation();
  };

  const handleShowVelocityPlots = () => {
    setVelocityPlotData(getVelocityPlotData());
    setShowVelocityPlots(true);
  };

  const handleGravityChange = (value: 0 | 9.8 | 10) => {
    setGravityValueState(value);
    setGravityValue(value);
  };

  const handleUndo = () => {
    undo();
    console.log('↩️ Undo clicked');
  };

  const handleRedo = () => {
    redo();
    console.log('↪️ Redo clicked');
  };

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [undo, redo]);

  const MASS_TO_KG: Record<string, number> = {
    pg: 1e-15,
    ng: 1e-12,
    'µg': 1e-9,
    mg: 1e-6,
    g: 1e-3,
    kg: 1,
    t: 1e3,
    Mg: 1e3,
    Gg: 1e6
  };

  const LENGTH_TO_M: Record<'mm' | 'cm' | 'm', number> = {
    mm: 1e-3,
    cm: 1e-2,
    m: 1
  };

  const selectedBodyDetails = selectedBody ? getBodyDetails(selectedBody) : null;
  const selectedConstraintDetails = selectedConstraintId ? getConstraintDetails(selectedConstraintId) : null;

  useEffect(() => {
    if (!selectedBody) return;
    const details = getBodyDetails(selectedBody);
    if (!details) return;

    setRestitutionValue(trimTrailingZeros(details.restitution.toFixed(3)));
    setFrictionValue(trimTrailingZeros(details.friction.toFixed(3)));
    setForceEnabled(details.forceConfig.enabled);
    setForceType(details.forceConfig.type);
    setForceMagnitudeValue(trimTrailingZeros(details.forceConfig.magnitude.toFixed(3)));
    setForceAngleValue(trimTrailingZeros(details.forceConfig.angleDeg.toFixed(3)));
    setForceStartValue(trimTrailingZeros(details.forceConfig.startTime.toFixed(3)));
    setForceEndValue(trimTrailingZeros(details.forceConfig.endTime.toFixed(3)));
    setForceVariableMode(details.forceConfig.variableMode);
    setForceExpression(details.forceConfig.expression);
    setVelocityEnabled(details.velocityConfig.enabled);
    setVelocityType(details.velocityConfig.type);
    setVelocitySpeedValue(trimTrailingZeros(details.velocityConfig.speed.toFixed(3)));
    setVelocityAngleValue(trimTrailingZeros(details.velocityConfig.angleDeg.toFixed(3)));
    setVelocityVariableMode(details.velocityConfig.variableMode);
    setVelocityExpression(details.velocityConfig.expression);

    if (details.isGround) {
      const angleDeg = Number.isFinite(details.groundAngleDeg) ? details.groundAngleDeg ?? 0 : 0;
      const lengthWorld = Number.isFinite(details.groundLength)
        ? details.groundLength ?? (canvasRef.current?.clientWidth || WORLD_PIXELS_PER_METER)
        : canvasRef.current?.clientWidth || WORLD_PIXELS_PER_METER;
      setGroundEditAngleValue(trimTrailingZeros(angleDeg.toFixed(3)));
      setGroundEditLengthValue(trimTrailingZeros(worldLengthToMeters(lengthWorld).toFixed(3)));
      setGroundEditError(null);
    }

    if (!details.canEditMass) return;

    const draft = massDrafts[details.id];
    if (draft) {
      setMassUnit(draft.unit);
      setMassValue(draft.value);
    } else {
      setMassUnit('kg');
      setMassValue(trimTrailingZeros(details.mass.toFixed(3)));
    }
  }, [selectedBody]);

  useEffect(() => {
    if (!selectedConstraintId) return;
    const details = getConstraintDetails(selectedConstraintId);
    if (!details) return;

    if (details.type === 'spring') {
      const draft = springDrafts[details.id];
      if (draft) {
        setNaturalLengthUnit(draft.naturalLengthUnit);
        setNaturalLengthValue(draft.naturalLengthValue);
        setSpringConstantValue(draft.springConstantValue);
      } else {
        setNaturalLengthUnit('m');
        setNaturalLengthValue(trimTrailingZeros(worldLengthToMeters(details.naturalLength).toFixed(3)));
        setSpringConstantValue(trimTrailingZeros(details.springConstant.toFixed(3)));
      }
    } else if (details.type === 'rope') {
      setNaturalLengthUnit('m');
      setNaturalLengthValue(trimTrailingZeros(worldLengthToMeters(details.naturalLength).toFixed(3)));
      setMaxTensionValue(details.maxTension ? trimTrailingZeros(details.maxTension.toFixed(3)) : '0');
    }
  }, [selectedConstraintId]);

  useEffect(() => {
    if (!selectedConstraintId) {
      setLiveConstraintDetails(null);
      return;
    }
    const tick = () => {
      const details = getConstraintDetails(selectedConstraintId);
      setLiveConstraintDetails(details);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [selectedConstraintId, getConstraintDetails]);

  const applyMassUpdate = () => {
    if (!selectedBodyDetails || !selectedBodyDetails.canEditMass) return;
    if (!massValue.trim()) return;
    const raw = Number.parseFloat(massValue);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const kg = raw * MASS_TO_KG[massUnit];
    updateBodyMass(selectedBodyDetails.id, kg);
    console.log('✅ Save Mass applied:', { body: selectedBodyDetails.label, raw, unit: massUnit, kg });
    setMassDrafts((prev) => ({
      ...prev,
      [selectedBodyDetails.id]: {
        value: trimTrailingZeros(raw.toFixed(3)),
        unit: massUnit
      }
    }));
    setMassValue(trimTrailingZeros(raw.toFixed(3)));
  };

  const parseInput = (value: string, fallback: number) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const handleDistanceBodySelection = (bodyId: string) => {
    setDistanceError(null);
    const currentSelection = distanceSelectionRef.current;

    if (!currentSelection.referenceId) {
      const nextSelection = { referenceId: bodyId, targetId: null };
      setDistanceSelection(nextSelection);
      distanceSelectionRef.current = nextSelection;
      setDistanceToolSelection(bodyId, null);
      return;
    }

    if (bodyId === currentSelection.referenceId) {
      setDistanceError('Select a different body as the target.');
      return;
    }

    const nextSelection = {
      referenceId: currentSelection.referenceId,
      targetId: bodyId
    };
    setDistanceSelection(nextSelection);
    distanceSelectionRef.current = nextSelection;
    setDistanceToolSelection(nextSelection.referenceId, nextSelection.targetId);
    setDistanceDxValue('0');
    setDistanceDyValue('0');
    setShowDistanceDialog(true);
  };

  const cancelDistancePlacement = () => {
    clearDistanceToolState();
    setDistanceToolActive(false);
    setSelectedTool(null);
  };

  const applyDistancePlacementFromDialog = () => {
    const { referenceId, targetId } = distanceSelectionRef.current;
    if (!referenceId || !targetId) return;

    const dxMeters = Number.parseFloat(distanceDxValue);
    const dyMeters = Number.parseFloat(distanceDyValue);
    if (!Number.isFinite(dxMeters) || !Number.isFinite(dyMeters)) {
      setDistanceError('Distance placement not possible at the specified X and Y values. Invalid position.');
      return;
    }

    const result = applyDistancePlacement(
      referenceId,
      targetId,
      metersToWorldLength(dxMeters),
      metersToWorldLength(dyMeters)
    );
    if (!result.success) {
      setDistanceError(`Distance placement not possible at the specified X and Y values.${result.reason ? ` ${result.reason}.` : ''}`);
      return;
    }

    clearDistanceToolState();
    setDistanceToolActive(false);
    setSelectedTool(null);
  };

  const applySurfaceUpdate = () => {
    if (!selectedBodyDetails) return;
    updateBodySurfaceProperties(selectedBodyDetails.id, {
      restitution: parseInput(restitutionValue, selectedBodyDetails.restitution),
      friction: parseInput(frictionValue, selectedBodyDetails.friction)
    });
  };

  const applyGroundUpdate = () => {
    if (!selectedBodyDetails?.isGround) return;

    const angleDeg = Number.parseFloat(groundEditAngleValue);
    if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 180) {
      setGroundEditError('Angle must be between 0 and 180 degrees.');
      return;
    }

    const lengthMeters = Number.parseFloat(groundEditLengthValue);
    if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
      setGroundEditError('Ground length must be greater than zero.');
      return;
    }

    const result = updateGroundProperties(selectedBodyDetails.id, {
      angleDeg,
      length: metersToWorldLength(lengthMeters)
    });
    if (!result.success) {
      setGroundEditError(result.reason ? `${result.reason}.` : 'Ground creation failed due to invalid geometry.');
      return;
    }

    setGroundEditError(null);
    setGroundEditAngleValue(trimTrailingZeros(angleDeg.toFixed(3)));
    setGroundEditLengthValue(trimTrailingZeros(lengthMeters.toFixed(3)));
  };

  const applyEnvironmentUpdate = () => {
    updateEnvironmentPhysics({
      neglectAirResistance,
      dragCoefficient: parseInput(dragCoefficientValue, environmentPhysics.dragCoefficient),
      airDensity: parseInput(airDensityValue, environmentPhysics.airDensity)
    });
  };

  const applyForceUpdate = () => {
    if (!selectedBodyDetails) return;
    const mag = parseInput(forceMagnitudeValue, 0);
    const isActuallyEnabled = forceEnabled || Math.abs(mag) > 0 || (forceType === 'variable' && forceExpression !== '0');
    
    updateBodyForceConfig(selectedBodyDetails.id, {
      enabled: isActuallyEnabled,
      type: forceType,
      magnitude: mag,
      angleDeg: parseInput(forceAngleValue, 0),
      startTime: parseInput(forceStartValue, 0),
      endTime: parseInput(forceEndValue, 1),
      variableMode: forceVariableMode,
      expression: forceExpression || '0'
    });
    setForceEnabled(isActuallyEnabled);
  };

  const applyVelocityUpdate = () => {
    if (!selectedBodyDetails) return;
    const speed = parseInput(velocitySpeedValue, 0);
    const isActuallyEnabled = velocityEnabled || Math.abs(speed) > 0 || (velocityType === 'variable' && velocityExpression !== '0');

    updateBodyVelocityConfig(selectedBodyDetails.id, {
      enabled: isActuallyEnabled,
      type: velocityType,
      speed: speed,
      angleDeg: parseInput(velocityAngleValue, 0),
      variableMode: velocityVariableMode,
      expression: velocityExpression || '0'
    });
    setVelocityEnabled(isActuallyEnabled);
  };

  const trimTrailingZeros = (value: string) => {
    if (!value.includes('.')) return value;
    return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  };

  const formatDecimal = (num: number, decimals: number = 3) => trimTrailingZeros(num.toFixed(decimals));

  const formatLengthHuman = (m: number) => {
    const abs = Math.abs(m);
    if (abs >= 1000) return `${formatDecimal(m / 1000)} km`;
    if (abs >= 1) return `${formatDecimal(m)} m`;
    if (abs >= 0.01) return `${formatDecimal(m * 100)} cm`;
    return `${formatDecimal(m * 1000)} mm`;
  };

  const formatMassScientific = (kg: number) => {
    const table = [
      { unit: 'Gg', factor: 1e6 },
      { unit: 'Mg', factor: 1e3 },
      { unit: 't', factor: 1e3 },
      { unit: 'kg', factor: 1 },
      { unit: 'g', factor: 1e-3 },
      { unit: 'mg', factor: 1e-6 },
      { unit: 'µg', factor: 1e-9 },
      { unit: 'ng', factor: 1e-12 },
      { unit: 'pg', factor: 1e-15 }
    ];
    const abs = Math.abs(kg);
    const best = table.find((t) => abs >= t.factor) || table[table.length - 1];
    return `${formatDecimal(kg / best.factor)} ${best.unit}`;
  };

  const worldLengthToMeters = (worldLength: number) => worldLength / WORLD_PIXELS_PER_METER;
  const metersToWorldLength = (meters: number) => meters * WORLD_PIXELS_PER_METER;
  const formatLengthSI = (worldLength: number) => formatLengthHuman(worldLengthToMeters(worldLength));

  const applySpringUpdate = () => {
    if (!selectedConstraintId || selectedConstraintDetails?.type !== 'spring') return;
    if (!naturalLengthValue.trim() || !springConstantValue.trim()) return;
    const L = Number.parseFloat(naturalLengthValue);
    const k = Number.parseFloat(springConstantValue);
    if (!Number.isFinite(L) || !Number.isFinite(k) || L <= 0 || k <= 0) return;
    const naturalLengthMeters = L * LENGTH_TO_M[naturalLengthUnit];
    const naturalLengthWorld = metersToWorldLength(naturalLengthMeters);
    updateSpringProperties(selectedConstraintId, {
      naturalLength: naturalLengthWorld,
      springConstant: k
    });
    console.log('✅ Save Spring Properties applied:', {
      springId: selectedConstraintId,
      naturalLengthInput: L,
      naturalLengthUnit,
      naturalLengthMeters,
      naturalLengthWorld,
      springConstant: k
    });
    setSpringDrafts((prev) => ({
      ...prev,
      [selectedConstraintId]: {
        naturalLengthValue: trimTrailingZeros(L.toFixed(3)),
        naturalLengthUnit,
        springConstantValue: trimTrailingZeros(k.toFixed(3))
      }
    }));
    setNaturalLengthValue(trimTrailingZeros(L.toFixed(3)));
    setSpringConstantValue(trimTrailingZeros(k.toFixed(3)));
  };

  const applyRopeUpdate = () => {
    if (!selectedConstraintId || selectedConstraintDetails?.type !== 'rope') return;
    if (!naturalLengthValue.trim()) return;
    const L = Number.parseFloat(naturalLengthValue);
    if (!Number.isFinite(L) || L <= 0) return;
    
    const maxT = Number.parseFloat(maxTensionValue);
    const naturalLengthMeters = L * LENGTH_TO_M[naturalLengthUnit];
    const naturalLengthWorld = metersToWorldLength(naturalLengthMeters);
    
    updateRopeProperties(selectedConstraintId, {
      length: naturalLengthWorld,
      maxTension: Number.isFinite(maxT) && maxT > 0 ? maxT : undefined
    });
    
    setNaturalLengthValue(trimTrailingZeros(L.toFixed(3)));
  };

  const handleReset = () => {
    if (currentExperiment) {
      handleLoad(currentExperiment);
    }
  };

  useEffect(() => {
    setShowAnalytics(false);
    if (!selectedBody) return;

    const timer = window.setTimeout(() => {
      setShowAnalytics(true);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [selectedBody]);

  useEffect(() => {
    // Ensure app boots in paused state with no gravity.
    pauseSimulation();
    setGravityValue(gravityValue);
  }, []);

  useEffect(() => {
    // Resize simulation viewport after panel open/close animation updates layout.
    const t = window.setTimeout(() => {
      if (workspaceRef.current) {
        resizeViewport(workspaceRef.current.clientWidth, workspaceRef.current.clientHeight);
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [isPanelOpen, resizeViewport]);

  // Helper function to find body at position
  // Prioritizes smaller bodies (pivots/anchors) over large ones
  const findBodyAtPosition = (x: number, y: number): string | null => {
    const allBodies = getAllBodies();
    let bestLabel: string | null = null;
    let bestDist = Infinity;
    
    for (const body of allBodies) {
      // Skip ground bodies - they shouldn't be connection targets
      if (body.label.includes('ground')) continue;
      
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Use a hit radius of 50px, but prefer closer/smaller bodies
      if (distance < 50 && distance < bestDist) {
        bestDist = distance;
        bestLabel = body.label;
      }
    }
    
    if (bestLabel) {
      console.log('🎯 Found body at position:', bestLabel, 'distance:', bestDist.toFixed(1));
    }
    return bestLabel;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const workspace = workspaceRef.current;
    if (canvas && workspace) {
      resizeViewport(workspace.clientWidth, workspace.clientHeight);
    }

    const handleResize = () => {
      if (canvas && workspaceRef.current) {
        resizeViewport(workspaceRef.current.clientWidth, workspaceRef.current.clientHeight);
      }
    };

    // Handle mouse down for rope/spring drawing
    // ONLY starts drawing if clicking on an existing body
    const handleMouseDown = (e: MouseEvent) => {
      const activeTool = selectedToolRef.current;
      if (!canvas || hasPreviewRef.current) return;
      if (e.button !== 0) return;

      if (activeTool === 'distance') {
        e.preventDefault();
        e.stopPropagation();

        if (distanceSelectionRef.current.referenceId && distanceSelectionRef.current.targetId) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        const bodyId = getBodyIdAtPoint(x, y);
        if (!bodyId) {
          setDistanceError('Click a body to use the Distance Tool.');
          return;
        }

        handleDistanceBodySelection(bodyId);
        return;
      }

      if (activeTool !== 'rope' && activeTool !== 'spring') return;
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      console.log('🖱️ Mouse down at:', { x, y });
      const startBody = findBodyAtPosition(x, y);

      // REQUIRE a body at the start point - don't start drawing from empty space
      if (!startBody) {
        console.log('⚠️ No body found at click position - must click on a body/pivot to start');
        return;
      }

      setRopeDrawing({
        isDrawing: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        startBody
      });

      const toolName = activeTool === 'rope' ? 'rope' : 'spring';
      console.log(`🎨 Started ${toolName} drawing from body: ${startBody}`);
    };

    // Handle mouse move for rope/spring drawing
    const handleMouseMove = (e: MouseEvent) => {
      const drawing = ropeDrawingRef.current;
      if (!canvas || !drawing || !drawing.isDrawing) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setRopeDrawing({
        ...drawing,
        currentX: x,
        currentY: y
      });
    };

    // Handle mouse up to finalize rope/spring
    // BOTH endpoints must be on existing bodies - no auto-anchor creation
    const handleMouseUp = (e: MouseEvent) => {
      const activeTool = selectedToolRef.current;
      const drawing = ropeDrawingRef.current;
      if (!canvas || (activeTool !== 'rope' && activeTool !== 'spring') || !drawing || !drawing.isDrawing) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      console.log('🖱️ Mouse up at:', { x, y });
      const endBody = findBodyAtPosition(x, y);

      const bodyALabel = drawing.startBody;
      const bodyBLabel = endBody;

      // REQUIRE both endpoints to be on existing bodies
      if (!bodyALabel || !bodyBLabel) {
        console.log('⚠️ Connection cancelled - must release on a body/pivot');
        setRopeDrawing(null);
        // Don't clear selectedTool - let user try again
        return;
      }

      // Don't allow connecting a body to itself
      if (bodyALabel === bodyBLabel) {
        console.log('⚠️ Cannot connect a body to itself');
        setRopeDrawing(null);
        return;
      }

      const constraintType = activeTool === 'spring' ? 'spring' : 'rope';
      
      const dragLength = Math.sqrt(
        Math.pow(x - drawing.startX, 2) + 
        Math.pow(y - drawing.startY, 2)
      );

      const constraint: PhysicsConstraint = {
        id: uuidv4(),
        type: constraintType as any,
        bodyA: bodyALabel,
        bodyB: bodyBLabel,
        stiffness: constraintType === 'spring' ? 0.05 : 0.7,
        damping: constraintType === 'spring' ? 0 : undefined
      };

      console.log(`🔗 Creating ${constraintType}: ${bodyALabel} → ${bodyBLabel} (drag length: ${dragLength.toFixed(1)})`);
      addConstraint(constraint);
      console.log(`✅ ${constraintType} created successfully`);

      setRopeDrawing(null);
      setSelectedTool(null);
    };

    // Handle right-click to finalize preview
    // NO auto-connection: placing any object (including pivot) ONLY places that object.
    const handleRightClick = (e: MouseEvent) => {
      if (hasPreviewRef.current) {
        e.preventDefault();
        const finalizedId = finalizePreview();
        
        console.log('✅ Object placed:', finalizedId);
        
        // After placing, clear the tool (pivot/box/circle/ground all behave the same)
        setSelectedTool(null);
        
        // Emit to remote users if connected
        if (isConnected && finalizedId) {
          const bodies = getAllBodies();
          const finalizedBody = bodies.find(b => b.id === finalizedId);
          if (finalizedBody) {
            emitObjectAdded({
              id: finalizedId,
              type: 'box',
              x: finalizedBody.position.x,
              y: finalizedBody.position.y,
              label: finalizedBody.label
            });
          }
        }
      }
    };

    // Handle escape to cancel preview or tool mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const activeTool = selectedToolRef.current;
        const drawing = ropeDrawingRef.current;
        if (hasPreviewRef.current) {
          cancelPreview();
          setSelectedTool(null);
        } else if (showGroundSettingsDialogRef.current) {
          setShowGroundSettingsDialog(false);
          setGroundSettingsError(null);
          setSelectedTool(null);
        } else if (drawing && drawing.isDrawing) {
          console.log('❌ Cancelled drawing mode');
          setRopeDrawing(null);
        } else if (activeTool === 'distance') {
          clearDistanceToolState();
          setDistanceToolActive(false);
          setSelectedTool(null);
        } else if (activeTool) {
          console.log('❌ Cancelled tool mode');
          setSelectedTool(null);
        }
      }
    };

    if (canvas) {
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('contextmenu', handleRightClick);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('contextmenu', handleRightClick);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [hasPreview, finalizePreview, cancelPreview, isConnected, emitObjectAdded, getAllBodies, addBody, addConstraint, resizeViewport, selectedTool, ropeDrawing]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-white">
      {showWelcome && (
        <WelcomeScreen
          onStart={() => setShowWelcome(false)}
          onOpenTemplates={() => {
            setShowWelcome(false);
            setLibraryMode('load');
            setShowLibrary(true);
          }}
          onOpenRoom={() => {
            setShowWelcome(false);
            setShowRoom(true);
          }}
          onOpenHelp={() => {
            setShowWelcome(false);
            setShowHelp(true);
          }}
        />
      )}

      <Toolbar
        onAddBox={handleAddBox}
        onAddCircle={handleAddCircle}
        onAddGround={handleAddGround}
        onAddRope={handleAddRope}
        onAddSpring={handleAddSpring}
        onAddPivot={handleAddPivot}
        onDistanceTool={handleDistanceTool}
        onClear={handleClear}
        onSave={() => {
          setLibraryMode('save');
          setShowLibrary(true);
        }}
        onLoad={() => {
          setLibraryMode('load');
          setShowLibrary(true);
        }}
        onToggleRoom={() => setShowRoom(true)}
        onToggleHelp={() => setShowHelp(true)}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onReset={handleReset}
        selectedTool={selectedTool}
      />

      <div ref={workspaceRef} className="relative w-full h-[calc(100vh-80px)] bg-white overflow-hidden">
        <PhysicsCanvas ref={canvasRef} />
        
        <AnalyticsDashboard
          getAnalytics={getAnalytics}
          selectedBody={selectedBody}
          isVisible={showAnalytics}
        />

        {ropeDrawing && ropeDrawing.isDrawing && (
          <>
            <svg
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ zIndex: 1000 }}
            >
              {selectedTool === 'spring' ? (
                <g opacity="0.6">
                  <SpringPreview
                    x1={ropeDrawing.startX}
                    y1={ropeDrawing.startY}
                    x2={ropeDrawing.currentX}
                    y2={ropeDrawing.currentY}
                  />
                </g>
              ) : (
                <>
                  <line
                    x1={ropeDrawing.startX}
                    y1={ropeDrawing.startY}
                    x2={ropeDrawing.currentX}
                    y2={ropeDrawing.currentY}
                    stroke="#000000"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                </>
              )}
              <circle
                cx={ropeDrawing.startX}
                cy={ropeDrawing.startY}
                r="4"
                fill="#000000"
              />
              <circle
                cx={ropeDrawing.currentX}
                cy={ropeDrawing.currentY}
                r="4"
                fill="#000000"
              />
            </svg>
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg border-2 border-gray-700">
              <div className="flex flex-col text-center">
                <span className="font-semibold text-sm">{selectedTool === 'spring' ? 'SPRING' : 'ROPE'} DRAWING MODE</span>
                <span className="text-xs opacity-90">Hold and drag to create {selectedTool} • Release to finalize</span>
              </div>
            </div>
          </>
        )}

        {isConnected && (
          <div className="absolute top-4 left-4 bg-gray-800 border border-green-500 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="font-semibold">Room: {roomId}</span>
              <span className="text-gray-400">|</span>
              <span>{users.length} user{users.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {selectedTool && (selectedTool === 'rope' || selectedTool === 'spring') && !ropeDrawing && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg border-2 border-gray-700">
            <div className="flex flex-col text-center">
              <span className="font-semibold text-sm uppercase">{selectedTool} MODE</span>
              <span className="text-xs opacity-90">Click on a body/pivot, drag to another body/pivot, release to connect • ESC to cancel</span>
            </div>
          </div>
        )}

        {showGroundSettingsDialog && selectedTool === 'ground' && (
          <div className="absolute top-24 left-1/2 z-40 w-[min(420px,calc(100%-32px))] -translate-x-1/2 rounded-lg border border-gray-300 bg-white p-4 shadow-xl">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-black">Ground Settings</h3>
                <p className="mt-1 text-xs text-gray-600">Set the ground geometry, then place it on the canvas.</p>
              </div>

              <label className="text-xs text-gray-800 block">
                Angle (degrees)
                <input
                  value={groundAngleValue}
                  onChange={(e) => setGroundAngleValue(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  placeholder="0"
                />
              </label>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-black">Length Mode</div>
                <label className="flex items-center gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    checked={groundLengthMode === 'full'}
                    onChange={() => setGroundLengthMode('full')}
                  />
                  Full Screen Ground
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    checked={groundLengthMode === 'custom'}
                    onChange={() => setGroundLengthMode('custom')}
                  />
                  Custom Length
                </label>
              </div>

              <label className="text-xs text-gray-800 block">
                Length (m)
                <input
                  value={groundLengthValue}
                  onChange={(e) => setGroundLengthValue(e.target.value)}
                  disabled={groundLengthMode === 'full'}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="5"
                />
              </label>

              {groundSettingsError && (
                <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {groundSettingsError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelGroundSettings}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={createGroundPreviewFromSettings}
                  className="rounded border border-black px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  Create Ground
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedTool === 'distance' && !showDistanceDialog && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg border-2 border-gray-700">
            <div className="flex flex-col text-center gap-1">
              <span className="font-semibold text-sm uppercase">DISTANCE TOOL</span>
              <span className="text-xs opacity-90">
                {distanceSelection.referenceId
                  ? `Reference: ${getBodyLabelById(distanceSelection.referenceId) ?? 'selected'} - click the target body`
                  : 'Click the reference body'}
              </span>
              {distanceError && <span className="text-xs text-red-200">{distanceError}</span>}
            </div>
          </div>
        )}

        {showDistanceDialog && distanceSelection.referenceId && distanceSelection.targetId && (
          <div className="absolute top-24 left-1/2 z-40 w-[min(420px,calc(100%-32px))] -translate-x-1/2 rounded-lg border border-gray-300 bg-white p-4 shadow-xl">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-black">Distance Tool</h3>
                <p className="mt-1 text-xs text-gray-600">
                  Reference: {getBodyLabelById(distanceSelection.referenceId) ?? 'selected'} | Target: {getBodyLabelById(distanceSelection.targetId) ?? 'selected'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-800">
                  Distance X (m)
                  <input
                    value={distanceDxValue}
                    onChange={(e) => setDistanceDxValue(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="5"
                  />
                </label>
                <label className="text-xs text-gray-800">
                  Distance Y (m)
                  <input
                    value={distanceDyValue}
                    onChange={(e) => setDistanceDyValue(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="0"
                  />
                </label>
              </div>
              <div className="text-[11px] text-gray-500">Values are in meters. 1 = 1 m.</div>

              {distanceError && (
                <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {distanceError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelDistancePlacement}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={applyDistancePlacementFromDialog}
                  className="rounded border border-black px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {hasPreview && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 border-2 border-gray-700">
            <div className="flex flex-col text-center">
              <span className="font-semibold text-sm">PLACEMENT MODE</span>
              <span className="text-xs opacity-90">Move your mouse to position • Right-click to place • ESC to cancel</span>
            </div>
          </div>
        )}

        <div
          className="absolute top-0 right-0 h-full z-30 transition-all duration-300 ease-out"
          style={{ width: isPanelOpen ? '46vw' : 0, maxWidth: isPanelOpen ? 620 : 0, minWidth: isPanelOpen ? 420 : 0 }}
        >
          <button
            onClick={() => setIsPanelOpen((v) => !v)}
            className="absolute -left-9 top-1/2 -translate-y-1/2 w-9 h-14 bg-white border border-gray-300 rounded-l-md flex items-center justify-center hover:bg-gray-50"
            title={isPanelOpen ? 'Close controls' : 'Open controls'}
          >
            {isPanelOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div
            className={`h-full bg-gray-50 border-l border-gray-300 rounded-l-xl shadow-sm transition-transform duration-300 ease-out overflow-y-auto overflow-x-hidden pb-8 ${
              isPanelOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="p-4 border-b border-gray-200">
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={handlePause}
                  className="flex items-center justify-center gap-1 px-2 py-2 border border-black rounded-md text-sm hover:bg-gray-100"
                >
                  <Pause size={14} /> Pause
                </button>
                <button
                  onClick={handleStart}
                  className="flex items-center justify-center gap-1 px-2 py-2 border border-black rounded-md text-sm hover:bg-gray-100"
                >
                  <Play size={14} /> Start
                </button>
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="flex items-center justify-center gap-1 px-2 py-2 border border-black rounded-md text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 size={14} /> Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="flex items-center justify-center gap-1 px-2 py-2 border border-black rounded-md text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Redo2 size={14} /> Redo
                </button>
              </div>
            </div>

            <div className="p-4">
              <h3 className="text-sm font-semibold text-black mb-3">Gravity Selection</h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleGravityChange(0)}
                  className={`px-3 py-2 border rounded-md text-sm ${
                    gravityValue === 0 ? 'border-black bg-white font-semibold' : 'border-gray-300 bg-white hover:bg-gray-100'
                  }`}
                >
                  Free Space
                </button>
                <button
                  onClick={() => handleGravityChange(9.8)}
                  className={`px-3 py-2 border rounded-md text-sm ${
                    gravityValue === 9.8 ? 'border-black bg-white font-semibold' : 'border-gray-300 bg-white hover:bg-gray-100'
                  }`}
                >
                  9.8 m/s²
                </button>
                <button
                  onClick={() => handleGravityChange(10)}
                  className={`px-3 py-2 border rounded-md text-sm ${
                    gravityValue === 10 ? 'border-black bg-white font-semibold' : 'border-gray-300 bg-white hover:bg-gray-100'
                  }`}
                >
                  10 m/s²
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-600">
                Status: {isPlaying ? 'Running' : 'Paused'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 items-end">
                <label className="text-xs text-gray-800">
                  Playback Speed
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                  >
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <option key={speed} value={speed}>{speed}x</option>
                    ))}
                  </select>
                </label>
                <div className="text-xs text-gray-600 pb-1">
                  Replay: {replayMax > 0 ? `${replayIndex} / ${replayMax}` : 'No frames'}
                </div>
              </div>
              <label className="mt-3 block text-xs text-gray-800">
                Timeline ({formatDecimal(replayTime, 2)}s)
                <input
                  type="range"
                  min={0}
                  max={replayMax}
                  value={replayIndex}
                  onChange={(e) => setReplayIndex(Number(e.target.value))}
                  disabled={replayMax === 0}
                  className="mt-1 w-full"
                />
              </label>
              {!isPlaying && velocityPlotState.hasData && (
                <button
                  onClick={handleShowVelocityPlots}
                  className="mt-3 w-full border border-black px-3 py-2 text-xs hover:bg-gray-100"
                >
                  Show Velocity Plots of Bodies
                </button>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 space-y-2">
              <h3 className="text-sm font-semibold text-black">Debug Visualizations</h3>
              <label className="flex items-center gap-2 text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={showAllVelocities}
                  onChange={(e) => setShowAllVelocities(e.target.checked)}
                />
                Show Velocity Components
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={showAllForces}
                  onChange={(e) => setShowAllForces(e.target.checked)}
                />
                Show Individual Forces
              </label>
            </div>

            <div className="p-4 border-t border-gray-200 space-y-3">
              <h3 className="text-sm font-semibold text-black">Environment Physics</h3>
              <label className="flex items-center gap-2 text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={neglectAirResistance}
                  onChange={(e) => setNeglectAirResistance(e.target.checked)}
                />
                Neglect Air Resistance
              </label>
              {!neglectAirResistance && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-800">
                    Drag Coefficient
                    <input
                      value={dragCoefficientValue}
                      onChange={(e) => setDragCoefficientValue(e.target.value)}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-800">
                    Air Density (kg/m^3)
                    <input
                      value={airDensityValue}
                      onChange={(e) => setAirDensityValue(e.target.value)}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </label>
                </div>
              )}
              <button
                onClick={applyEnvironmentUpdate}
                className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
              >
                Save Environment Physics
              </button>
            </div>

            <div className="p-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-black mb-3">Properties / Inspector</h3>

              {!selectedBodyDetails && !selectedConstraintDetails && (
                <p className="text-xs text-gray-600">Select an object, rope, or spring to edit properties.</p>
              )}

              {selectedBodyDetails && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-700 border-b border-gray-200 pb-2">
                    <div><span className="font-semibold">Object Type:</span> {selectedBodyLabel || selectedBodyDetails.label}</div>
                  </div>

                  {selectedBodyDetails.canEditMass ? (
                    <>
                      <label className="text-xs text-gray-800 block">Mass</label>
                      <div className="flex gap-2">
                        <input
                          value={massValue}
                          onChange={(e) => setMassValue(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="e.g. 5 or 1e-6"
                        />
                        <select
                          value={massUnit}
                          onChange={(e) => setMassUnit(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                        >
                          <option value="pg">picograms (pg)</option>
                          <option value="ng">nanograms (ng)</option>
                          <option value="µg">micrograms (µg)</option>
                          <option value="mg">milligrams (mg)</option>
                          <option value="g">grams (g)</option>
                          <option value="kg">kilograms (kg)</option>
                          <option value="t">tonnes (t)</option>
                          <option value="Mg">megagrams (Mg)</option>
                          <option value="Gg">gigagrams (Gg)</option>
                        </select>
                      </div>
                      <div className="text-[11px] text-gray-600">
                        Current Mass (auto SI): {formatMassScientific(selectedBodyDetails.mass)}
                      </div>
                      <button
                        onClick={applyMassUpdate}
                        className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
                      >
                        Save Mass
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">Static object. Mass is not editable.</p>
                  )}

                  {selectedBodyDetails.isGround && (
                    <div className="border-t border-gray-200 pt-3 space-y-2">
                      <h4 className="text-xs font-semibold text-black">Ground Properties</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-gray-800">
                          Angle (deg)
                          <input
                            value={groundEditAngleValue}
                            onChange={(e) => setGroundEditAngleValue(e.target.value)}
                            className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </label>
                        <label className="text-xs text-gray-800">
                          Length (m)
                          <input
                            value={groundEditLengthValue}
                            onChange={(e) => setGroundEditLengthValue(e.target.value)}
                            className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </label>
                      </div>
                      {groundEditError && (
                        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                          {groundEditError}
                        </div>
                      )}
                      <button
                        onClick={applyGroundUpdate}
                        className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
                      >
                        Save Ground Properties
                      </button>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3 space-y-2">
                    <h4 className="text-xs font-semibold text-black">Surface Properties</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-800">
                        Restitution (e)
                        <input
                          value={restitutionValue}
                          onChange={(e) => setRestitutionValue(e.target.value)}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                      <label className="text-xs text-gray-800">
                        Friction (mu)
                        <input
                          value={frictionValue}
                          onChange={(e) => setFrictionValue(e.target.value)}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                    </div>
                    <button
                      onClick={applySurfaceUpdate}
                      className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
                    >
                      Save Surface Properties
                    </button>
                  </div>

                  {selectedBodyDetails.canEditMotion && (
                    <>
                      <div className="border-t border-gray-200 pt-3 space-y-2">
                        <h4 className="text-xs font-semibold text-black">Force Configuration</h4>
                        <label className="flex items-center gap-2 text-xs text-gray-800">
                          <input
                            type="checkbox"
                            checked={forceEnabled}
                            onChange={(e) => setForceEnabled(e.target.checked)}
                          />
                          Enable External Force
                        </label>
                        <select
                          value={forceType}
                          onChange={(e) => setForceType(e.target.value as 'constant' | 'timed' | 'variable' | 'instantaneous')}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                        >
                          <option value="constant">Constant Force Throughout Motion</option>
                          <option value="timed">Constant Force Over Time Duration</option>
                          <option value="variable">Variable Force</option>
                          <option value="instantaneous">Instantaneous Force (Impulse)</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          {forceType !== 'variable' && (
                            <label className="text-xs text-gray-800">
                              {forceType === 'instantaneous' ? 'Impulse (N·s)' : 'Force (N)'}
                              <input value={forceMagnitudeValue} onChange={(e) => setForceMagnitudeValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                            </label>
                          )}
                          <label className="text-xs text-gray-800">
                            Angle (deg)
                            <input value={forceAngleValue} onChange={(e) => setForceAngleValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </label>
                          {forceType === 'timed' && (
                            <>
                              <label className="text-xs text-gray-800">
                                Start Time (s)
                                <input value={forceStartValue} onChange={(e) => setForceStartValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                              </label>
                              <label className="text-xs text-gray-800">
                                End Time (s)
                                <input value={forceEndValue} onChange={(e) => setForceEndValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                              </label>
                            </>
                          )}
                        </div>
                        {forceType === 'variable' && (
                          <div className="grid grid-cols-2 gap-2">
                            <select value={forceVariableMode} onChange={(e) => setForceVariableMode(e.target.value as 't' | 'x' | 'x_t')} className="px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                              <option value="t">F(t)</option>
                              <option value="x">F(x)</option>
                              <option value="x_t">F(x,t)</option>
                            </select>
                            <input value={forceExpression} onChange={(e) => setForceExpression(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="10*sin(t)" />
                          </div>
                        )}
                        <button onClick={applyForceUpdate} className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100">
                          {forceType === 'instantaneous' ? 'Save Impulse Config' : 'Save Force'}
                        </button>
                        {forceType === 'instantaneous' && selectedBodyDetails && (
                          <>
                            <button
                              onClick={() => {
                                const mag = parseInput(forceMagnitudeValue, 0);
                                const angle = parseInput(forceAngleValue, 0);
                                applyInstantaneousForce(selectedBodyDetails.id, mag, angle);
                              }}
                              className="px-3 py-1.5 bg-black text-white rounded text-xs hover:bg-gray-800"
                            >
                              ⚡ Apply Impulse Now
                            </button>
                            <p className="text-[11px] text-gray-500">
                              Impulse is applied once as an instant velocity change (Δv = J/m). Click again to apply another impulse.
                            </p>
                          </>
                        )}
                      </div>

                      <div className="border-t border-gray-200 pt-3 space-y-2">
                        <h4 className="text-xs font-semibold text-black">Velocity Configuration</h4>
                        <label className="flex items-center gap-2 text-xs text-gray-800">
                          <input type="checkbox" checked={velocityEnabled} onChange={(e) => setVelocityEnabled(e.target.checked)} />
                          Enable Velocity Control
                        </label>
                        <select value={velocityType} onChange={(e) => setVelocityType(e.target.value as 'constant' | 'initial' | 'variable')} className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                          <option value="constant">Constant Velocity Throughout</option>
                          <option value="initial">Initial Velocity Only</option>
                          <option value="variable">Variable Velocity</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          {velocityType !== 'variable' && (
                            <label className="text-xs text-gray-800">
                              Speed (m/s)
                              <input value={velocitySpeedValue} onChange={(e) => setVelocitySpeedValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                            </label>
                          )}
                          <label className="text-xs text-gray-800">
                            Angle (deg)
                            <input value={velocityAngleValue} onChange={(e) => setVelocityAngleValue(e.target.value)} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </label>
                        </div>
                        {velocityType === 'variable' && (
                          <div className="grid grid-cols-2 gap-2">
                            <select value={velocityVariableMode} onChange={(e) => setVelocityVariableMode(e.target.value as 't' | 'x' | 'x_t')} className="px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                              <option value="t">v(t)</option>
                              <option value="x">v(x)</option>
                              <option value="x_t">v(x,t)</option>
                            </select>
                            <input value={velocityExpression} onChange={(e) => setVelocityExpression(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="5*t" />
                          </div>
                        )}
                        <button onClick={applyVelocityUpdate} className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100">Save Velocity</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {selectedConstraintDetails && (
                <div className="space-y-3 mt-4 border-t border-gray-200 pt-3">
                  <div className="text-xs text-gray-700">
                    <div><span className="font-semibold">Constraint Type:</span> {selectedConstraintDetails.type}</div>
                  </div>

                  {selectedConstraintDetails.type === 'spring' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-800 block">Natural Length (L₀)</label>
                        <div className="flex gap-2">
                          <input
                            value={naturalLengthValue}
                            onChange={(e) => setNaturalLengthValue(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                          <select
                            value={naturalLengthUnit}
                            onChange={(e) => setNaturalLengthUnit(e.target.value as 'mm' | 'cm' | 'm')}
                            className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                          >
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="m">m</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-gray-800 block">Spring Constant (k) [N/m]</label>
                        <input
                          value={springConstantValue}
                          onChange={(e) => setSpringConstantValue(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>

                      <button
                        onClick={applySpringUpdate}
                        className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
                      >
                        Save Spring Properties
                      </button>

                      {liveConstraintDetails && (
                        <div className="text-xs text-gray-700 border-t border-gray-200 pt-2 space-y-1">
                          <div>Current Length: {formatLengthSI(liveConstraintDetails.currentLength)}</div>
                          {liveConstraintDetails.extension > 0 && <div>Extension: {formatLengthSI(liveConstraintDetails.extension)}</div>}
                          {liveConstraintDetails.compression > 0 && <div>Compression: {formatLengthSI(liveConstraintDetails.compression)}</div>}
                          {liveConstraintDetails.extension === 0 && liveConstraintDetails.compression === 0 && <div>No extension/compression</div>}
                          <div className="pt-1 text-[11px] text-gray-600">F = -k(x - L₀)</div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedConstraintDetails.type === 'rope' && (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-800 block">Rope Length</label>
                          <div className="flex gap-2">
                            <input
                              value={naturalLengthValue}
                              onChange={(e) => setNaturalLengthValue(e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <select
                              value={naturalLengthUnit}
                              onChange={(e) => setNaturalLengthUnit(e.target.value as 'mm' | 'cm' | 'm')}
                              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                            >
                              <option value="mm">mm</option>
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-gray-800 block">Max Breaking Tension (N)</label>
                          <input
                            value={maxTensionValue}
                            onChange={(e) => setMaxTensionValue(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="0 = unbreakable"
                          />
                        </div>

                        <button
                          onClick={applyRopeUpdate}
                          className="px-3 py-1.5 border border-black rounded text-xs hover:bg-gray-100"
                        >
                          Save Rope Properties
                        </button>

                        {liveConstraintDetails && (
                          <div className="text-xs text-gray-700 border-t border-gray-200 pt-2 space-y-1">
                            <div className="flex justify-between">
                              <span>Current Length:</span>
                              <span>{formatLengthSI(liveConstraintDetails.currentLength)}</span>
                            </div>
                            <div className={`flex justify-between font-semibold ${liveConstraintDetails.tension > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                              <span>Current Tension:</span>
                              <span>{formatDecimal(liveConstraintDetails.tension)} N</span>
                            </div>
                            {liveConstraintDetails.maxTension && (
                              <div className="flex justify-between text-[11px] text-gray-500">
                                <span>Max Tension:</span>
                                <span>{formatDecimal(liveConstraintDetails.maxTension)} N</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {selectedConstraintDetails.type !== 'spring' && selectedConstraintDetails.type !== 'rope' && (
                    <div className="text-xs text-gray-600">
                      Current Length: {formatLengthSI(liveConstraintDetails?.currentLength ?? selectedConstraintDetails.currentLength)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExperimentLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        onLoad={handleLoad}
        onSave={handleSave}
        mode={libraryMode}
      />

      <RoomManager
        isOpen={showRoom}
        onClose={() => setShowRoom(false)}
        onJoinRoom={handleJoinRoom}
        users={users}
        connected={isConnected}
        currentRoom={roomId}
      />

      <InstructionsPanel
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />

      <PhysicsDebug
        bodies={bodies}
        constraints={constraints}
        engine={engine}
      />

      {velocityPlotData && (
        <VelocityPlotsModal
          isOpen={showVelocityPlots}
          onClose={() => setShowVelocityPlots(false)}
          data={velocityPlotData}
        />
      )}
    </div>
  );
}

export default App;
