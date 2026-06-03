export interface VelocitySample {
  time: number;
  velocity: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  ax: number;
  ay: number;
  acceleration: number;
}

export interface BodyVelocitySeries {
  id: string;
  label: string;
  samples: VelocitySample[];
}

export interface VelocityPlotData {
  startedAt: number;
  endedAt: number;
  sampleInterval: number;
  totalSamples: number;
  bodies: BodyVelocitySeries[];
}

export interface VelocityPlotState {
  hasData: boolean;
  isRecording: boolean;
  revision: number;
  sampleCount: number;
}
