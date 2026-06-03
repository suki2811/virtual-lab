import { Experiment } from '../types/physics';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_SOCKET_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');

const requestJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const listExperiments = () => requestJson<Experiment[]>('/api/experiments');

export const saveExperiment = (experiment: Experiment) =>
  requestJson<Experiment>('/api/experiments', {
    method: 'POST',
    body: JSON.stringify(experiment)
  });

export const deleteExperiment = async (id: string) => {
  const response = await fetch(`${API_URL}/api/experiments/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
};
