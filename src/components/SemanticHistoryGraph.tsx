import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import {
  buildHistoryGraphProjection,
  HistoryGraphProjectedNode,
  HistoryGraphProjectedEdge,
  VersionedConsensusMeta,
  SeparateCostEstimate,
  ConsensusAuditRunRecord,
} from "../consensusEngine";

export interface GraphChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  contextMode?: "MERGED_WITH_SAVED" | "NEW_QUERY_ONLY";
  historyMatchScore?: number;
  matchedPairIndices?: number[];
  achievedAgreement?: number;
  activeModels?: string[];
  nodeContributions?: Array<{
    modelName: string;
    agreementScore: number;
    latencyMs?: number;
    contributionScore?: number;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
  metadata?: {
    totalLatencyMs?: number;
    totalTokensUsed?: number;
    memoryOS?: any;
  };
  meta?: VersionedConsensusMeta;
  cost?: SeparateCostEstimate;
  auditRun?: ConsensusAuditRunRecord;
}

interface D3ProjectedNode
  extends HistoryGraphProjectedNode,
    d3.SimulationNodeDatum {}

interface D3ProjectedLink extends d3.SimulationLinkDatum<D3ProjectedNode> {
  id: string;
  source: string | D3ProjectedNode;
  target: string | D3ProjectedNode;
  category: HistoryGraphProjectedEdge["category"];
  type: HistoryGraphProjectedEdge["type"];
  weight: number;
  label: string;
}

interface SemanticHistoryGraphProps {
  messages: GraphChatMessage[];
  onSelectTurn: (messageId: string, turnNumber: number) => void;
}

export const SemanticHistoryGraph: React.FC<SemanticHistoryGraphProps> = ({
  messages,
  onSelectTurn,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<D3ProjectedNode | null>(null);
  const [selectedAuditNode, setSelectedAuditNode] =
    useState<D3ProjectedNode | null>(null);
  const [detailedExecutionNode, setDetailedExecutionNode] =
    useState<D3ProjectedNode | null>(null);
  const [showEngineNodes, setShowEngineNodes] = useState<boolean>(true);
  const [showMemoryAndMutationNodes, setShowMemoryAndMutationNodes] =
    useState<boolean>(true);
  const [adaptiveNodeCap, setAdaptiveNodeCap] = useState<number>(120);
  const [thresholdMode, setThresholdMode] = useState<"auto" | "custom">("auto");
  const [customThreshold, setCustomThreshold] = useState<number>(0.32);

  // Derive graph strictly via dedicated HistoryGraphProjection (never querying raw memory in UI)
  const projection = useMemo(() => {
    return buildHistoryGraphProjection(messages, {
      adaptiveNodeCap,
      semanticSimilarityThreshold:
        thresholdMode === "auto" ? "auto" : customThreshold,
      includeEngineNodes: showEngineNodes,
      includeMemoryNodes: showMemoryAndMutationNodes,
      includeMutationNodes: showMemoryAndMutationNodes,
    });
  }, [
    messages,
    adaptiveNodeCap,
    thresholdMode,
    customThreshold,
    showEngineNodes,
    showMemoryAndMutationNodes,
  ]);

  const relatedNodeIds = useMemo(() => {
    if (!selectedAuditNode) return new Set<string>();
    const set = new Set<string>([selectedAuditNode.id]);
    projection.edges.forEach((e) => {
      if (e.source === selectedAuditNode.id) set.add(e.target);
      if (e.target === selectedAuditNode.id) set.add(e.source);
    });
    projection.nodes.forEach((n) => {
      if (n.runId === selectedAuditNode.runId) set.add(n.id);
    });
    return set;
  }, [selectedAuditNode, projection]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth || 780;
    const height = 380;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    if (projection.nodes.length === 0) return;

    const g = svg.append("g").attr("class", "graph-canvas");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3.0])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Directed markers for the 3 distinct relationship categories
    const defs = svg.append("defs");
    const markerSpecs = [
      { id: "arrow-causal", color: "#10b981" },
      { id: "arrow-semantic", color: "#f59e0b" },
      { id: "arrow-temporal", color: "#f43f5e" },
    ];
    markerSpecs.forEach((m) => {
      defs
        .append("marker")
        .attr("id", m.id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 21)
        .attr("refY", 0)
        .attr("markerWidth", 5.5)
        .attr("markerHeight", 5.5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", m.color);
    });

    const simNodes: D3ProjectedNode[] = projection.nodes.map((d, idx) => ({
      ...d,
      x: width / 2 + ((idx % 6) - 2.5) * 95,
      y: height / 2 + (Math.floor(idx / 6) - 1.5) * 68,
    }));

    const simLinks: D3ProjectedLink[] = projection.edges.map((e) => ({
      ...e,
    }));

    const simulation = d3
      .forceSimulation<D3ProjectedNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<D3ProjectedNode, D3ProjectedLink>(simLinks)
          .id((d) => d.id)
          .distance((d) =>
            d.type === "contributed_to_consensus"
              ? 55
              : d.type === "dispatched_to_retrieval" ||
                d.type === "compiled_into_consensus" ||
                d.type === "triggered_mutation"
              ? 78
              : d.type === "retrieved_for"
              ? 82
              : 125
          )
      )
      .force("charge", d3.forceManyBody().strength(-230))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(32))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.07));

    const linkGroup = g
      .append("g")
      .attr("stroke-opacity", 0.88)
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke-width", (d) =>
        d.category === "temporal"
          ? 2.4
          : d.category === "semantic"
          ? 2.1
          : d.type === "contributed_to_consensus"
          ? 1.2
          : 1.8
      )
      .attr("stroke-dasharray", (d) =>
        d.category === "semantic"
          ? "6,3"
          : d.category === "temporal"
          ? "3,2"
          : d.type === "contributed_to_consensus"
          ? "2,2"
          : "none"
      )
      .attr("stroke", (d) =>
        d.category === "temporal"
          ? "#f43f5e"
          : d.category === "semantic"
          ? "#f59e0b"
          : d.type === "retrieved_for"
          ? "#38bdf8"
          : d.type === "contributed_to_consensus"
          ? "#64748b"
          : "#10b981"
      )
      .attr("marker-end", (d) =>
        d.category === "temporal"
          ? "url(#arrow-temporal)"
          : d.category === "semantic"
          ? "url(#arrow-semantic)"
          : d.type === "contributed_to_consensus"
          ? ""
          : "url(#arrow-causal)"
      );

    const linkLabels = g
      .append("g")
      .selectAll("text")
      .data(
        simLinks.filter(
          (l) =>
            l.type === "retrieved_for" ||
            l.category === "semantic" ||
            l.category === "temporal"
        )
      )
      .join("text")
      .attr("font-size", 8.5)
      .attr("font-family", "monospace")
      .attr("fill", (d) =>
        d.category === "temporal"
          ? "#fda4af"
          : d.category === "semantic"
          ? "#fcd34d"
          : "#7dd3fc"
      )
      .attr("text-anchor", "middle")
      .text((d) => d.label);

    const nodeGroup = g
      .append("g")
      .selectAll<SVGGElement, D3ProjectedNode>("g")
      .data(simNodes)
      .join("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, D3ProjectedNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("mouseenter", (_event, d) => {
        setHoveredNode(d);
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        // Section 31: Single click highlights related records + selects audit entry (never triggers a new AI run)
        setSelectedAuditNode(d);
      })
      .on("dblclick", (event, d) => {
        event.stopPropagation();
        // Section 31: Double click opens detailed execution inspector
        setDetailedExecutionNode(d);
      });

    nodeGroup
      .append("circle")
      .attr("r", (d) =>
        d.nodeType === "consensus"
          ? 16
          : d.nodeType === "query"
          ? 14
          : d.nodeType === "task" || d.nodeType === "retrieval"
          ? 12
          : d.nodeType === "memory" ||
            d.nodeType === "memory_mutation" ||
            d.nodeType === "patch" ||
            d.nodeType === "test"
          ? 11
          : 9
      )
      .attr("fill", (d) =>
        d.nodeType === "query"
          ? "#0284c7"
          : d.nodeType === "task"
          ? "#4f46e5"
          : d.nodeType === "retrieval"
          ? "#0891b2"
          : d.nodeType === "memory"
          ? "#d97706"
          : d.nodeType === "consensus"
          ? "#059669"
          : d.nodeType === "patch"
          ? "#0d9488"
          : d.nodeType === "test"
          ? "#16a34a"
          : d.nodeType === "memory_mutation"
          ? "#7c3aed"
          : "#334155"
      )
      .attr("stroke", (d) =>
        d.nodeType === "query"
          ? "#38bdf8"
          : d.nodeType === "task"
          ? "#818cf8"
          : d.nodeType === "retrieval"
          ? "#22d3ee"
          : d.nodeType === "memory"
          ? "#fbbf24"
          : d.nodeType === "consensus"
          ? "#34d399"
          : d.nodeType === "patch"
          ? "#2dd4bf"
          : d.nodeType === "test"
          ? "#4ade80"
          : d.nodeType === "memory_mutation"
          ? "#a78bfa"
          : "#94a3b8"
      )
      .attr("stroke-width", 2);

    nodeGroup
      .append("text")
      .attr("dy", 3)
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.nodeType === "engine" ? 7 : 8))
      .attr("font-weight", "bold")
      .attr("font-family", "monospace")
      .attr("fill", "#ffffff")
      .text((d) =>
        d.nodeType === "query"
          ? "REQ"
          : d.nodeType === "task"
          ? "TSK"
          : d.nodeType === "retrieval"
          ? "RET"
          : d.nodeType === "memory"
          ? "MEM"
          : d.nodeType === "consensus"
          ? `${d.metrics?.agreementScore || 97}%`
          : d.nodeType === "patch"
          ? "PAT"
          : d.nodeType === "test"
          ? "TST"
          : d.nodeType === "memory_mutation"
          ? "VER"
          : "ENG"
      );

    nodeGroup
      .append("text")
      .attr("dy", (d) => (d.nodeType === "engine" ? 18 : 25))
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.nodeType === "engine" ? 7.5 : 9.5))
      .attr("font-weight", "600")
      .attr("fill", (d) =>
        d.nodeType === "query"
          ? "#bae6fd"
          : d.nodeType === "task"
          ? "#c7d2fe"
          : d.nodeType === "retrieval"
          ? "#a5f3fc"
          : d.nodeType === "memory"
          ? "#fde68a"
          : d.nodeType === "consensus"
          ? "#a7f3d0"
          : d.nodeType === "patch"
          ? "#99f6e4"
          : d.nodeType === "test"
          ? "#bbf7d0"
          : d.nodeType === "memory_mutation"
          ? "#ddd6fe"
          : "#cbd5e1"
      )
      .text((d) => d.label);

    simulation.on("tick", () => {
      linkGroup
        .attr("x1", (d) => (d.source as D3ProjectedNode).x || 0)
        .attr("y1", (d) => (d.source as D3ProjectedNode).y || 0)
        .attr("x2", (d) => (d.target as D3ProjectedNode).x || 0)
        .attr("y2", (d) => (d.target as D3ProjectedNode).y || 0);

      linkLabels
        .attr(
          "x",
          (d) =>
            (((d.source as D3ProjectedNode).x || 0) +
              ((d.target as D3ProjectedNode).x || 0)) /
            2
        )
        .attr(
          "y",
          (d) =>
            (((d.source as D3ProjectedNode).y || 0) +
              ((d.target as D3ProjectedNode).y || 0)) /
              2 -
            4
        );

      nodeGroup.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [projection, onSelectTurn]);

  return (
    <div className="rounded-xl bg-slate-950 border border-sky-500/40 p-3.5 space-y-3">
      {/* Header + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-bold text-sky-300 text-xs">
              KEY v3.0 Provenance &amp; Audit Graph (USER_REQUEST → TASK → MEMORY / ENGINE_RUN → CONSENSUS → PATCH → TEST → VERSION)
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-300">
              {projection.projectionVersion}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Projection of the audit database (never triggers an AI run on click).{" "}
            <strong className="text-emerald-300">
              Single-click a node to highlight related provenance records · Double-click for Detailed Execution Inspector.
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setShowMemoryAndMutationNodes((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border font-mono font-semibold cursor-pointer transition ${
              showMemoryAndMutationNodes
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                : "bg-slate-900 border-slate-700 text-slate-400"
            }`}
          >
            {showMemoryAndMutationNodes
              ? "● Memory, Patch, Test & Version Nodes"
              : "○ Memory, Patch, Test & Version Nodes"}
          </button>

          <button
            type="button"
            onClick={() => setShowEngineNodes((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border font-mono font-semibold cursor-pointer transition ${
              showEngineNodes
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "bg-slate-900 border-slate-700 text-slate-400"
            }`}
          >
            {showEngineNodes ? "● Specialist Engine Runs" : "○ Specialist Engine Runs"}
          </button>

          {/* Adaptive Node Cap Selector (~100-150 default, progressively expandable) */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 font-mono text-[10px]">
            <span className="text-slate-400">Adaptive Cap:</span>
            {[120, 200, 350].map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => setAdaptiveNodeCap(cap)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  adaptiveNodeCap === cap
                    ? "bg-sky-500 text-slate-950 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calibrated Semantic Threshold Bar + Counts */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-300 font-semibold">
            Semantic Threshold:
          </span>
          <button
            type="button"
            onClick={() => setThresholdMode("auto")}
            className={`px-2 py-0.5 rounded border cursor-pointer ${
              thresholdMode === "auto"
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                : "bg-slate-950 border-slate-800 text-slate-400"
            }`}
          >
            Auto-Calibrated ({projection.calibration.recommendedThreshold})
          </button>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.05}
              value={
                thresholdMode === "auto"
                  ? projection.calibration.recommendedThreshold
                  : customThreshold
              }
              onChange={(e) => {
                setThresholdMode("custom");
                setCustomThreshold(Number(e.target.value));
              }}
              className="w-24 accent-amber-400 cursor-pointer"
            />
            <span className="text-amber-300">
              cos ≥ {projection.calibration.configuredThreshold.toFixed(2)}
            </span>
            <span className="text-slate-500">
              (μ={projection.calibration.calibratedMeanSimilarity}, σ=
              {projection.calibration.calibratedStdDev})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <span>
            Nodes: <strong>{projection.nodes.length}</strong>/
            {projection.calibration.adaptiveNodeCap}
          </span>
          <span>·</span>
          <span className="text-emerald-300">
            Provenance Edges: {projection.counts.causalEdges}
          </span>
          <span>·</span>
          <span className="text-amber-300">
            Semantic Edges: {projection.counts.semanticEdges}
          </span>
          <span>·</span>
          <span className="text-rose-300">
            Temporal (superseded_by): {projection.counts.temporalEdges}
          </span>
        </div>
      </div>

      {/* Legend for Provenance Node Types & Explicit Edge Types */}
      <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-mono text-slate-300 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
          USER_REQUEST
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
          TASK
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
          MEMORY
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
          ENGINE_RUN
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
          CONSENSUS
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
          PATCH
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" />
          TEST
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-600 inline-block" />
          VERSION
        </span>
        <span className="text-slate-600">|</span>
        <span className="flex items-center gap-1 text-emerald-300">
          <span className="w-3.5 h-0.5 bg-emerald-400 inline-block" />
          Provenance (retrieved_from / analyzed_by / produced / verified_by)
        </span>
        <span className="flex items-center gap-1 text-rose-300">
          <span className="w-3.5 h-0.5 bg-rose-400 inline-block" />
          Temporal (superseded_by)
        </span>
      </div>

      {projection.nodes.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-slate-400 text-xs bg-slate-900/40 rounded-lg border border-slate-800">
          Send a message to populate the derived HistoryGraphProjection.
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900/70">
          <svg
            ref={svgRef}
            className="w-full h-[380px] block select-none"
          />
          {hoveredNode && (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 p-2.5 rounded-lg bg-slate-950/95 border border-sky-500/40 text-[11px] text-slate-200 shadow-xl pointer-events-none flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5 max-w-xl">
                <div className="font-bold text-sky-300 font-mono">
                  [{hoveredNode.nodeType.toUpperCase()}] {hoveredNode.label} ·{" "}
                  {hoveredNode.subtitle} ({hoveredNode.timestamp})
                </div>
                <div className="text-slate-300 line-clamp-2">
                  {hoveredNode.fullText}
                </div>
                {hoveredNode.tokens.length > 0 && (
                  <div className="text-[10px] font-mono text-emerald-400">
                    Tokens: #{hoveredNode.tokens.join(" #")}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 font-mono text-[10px]">
                {hoveredNode.metrics?.contributionScore !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                    Reproducible Contrib: {hoveredNode.metrics.contributionScore}%
                  </span>
                )}
                {hoveredNode.metrics?.latencyMs !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                    ⚡ {hoveredNode.metrics.latencyMs} ms
                  </span>
                )}
                {hoveredNode.metrics?.totalTokens !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-violet-300">
                    🪙 {hoveredNode.metrics.totalTokens.toLocaleString()} Tokens
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 31: Single-Click Highlighted Provenance Record Drawer */}
      {selectedAuditNode && (
        <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                SELECTED AUDIT RECORD ({selectedAuditNode.nodeType.toUpperCase()})
              </span>
              <span className="font-bold text-white">
                {selectedAuditNode.label}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                Run: {selectedAuditNode.runId} · Related Provenance Nodes:{" "}
                {relatedNodeIds.size}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailedExecutionNode(selectedAuditNode)}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold text-[11px] cursor-pointer"
              >
                Inspect Detailed Execution
              </button>
              <button
                type="button"
                onClick={() =>
                  onSelectTurn(
                    selectedAuditNode.messageId,
                    selectedAuditNode.turnNumber
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-[11px] cursor-pointer"
              >
                Jump to Turn #{selectedAuditNode.turnNumber} →
              </button>
              <button
                type="button"
                onClick={() => setSelectedAuditNode(null)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
          <p className="text-slate-300 text-[11px]">
            {selectedAuditNode.fullText}
          </p>
        </div>
      )}

      {/* Section 31: Double-Click Detailed Execution Inspector Modal */}
      {detailedExecutionNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-sky-500/50 p-5 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[10px] font-bold">
                  DETAILED EXECUTION INSPECTOR
                </span>
                <span className="font-bold text-white text-sm">
                  {detailedExecutionNode.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailedExecutionNode(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
              <div className="p-2 rounded bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Node ID / Type</div>
                <div className="text-emerald-300 font-bold">
                  {detailedExecutionNode.id} ({detailedExecutionNode.nodeType})
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Run ID / Turn</div>
                <div className="text-sky-300 font-bold">
                  {detailedExecutionNode.runId} · Turn #{detailedExecutionNode.turnNumber}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px]">Metrics</div>
                <div className="text-amber-300 font-bold">
                  {detailedExecutionNode.metrics?.latencyMs
                    ? `${detailedExecutionNode.metrics.latencyMs}ms · ${
                        detailedExecutionNode.metrics.totalTokens || 0
                      } tok`
                    : detailedExecutionNode.subtitle}
                </div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 leading-relaxed">
              {detailedExecutionNode.fullText}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const node = detailedExecutionNode;
                  setDetailedExecutionNode(null);
                  onSelectTurn(node.messageId, node.turnNumber);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold cursor-pointer"
              >
                Navigate to Conversation Turn #{detailedExecutionNode.turnNumber} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
