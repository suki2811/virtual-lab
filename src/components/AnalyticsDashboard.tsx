import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AnalyticsData } from '../types/physics';

interface AnalyticsDashboardProps {
  getAnalytics: (bodyId: string) => any;
  selectedBody: string | null;
  isVisible: boolean;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  getAnalytics,
  selectedBody,
  isVisible
}) => {
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [currentStats, setCurrentStats] = useState<any>(null);

  useEffect(() => {
    if (!selectedBody || !isVisible) return;

    const interval = setInterval(() => {
      const analytics = getAnalytics(selectedBody);
      if (analytics) {
        setCurrentStats(analytics);
        setData(prev => {
          const newData = [
            ...prev,
            {
              time: Date.now(),
              velocity: analytics.velocity,
              kineticEnergy: analytics.kineticEnergy,
              potentialEnergy: analytics.potentialEnergy,
              totalEnergy: analytics.totalEnergy
            }
          ];
          // Keep only last 50 data points
          return newData.slice(-50);
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [selectedBody, getAnalytics, isVisible]);

  if (!isVisible || !selectedBody) {
    return null;
  }

  return (
    <div className="absolute right-4 top-20 w-96 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-4">
      <h2 className="text-xl font-bold text-white mb-4">Real-Time Analytics</h2>
      
      {currentStats && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-gray-400 text-sm">Velocity</div>
            <div className="text-white text-lg font-bold">
              {currentStats.velocity.toFixed(2)} m/s
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-gray-400 text-sm">Angle</div>
            <div className="text-white text-lg font-bold">
              {(currentStats.angle * 180 / Math.PI).toFixed(1)}°
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-gray-400 text-sm">Kinetic Energy</div>
            <div className="text-white text-lg font-bold">
              {currentStats.kineticEnergy.toFixed(2)} J
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-gray-400 text-sm">Potential Energy</div>
            <div className="text-white text-lg font-bold">
              {currentStats.potentialEnergy.toFixed(2)} J
            </div>
          </div>
        </div>
      )}

      {data.length > 1 && (
        <div className="bg-gray-900 p-3 rounded-lg">
          <h3 className="text-white font-semibold mb-2">Energy Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                stroke="#9ca3af"
                tick={false}
              />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="kineticEnergy" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
                name="Kinetic"
              />
              <Line 
                type="monotone" 
                dataKey="potentialEnergy" 
                stroke="#10b981" 
                strokeWidth={2}
                dot={false}
                name="Potential"
              />
              <Line 
                type="monotone" 
                dataKey="totalEnergy" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={false}
                name="Total"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {currentStats && (
        <div className="mt-4 bg-gray-900 p-3 rounded-lg">
          <h3 className="text-white font-semibold mb-2">Position</h3>
          <div className="text-gray-300 text-sm">
            X: {currentStats.position.x.toFixed(1)}, Y: {currentStats.position.y.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
