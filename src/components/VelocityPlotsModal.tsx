import { useMemo, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { VelocityPlotData, VelocitySample } from '../types/velocityPlot';

interface VelocityPlotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: VelocityPlotData;
}

type MetricKey = 'velocity' | 'vx' | 'vy';

interface MetricConfig {
  key: MetricKey;
  title: string;
  yLabel: string;
}

const METRICS: MetricConfig[] = [
  { key: 'velocity', title: 'Velocity Magnitude vs Time', yLabel: '|v| (m/s)' },
  { key: 'vx', title: 'Vx vs Time', yLabel: 'Vx (m/s)' },
  { key: 'vy', title: 'Vy vs Time', yLabel: 'Vy (m/s)' }
];

const MATLAB_COLORS = [
  '#0072BD',
  '#D95319',
  '#EDB120',
  '#7E2F8E',
  '#77AC30',
  '#4DBEEE',
  '#A2142F',
  '#000000',
  '#1B9E77',
  '#7570B3'
];

const MAX_POINTS_PER_BODY = 2500;

const formatNumber = (value: number, decimals = 4) => {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals).replace(/\.?0+$/, '');
};

const downsample = (samples: VelocitySample[]) => {
  if (samples.length <= MAX_POINTS_PER_BODY) return samples;
  const step = Math.ceil(samples.length / MAX_POINTS_PER_BODY);
  const reduced: VelocitySample[] = [];
  for (let i = 0; i < samples.length; i += step) {
    reduced.push(samples[i]);
  }
  const last = samples[samples.length - 1];
  if (reduced[reduced.length - 1] !== last) {
    reduced.push(last);
  }
  return reduced;
};

const buildChartRows = (
  data: VelocityPlotData,
  selectedBodyIds: Set<string>,
  bodyKeys: Map<string, string>,
  metric: MetricKey
) => {
  const rowsByTime = new Map<number, Record<string, number>>();

  data.bodies.forEach((body) => {
    if (!selectedBodyIds.has(body.id)) return;
    const bodyKey = bodyKeys.get(body.id);
    if (!bodyKey) return;

    downsample(body.samples).forEach((sample) => {
      const time = Number(sample.time.toFixed(6));
      const row = rowsByTime.get(time) ?? { time };
      row[bodyKey] = sample[metric];
      rowsByTime.set(time, row);
    });
  });

  return Array.from(rowsByTime.values()).sort((a, b) => a.time - b.time);
};

const VelocityPlotsModal = ({ isOpen, onClose, data }: VelocityPlotsModalProps) => {
  const [selectedBodyIds, setSelectedBodyIds] = useState<Set<string>>(
    () => new Set(data.bodies.map((body) => body.id))
  );

  const bodyKeys = useMemo(
    () => new Map(data.bodies.map((body, index) => [body.id, `body_${index}`])),
    [data]
  );

  const bodyColors = useMemo(
    () => new Map(data.bodies.map((body, index) => [body.id, MATLAB_COLORS[index % MATLAB_COLORS.length]])),
    [data]
  );

  const selectedBodies = useMemo(
    () => data.bodies.filter((body) => selectedBodyIds.has(body.id)),
    [data, selectedBodyIds]
  );

  const chartRows = useMemo(() => {
    return METRICS.reduce<Record<MetricKey, Array<Record<string, number>>>>((acc, metric) => {
      acc[metric.key] = buildChartRows(data, selectedBodyIds, bodyKeys, metric.key);
      return acc;
    }, { velocity: [], vx: [], vy: [] });
  }, [data, selectedBodyIds, bodyKeys]);

  if (!isOpen) return null;

  const duration = Math.max(0, data.endedAt - data.startedAt);

  const toggleBody = (bodyId: string) => {
    setSelectedBodyIds((prev) => {
      const next = new Set(prev);
      if (next.has(bodyId)) {
        next.delete(bodyId);
      } else {
        next.add(bodyId);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-md border border-gray-300 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-black">Velocity Plots of Bodies</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>Duration: {formatNumber(duration, 3)} s</span>
              <span>Sampling: {formatNumber(data.sampleInterval, 5)} s</span>
              <span>Samples: {data.totalSamples}</span>
              <span>Bodies: {data.bodies.length}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="border border-black px-3 py-1.5 text-xs hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
          <aside className="overflow-y-auto border-r border-gray-200 p-4">
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setSelectedBodyIds(new Set(data.bodies.map((body) => body.id)))}
                className="border border-gray-400 px-2 py-1 text-xs hover:bg-gray-100"
              >
                All
              </button>
              <button
                onClick={() => setSelectedBodyIds(new Set())}
                className="border border-gray-400 px-2 py-1 text-xs hover:bg-gray-100"
              >
                None
              </button>
            </div>

            <div className="space-y-2">
              {data.bodies.map((body) => (
                <label key={body.id} className="flex items-center gap-2 text-xs text-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedBodyIds.has(body.id)}
                    onChange={() => toggleBody(body.id)}
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 border border-gray-300"
                    style={{ backgroundColor: bodyColors.get(body.id) }}
                  />
                  <span className="truncate" title={body.label}>{body.label}</span>
                </label>
              ))}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto bg-gray-50 p-4">
            {selectedBodies.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-600">
                Select at least one body.
              </div>
            ) : (
              <div className="space-y-4">
                {METRICS.map((metric) => {
                  const rows = chartRows[metric.key];
                  return (
                    <section key={metric.key} className="border border-gray-300 bg-white p-4">
                      <h3 className="mb-2 text-sm font-semibold text-black">{metric.title}</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={rows} margin={{ top: 10, right: 28, bottom: 36, left: 54 }}>
                            <CartesianGrid stroke="#d9d9d9" strokeDasharray="3 3" />
                            <XAxis
                              dataKey="time"
                              type="number"
                              domain={['dataMin', 'dataMax']}
                              tickFormatter={(value) => formatNumber(Number(value), 2)}
                              label={{ value: 'Time (s)', position: 'insideBottom', offset: -24 }}
                              stroke="#333333"
                            />
                            <YAxis
                              tickFormatter={(value) => formatNumber(Number(value), 3)}
                              label={{ value: metric.yLabel, angle: -90, position: 'insideLeft', offset: -40 }}
                              stroke="#333333"
                              width={68}
                            />
                            <Tooltip
                              labelFormatter={(value) => `t = ${formatNumber(Number(value), 5)} s`}
                              formatter={(value, name) => [
                                `${formatNumber(Number(value), 6)} m/s`,
                                name
                              ]}
                              contentStyle={{
                                border: '1px solid #666666',
                                borderRadius: 0,
                                fontSize: 12
                              }}
                            />
                            <Legend verticalAlign="top" height={28} />
                            {selectedBodies.map((body) => {
                              const key = bodyKeys.get(body.id);
                              if (!key) return null;
                              return (
                                <Line
                                  key={body.id}
                                  type="monotone"
                                  dataKey={key}
                                  name={body.label}
                                  stroke={bodyColors.get(body.id)}
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 4 }}
                                  connectNulls={false}
                                  isAnimationActive={false}
                                />
                              );
                            })}
                            {rows.length > 8 && (
                              <Brush
                                dataKey="time"
                                height={22}
                                travellerWidth={8}
                                tickFormatter={(value) => formatNumber(Number(value), 1)}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default VelocityPlotsModal;
