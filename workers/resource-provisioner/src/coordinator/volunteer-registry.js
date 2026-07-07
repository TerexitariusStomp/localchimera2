import { normalizeTaskTypes, normalizeTaskType } from './task-types.js';

/**
 * VolunteerRegistry — tracks connected volunteers and selects the best match for a job.
 *
 * Selection criteria:
 *   - Task type must overlap (normalized to canonical 0-3).
 *   - Network must be supported (casper / botchain).
 *   - Prefer idle volunteers over busy ones.
 *   - Prefer volunteers with higher trust score / capability fit.
 */
export class VolunteerRegistry {
  constructor() {
    this.volunteers = new Map(); // id -> volunteer
  }

  register({ id, address, taskTypes, capabilities, networks, ws, network }) {
    const volunteer = {
      id: id || generateId(),
      address: address || '',
      taskTypes: normalizeTaskTypes(taskTypes || [], network),
      capabilities: capabilities || {},
      networks: networks || ['casper', 'botchain'],
      ws,
      status: 'idle',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
    this.volunteers.set(volunteer.id, volunteer);
    return volunteer;
  }

  remove(id) {
    this.volunteers.delete(id);
  }

  get(id) {
    return this.volunteers.get(id) || null;
  }

  count() {
    return this.volunteers.size;
  }

  countByTaskType() {
    const counts = {};
    for (const v of this.volunteers.values()) {
      for (const tt of v.taskTypes) {
        counts[tt] = (counts[tt] || 0) + 1;
      }
    }
    return counts;
  }

  selectVolunteer(taskType, networks = ['casper', 'botchain'], network = '') {
    const canonicalTaskType = normalizeTaskType(taskType, network);
    const now = Date.now();
    const candidates = Array.from(this.volunteers.values()).filter((v) => {
      if (!v.ws || v.ws.readyState !== 1) return false; // WebSocket.OPEN
      if (v.lastHeartbeat && now - v.lastHeartbeat > 60000) return false;
      if (!v.taskTypes.includes(canonicalTaskType)) return false;
      if (!networks.some(n => v.networks.includes(n))) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    // Sort: idle first, then by trust score / capability score
    candidates.sort((a, b) => {
      if (a.status === 'idle' && b.status !== 'idle') return -1;
      if (a.status !== 'idle' && b.status === 'idle') return 1;
      return score(b) - score(a);
    });

    return candidates[0];
  }

  all() {
    return Array.from(this.volunteers.values());
  }
}

function score(volunteer) {
  let s = 0;
  const caps = volunteer.capabilities || {};
  if (caps.hasWebGPU) s += 10;
  if (caps.hasGpu) s += 5;
  if (caps.cpuCores) s += Math.min(caps.cpuCores, 8);
  if (caps.ramGb) s += Math.min(caps.ramGb, 16);
  if (caps.deviceTrustScore) s += caps.deviceTrustScore * 10;
  return s;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
