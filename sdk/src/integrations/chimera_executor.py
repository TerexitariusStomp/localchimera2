"""
ChimeraExecutor — ROMA Executor that routes atomic tasks to Chimera nodes.

This module integrates ROMA (Recursive Open Meta-Agent) with Chimera's
decentralized tasking network. It replaces ROMA's default LLM-only executor
with one that dispatches subtasks to Chimera nodes via the container API.

ROMA TaskType → Chimera taskType mapping:
    RETRIVE        → inference (query knowledge via WebLLM/transformers)
    WRITE          → inference (generate text)
    THINK          → inference (reasoning)
    CODE_INTERPRET → compute (WASM/shell/JS execution)
    IMAGE_GEN      → inference (image generation model)

Installation:
    pip install roma-dspy

Usage:
    from roma_dspy import Executor, Atomizer, Planner, Aggregator, Verifier
    from chimera_executor import ChimeraExecutor

    # Use ChimeraExecutor instead of default Executor
    executor = ChimeraExecutor(
        chimera_api_url="http://localhost:3002/api",
        chimera_api_key=None,  # or Bearer token
    )

    atomizer = Atomizer(lm=...)
    planner = Planner(lm=...)
    aggregator = Aggregator(lm=...)
    verifier = Verifier(lm=...)

    # ROMA pipeline with Chimera routing
    atomized = atomizer.forward(goal)
    if atomized.is_atomic:
        result = executor.forward(goal)
    else:
        plan = planner.forward(goal)
        results = [executor.forward(st.goal) for st in plan.subtasks]
        final = aggregator.forward(goal, results)

Container REST API:
    POST /api/roma/task
    {
        "goal": "Summarize the latest AI news",
        "task_type": "RETRIEVE",
        "context": {"max_tokens": 512},
        "call_params": {"temperature": 0.7}
    }
    → {
        "output": "...",
        "sources": [],
        "task_type": "RETRIEVE",
        "chimera_task_type": 0,
        "node_id": "browser-abc123",
        "execution_time_ms": 1234,
        "proof": "..."
    }
"""

import json
import time
from typing import Any, Dict, List, Optional

try:
    import dspy
    from roma_dspy.core.modules.base_module import BaseModule
    from roma_dspy.types import TaskType
    ROMA_AVAILABLE = True
except ImportError:
    ROMA_AVAILABLE = False
    BaseModule = object
    TaskType = None

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    import urllib.request


class ChimeraExecutor(BaseModule if ROMA_AVAILABLE else object):
    """
    ROMA Executor that routes atomic tasks to Chimera tasking network nodes.

    Instead of calling an LLM API directly, this executor sends the task to
    the Chimera container API which dispatches it to an available node
    (browser or container) based on the task type.
    """

    # ROMA TaskType → Chimera task type mapping
    TASK_TYPE_MAP = {
        "RETRIEVE": 0,       # INFERENCE
        "WRITE": 0,          # INFERENCE
        "THINK": 0,          # INFERENCE
        "CODE_INTERPRET": 2, # COMPUTE
        "IMAGE_GEN": 0,      # INFERENCE
    }

    def __init__(
        self,
        chimera_api_url: str = "http://localhost:3002/api",
        chimera_api_key: Optional[str] = None,
        lm: Optional[Any] = None,
        prediction_strategy: str = "react",
        tools: Optional[List] = None,
        fallback_to_lm: bool = True,
        **kwargs,
    ):
        """
        Args:
            chimera_api_url: Chimera container API base URL
            chimera_api_key: Optional Bearer token for API auth
            lm: Fallback LM (used if Chimera routing fails and fallback_to_lm=True)
            prediction_strategy: ROMA prediction strategy name
            tools: List of callable tools
            fallback_to_lm: If True, fall back to direct LM call when Chimera fails
            **kwargs: Additional BaseModule kwargs
        """
        self.api_url = chimera_api_url.rstrip("/")
        self.api_key = chimera_api_key
        self.fallback_to_lm = fallback_to_lm
        self._lm = lm
        self._prediction_strategy = prediction_strategy
        self._tools = tools or []
        self._stats = {"routed": 0, "succeeded": 0, "failed": 0, "fallback": 0}

        if ROMA_AVAILABLE:
            super().__init__(
                prediction_strategy=prediction_strategy,
                lm=lm,
                tools=tools,
                **kwargs,
            )

    def forward(self, goal: str, task_type: Optional[str] = None, **kwargs) -> Any:
        """
        Execute an atomic task by routing it to Chimera nodes.

        Args:
            goal: The task description
            task_type: ROMA task type (auto-detected if not provided)
            **kwargs: Additional params (context, call_params, tools, etc.)

        Returns:
            ExecutorResult-compatible object with .output and .sources
        """
        self._stats["routed"] += 1
        start_time = time.time()

        # Auto-detect task type from goal if not provided
        if task_type is None:
            task_type = self._detect_task_type(goal)

        # Build request payload
        payload = {
            "goal": goal,
            "task_type": task_type,
            "context": kwargs.get("context", {}),
            "call_params": kwargs.get("call_params", {}),
        }

        try:
            result = self._call_chimera(payload)
            elapsed_ms = int((time.time() - start_time) * 1000)
            self._stats["succeeded"] += 1

            return self._make_result(
                output=result.get("output", ""),
                sources=result.get("sources", []),
                task_type=task_type,
                node_id=result.get("node_id", "unknown"),
                elapsed_ms=elapsed_ms,
                proof=result.get("proof"),
            )
        except Exception as e:
            self._stats["failed"] += 1
            if self.fallback_to_lm and self._lm:
                self._stats["fallback"] += 1
                return self._fallback_to_lm(goal, **kwargs)
            raise

    def _call_chimera(self, payload: Dict) -> Dict:
        """Send task to Chimera container API."""
        url = f"{self.api_url}/roma/task"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = json.dumps(payload).encode()

        if REQUESTS_AVAILABLE:
            resp = requests.post(url, data=data, headers=headers, timeout=120)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())

    def _detect_task_type(self, goal: str) -> str:
        """Heuristic task type detection from goal text."""
        goal_lower = goal.lower()
        if any(w in goal_lower for w in ["code", "execute", "run", "compute", "script", "function"]):
            return "CODE_INTERPRET"
        if any(w in goal_lower for w in ["retrieve", "search", "find", "lookup", "query"]):
            return "RETRIEVE"
        if any(w in goal_lower for w in ["write", "draft", "compose", "create", "generate"]):
            return "WRITE"
        if any(w in goal_lower for w in ["image", "picture", "draw", "render"]):
            return "IMAGE_GEN"
        return "THINK"

    def _make_result(self, output, sources, task_type, node_id, elapsed_ms, proof=None):
        """Create a result object compatible with ROMA's ExecutorResult."""
        if ROMA_AVAILABLE:
            from roma_dspy.core.modules.executor import ExecutorResult
            result = ExecutorResult(output=output, sources=sources)
            result.task_type = task_type
            result.node_id = node_id
            result.execution_time_ms = elapsed_ms
            result.proof = proof
            return result
        else:
            return {
                "output": output,
                "sources": sources,
                "task_type": task_type,
                "node_id": node_id,
                "execution_time_ms": elapsed_ms,
                "proof": proof,
            }

    def _fallback_to_lm(self, goal: str, **kwargs):
        """Fall back to direct LM call via ROMA's default executor."""
        if not ROMA_AVAILABLE:
            return {"output": "", "sources": []}

        # Use parent class forward method
        return super().forward(goal, **kwargs)

    def stats(self) -> Dict:
        """Return routing statistics."""
        return dict(self._stats)


def create_chimera_pipeline(
    api_url: str = "http://localhost:3002/api",
    api_key: Optional[str] = None,
    planner_lm: Optional[Any] = None,
    atomizer_lm: Optional[Any] = None,
    aggregator_lm: Optional[Any] = None,
    verifier_lm: Optional[Any] = None,
) -> Dict:
    """
    Create a complete ROMA pipeline with ChimeraExecutor.

    Returns a dict with: atomizer, planner, executor, aggregator, verifier
    """
    if not ROMA_AVAILABLE:
        raise ImportError("roma-dspy not installed. Run: pip install roma-dspy")

    from roma_dspy import Atomizer, Planner, Aggregator, Verifier

    executor = ChimeraExecutor(
        chimera_api_url=api_url,
        chimera_api_key=api_key,
        fallback_to_lm=True,
        lm=planner_lm,  # use planner's LM as fallback
    )

    atomizer = Atomizer(lm=atomizer_lm or planner_lm, prediction_strategy="cot")
    planner = Planner(lm=planner_lm, prediction_strategy="cot")
    aggregator = Aggregator(lm=aggregator_lm or planner_lm, prediction_strategy="cot")
    verifier = Verifier(lm=verifier_lm or planner_lm)

    return {
        "atomizer": atomizer,
        "planner": planner,
        "executor": executor,
        "aggregator": aggregator,
        "verifier": verifier,
    }


def solve_with_chimera(
    goal: str,
    api_url: str = "http://localhost:3002/api",
    api_key: Optional[str] = None,
    pipeline: Optional[Dict] = None,
) -> str:
    """
    One-call ROMA + Chimera pipeline.

    Usage:
        from chimera_executor import solve_with_chimera
        answer = solve_with_chimera("Plan a weekend in Barcelona", api_url="http://localhost:3002/api")
    """
    if pipeline is None:
        pipeline = create_chimera_pipeline(api_url=api_url, api_key=api_key)

    atomizer = pipeline["atomizer"]
    planner = pipeline["planner"]
    executor = pipeline["executor"]
    aggregator = pipeline["aggregator"]
    verifier = pipeline["verifier"]

    atomized = atomizer.forward(goal)

    if atomized.is_atomic or atomized.node_type.is_execute:
        execution = executor.forward(goal)
        candidate = execution.output if hasattr(execution, "output") else execution["output"]
    else:
        plan = planner.forward(goal)
        results = []
        for subtask in plan.subtasks:
            execution = executor.forward(subtask.goal, task_type=subtask.task_type.value if hasattr(subtask.task_type, 'value') else str(subtask.task_type))
            results.append(execution)
        aggregated = aggregator.forward(goal, results)
        candidate = aggregated.synthesized_result

    verdict = verifier.forward(goal, candidate)
    if hasattr(verdict, 'verdict'):
        if verdict.verdict:
            return candidate
        return f"Verifier flagged: {verdict.feedback or 'no feedback'}"
    else:
        return candidate
