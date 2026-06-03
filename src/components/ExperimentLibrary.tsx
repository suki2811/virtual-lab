import React, { useState, useEffect } from 'react';
import { X, Trash2, Download, BookOpen } from 'lucide-react';
import { Experiment } from '../types/physics';
import { deleteExperiment, listExperiments } from '../utils/experimentsApi';

interface ExperimentLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (experiment: Experiment) => void;
  onSave: (name: string, description: string) => Promise<void>;
  mode: 'save' | 'load';
}

const templates: Experiment[] = [
  {
    id: 'pendulum',
    name: 'Simple Pendulum',
    description: 'A classic pendulum demonstrating periodic motion and energy conservation',
    objects: [
      { id: '1', type: 'circle', x: 400, y: 200, radius: 30, color: '#e74c3c' },
      { id: '2', type: 'circle', x: 400, y: 100, radius: 10, isStatic: true, color: '#2c3e50' }
    ],
    constraints: [
      { id: 'c1', type: 'rope', bodyA: '2', bodyB: '1', length: 150 }
    ],
    createdAt: new Date()
  },
  {
    id: 'bridge',
    name: 'Bridge Structure',
    description: 'Test structural integrity with connected beams',
    objects: [
      { id: '1', type: 'box', x: 200, y: 400, width: 100, height: 20, color: '#8b4513' },
      { id: '2', type: 'box', x: 350, y: 400, width: 100, height: 20, color: '#8b4513' },
      { id: '3', type: 'box', x: 500, y: 400, width: 100, height: 20, color: '#8b4513' },
      { id: '4', type: 'ground', x: 400, y: 550, width: 800, height: 60 }
    ],
    constraints: [
      { id: 'c1', type: 'pivot', bodyA: '1', bodyB: '2' },
      { id: 'c2', type: 'pivot', bodyA: '2', bodyB: '3' }
    ],
    createdAt: new Date()
  },
  {
    id: 'catapult',
    name: 'Spring Catapult',
    description: 'Launch objects using spring mechanics',
    objects: [
      { id: '1', type: 'box', x: 200, y: 500, width: 150, height: 30, isStatic: true, color: '#2c3e50' },
      { id: '2', type: 'box', x: 350, y: 450, width: 80, height: 20, color: '#e67e22' },
      { id: '3', type: 'circle', x: 400, y: 400, radius: 25, color: '#e74c3c' },
      { id: '4', type: 'ground', x: 400, y: 580, width: 800, height: 60 }
    ],
    constraints: [
      { id: 'c1', type: 'spring', bodyA: '1', bodyB: '2', stiffness: 0.1 }
    ],
    createdAt: new Date()
  }
];

const templateIds = new Set(templates.map((template) => template.id));

const ExperimentLibrary: React.FC<ExperimentLibraryProps> = ({
  isOpen,
  onClose,
  onLoad,
  onSave,
  mode
}) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadExperiments();
    }
  }, [isOpen]);

  const loadExperiments = async () => {
    setIsLoading(true);
    setStatusMessage('');
    try {
      const savedExperiments = await listExperiments();
      const savedIds = new Set(savedExperiments.map((experiment) => experiment.id));
      setExperiments([
        ...savedExperiments,
        ...templates.filter((template) => !savedIds.has(template.id))
      ]);
    } catch (error) {
      console.error('Failed to load experiments:', error);
      setExperiments(templates);
      setStatusMessage('Could not reach the experiment server. Showing built-in templates only.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (name.trim()) {
      setIsSaving(true);
      setStatusMessage('');
      try {
        await onSave(name, description);
        setName('');
        setDescription('');
        await loadExperiments();
        onClose();
      } catch (error) {
        console.error('Failed to save experiment:', error);
        setStatusMessage('Could not save this experiment. Check that the backend and MongoDB are running.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleLoad = (experiment: Experiment) => {
    onLoad(experiment);
    onClose();
  };

  const handleDelete = async (id: string) => {
    if (templateIds.has(id)) return;
    setStatusMessage('');
    try {
      await deleteExperiment(id);
      setExperiments((current) => current.filter(exp => exp.id !== id));
    } catch (error) {
      console.error('Failed to delete experiment:', error);
      setStatusMessage('Could not delete this experiment from the server.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="bg-gray-900 p-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2">
            <BookOpen className="text-indigo-400" size={24} />
            <h2 className="text-2xl font-bold text-white">
              {mode === 'save' ? 'Save Experiment' : 'Experiment Library'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {mode === 'save' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Experiment Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500"
                  placeholder="Enter experiment name..."
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 h-24"
                  placeholder="Enter description..."
                />
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg font-semibold transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Experiment'}
              </button>
              {statusMessage && <p className="text-sm text-amber-300">{statusMessage}</p>}
            </div>
          ) : (
            <>
              {statusMessage && <p className="mb-4 text-sm text-amber-300">{statusMessage}</p>}
              {isLoading ? (
                <p className="text-gray-300">Loading experiments...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {experiments.map((exp) => (
                  <div
                    key={exp.id}
                    className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors border border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold text-white">{exp.name}</h3>
                      {!templateIds.has(exp.id) && (
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mb-3">{exp.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                      <span>{exp.objects.length} objects</span>
                      <span>{exp.constraints.length} constraints</span>
                    </div>
                    <button
                      onClick={() => handleLoad(exp)}
                      className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Download size={16} />
                      Load Experiment
                    </button>
                  </div>
                ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExperimentLibrary;
