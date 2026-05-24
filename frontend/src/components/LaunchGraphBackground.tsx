import { useEffect, useRef } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import {
  buildLaunchGraph,
  buildLaunchGraphLinks,
  type LaunchGraphLink,
  type LaunchGraphNode,
} from "./launchGraph";
import { getLaunchGraphOrigin } from "./launchGraphBackgroundLayout";

const GRAPH_NODES = buildLaunchGraph();
const GRAPH_LINKS = buildLaunchGraphLinks(GRAPH_NODES);

type SimNode = LaunchGraphNode &
  SimulationNodeDatum & {
    visibleAt: number;
    driftOffset: number;
  };

type SimLink = LaunchGraphLink & {
  source: SimNode;
  target: SimNode;
} & SimulationLinkDatum<SimNode>;

function easeOutBack(progress: number) {
  const s = 1.70158;
  const shifted = progress - 1;
  return 1 + shifted * shifted * ((s + 1) * shifted + s);
}

export function LaunchGraphBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const nodes: SimNode[] = GRAPH_NODES.map((node) => ({
      ...node,
      x: (node.x - 50) * 8.6,
      y: (node.y - 50) * 8.6,
      vx: 0,
      vy: 0,
      visibleAt: node.delayMs,
      driftOffset: node.delayMs * 0.005,
    }));

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = GRAPH_LINKS.flatMap((link) => {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      if (!source || !target) return [];
      return [
        {
          ...link,
          source,
          target,
        },
      ];
    });

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) =>
            link.source.parentId === link.target.id ||
            link.target.parentId === link.source.id
              ? 50
              : 70,
          )
          .strength((link) =>
            link.source.parentId === link.target.id ||
            link.target.parentId === link.source.id
              ? 0.9
              : 0.34,
          ),
      )
      .force("charge", forceManyBody().strength(-100))
      .force("center", forceCenter(0, -40))
      .force(
        "collision",
        forceCollide<SimNode>()
          .radius((node) => node.size + 8)
          .strength(0.72),
      )
      .velocityDecay(0.16)
      .alphaDecay(0.008);

    simulation.on("tick", () => {});

    let width = 0;
    let height = 0;
    let frameId = 0;
    let startTime = 0;

    const resize = () => {
      width = Math.max(1, Math.floor(container.clientWidth));
      height = Math.max(1, Math.floor(container.clientHeight));
      canvas.width = width;
      canvas.height = height;
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);
    resize();

    const context = canvas.getContext("2d");
    if (!context) {
      resizeObserver.disconnect();
      simulation.stop();
      return;
    }

    const draw = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const origin = getLaunchGraphOrigin(width, height);

      // Keep the background alive instead of letting the layout fully freeze.
      if (Math.sin(timestamp * 0.00055) > 0.985) {
        simulation.alphaTarget(0.12).restart();
      } else {
        simulation.alphaTarget(0.025);
      }

      context.clearRect(0, 0, width, height);

      for (const link of links) {
        const source = link.source;
        const target = link.target;
        if (elapsed < source.visibleAt || elapsed < target.visibleAt) continue;

        const sourceAge = elapsed - source.visibleAt;
        const targetAge = elapsed - target.visibleAt;
        const reveal = Math.min(sourceAge, targetAge);
        const alpha = Math.max(0, Math.min(1, reveal / 320));
        const sourceDriftX =
          Math.cos(timestamp * 0.00055 + source.driftOffset) * 1.4;
        const sourceDriftY =
          Math.sin(timestamp * 0.00045 + source.driftOffset) * 1.4;
        const targetDriftX =
          Math.cos(timestamp * 0.00055 + target.driftOffset) * 1.4;
        const targetDriftY =
          Math.sin(timestamp * 0.00045 + target.driftOffset) * 1.4;
        const isParentLink =
          source.parentId === target.id || target.parentId === source.id;

        context.beginPath();
        context.moveTo(
          origin.x + source.x + sourceDriftX,
          origin.y + source.y + sourceDriftY,
        );
        context.lineTo(
          origin.x + target.x + targetDriftX,
          origin.y + target.y + targetDriftY,
        );
        context.lineWidth = isParentLink ? 1 : 0.85;
        context.strokeStyle = isParentLink
          ? `rgba(55, 116, 71, ${0.12 + alpha * 0.18})`
          : `rgba(86, 138, 78, ${0.06 + alpha * 0.1})`;
        context.stroke();
      }

      for (const node of nodes) {
        if (elapsed < node.visibleAt) continue;

        const age = elapsed - node.visibleAt;
        const progress = Math.min(1, age / 420);
        const scale = easeOutBack(progress);
        const radius = node.size * scale;
        const driftX = Math.cos(timestamp * 0.00055 + node.driftOffset) * 1.4;
        const driftY = Math.sin(timestamp * 0.00045 + node.driftOffset) * 1.4;
        const x = origin.x + node.x + driftX;
        const y = origin.y + node.y + driftY;
        const haloAlpha = Math.max(0, 1 - progress) * 0.12;

        context.beginPath();
        context.arc(x, y, radius * (1.45 - progress * 0.2), 0, Math.PI * 2);
        context.fillStyle = `rgba(122, 182, 113, ${haloAlpha})`;
        context.fill();

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = "rgba(96, 162, 87, 0.94)";
        context.shadowColor = "rgba(140, 214, 132, 0.24)";
        context.shadowBlur = 8;
        context.fill();
        context.shadowBlur = 0;
      }

      frameId = window.requestAnimationFrame(draw);
    };

    frameId = window.requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
      simulation.stop();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#f6f7ee_0%,#e8efdf_32%,#d9e7d5_58%,#c6d7c8_100%)]" />
      <div className="absolute inset-x-[-8%] top-[-12%] h-[42rem] rounded-full bg-[radial-gradient(circle,rgba(245,250,235,0.92)_0%,rgba(245,250,235,0)_68%)]" />
      <div className="absolute inset-x-[12%] bottom-[-24%] h-[30rem] rounded-full bg-[radial-gradient(circle,rgba(171,197,167,0.26)_0%,rgba(171,197,167,0)_72%)]" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-90"
      />
      <div className="absolute inset-0 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(237,243,231,0)_0%,rgba(237,243,231,0.10)_48%,rgba(237,243,231,0.22)_100%)]" />
    </div>
  );
}
