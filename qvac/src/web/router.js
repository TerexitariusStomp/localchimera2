/**
 * Declarative route table.
 * Each entry: [method, pathname, handlerName]
 * Matched in order; first match wins.
 */
export const ROUTES = [
  // Core
  ['POST', '/api/consent',            'handleConsent'],
  ['POST', '/api/signin',             'handleSignIn'],
  ['GET',  '/api/download',           'handleDownload'],
  ['GET',  '/api/status',             'handleStatus'],
  // AI Writer
  ['POST', '/api/ai-write',           'handleAIWrite'],
  ['GET',  '/api/ai-status',          'handleAIStatus'],
  ['GET',  '/api/ai-docs',            'handleAIDocs'],
  // LLM Wiki
  ['POST', '/api/llmwiki-create',     'handleLLMWikiCreate'],
  ['POST', '/api/llmwiki-upload',     'handleLLMWikiUpload'],
  ['POST', '/api/convert-to-md',      'handleConvertToMd'],
  ['POST', '/api/repo-to-md',          'handleRepoToMd'],
  ['POST', '/api/llmwiki-save',       'handleLLMWikiSave'],
  ['GET',  '/api/llmwiki-docs',       'handleLLMWikiDocs'],
  ['GET',  '/api/llmwiki-search',     'handleLLMWikiSearch'],
  ['GET',  '/api/llmwiki-graph',      'handleLLMWikiGraph'],
  ['DELETE', '/api/llmwiki-delete',   'handleLLMWikiDelete'],
  ['GET',  '/api/wiki-status',        'handleWikiStatus'],
  // Swarm
  ['POST', '/api/swarm/create',        'handleSwarmCreate'],
  ['POST', '/api/swarm/join',          'handleSwarmJoin'],
  ['GET',  '/api/swarm/status',        'handleSwarmStatus'],
  // Fleet Orchestrator
  ['POST', '/api/commander/register', 'handleCommanderRegister'],
  ['GET',  '/api/commander/workers',  'handleCommanderWorkers'],
  ['GET',  '/api/commander/stats',    'handleCommanderStats'],
  ['GET',  '/api/commander/jobs',     'handleCommanderJobs'],
  ['POST', '/api/commander/complete', 'handleCommanderComplete'],
  ['POST', '/api/commander/distribute','handleCommanderDistribute'],
  ['POST', '/api/commander/stop',     'handleCommanderStop'],
  ['POST', '/api/commander/start',    'handleCommanderStart'],
  ['POST', '/api/worker/stop',        'handleWorkerStop'],
  // Miner
  ['POST', '/api/start',              'handleStart'],
  ['POST', '/api/stop',               'handleStop'],
  ['POST', '/api/miner-test',         'handleMinerTest'],
];

/**
 * Match an incoming request against the route table.
 * Returns the handler name or null.
 */
export function matchRoute(method, pathname) {
  for (const [m, p, handler] of ROUTES) {
    if (m === method && p === pathname) return handler;
  }
  return null;
}
