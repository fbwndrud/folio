import { useT } from '../i18n/context.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { hrefFor } from '../lib/route.js';
import { kindLabel } from '../lib/labels.js';
import { colorFor, colorKey, loadColors, saveColors } from '../lib/colors.js';

const elk = new ELK();
const local = () => { try { return window.localStorage; } catch { return null; } };
const size = (label, width = 260) => ({ width, height: Math.max(70, Math.ceil([...label].length / Math.max(1, Math.floor((width - 24) / 14))) * 22 + 24) });
export default function ConnectionDiagram({ graph, title }) {
  const t = useT();
  const [positions, setPositions] = useState(null);
  const canvas = useRef(null);
  const [width, setWidth] = useState(0);
  const compact = width < 700;
  const nodeWidth = compact ? Math.min(260, Math.max(100, width - 64)) : 260;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const key = colorKey(title ?? '');
  const [colors, setColors] = useState(() => loadColors(local(), key));
  useEffect(() => {
    if (!width) return undefined;
    if (compact) {
      let top = 20;
      setPositions(new Map([...graph.entities, ...graph.nodes].map((n) => { const position = { x: (width - nodeWidth) / 2, y: top }; top += size(n.label, nodeWidth).height + 36; return [n.id, position]; })));
      return undefined;
    }
    let alive = true;
    elk.layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '32', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' },
      children: [...graph.nodes, ...graph.entities].map((n) => ({ id: n.id, ...size(n.label) })),
      edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })) })
      .then((result) => { if (alive) setPositions(new Map(result.children.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))); }, () => { if (alive) setPositions(new Map()); });
    return () => { alive = false; };
  }, [graph, width, compact, nodeWidth]);
  const flow = useMemo(() => positions && ({ nodes: [...graph.nodes, ...graph.entities].map((n) => ({ id: n.id, position: positions.get(n.id) ?? { x: 0, y: 0 },
    sourcePosition: compact ? Position.Left : Position.Right, targetPosition: Position.Left,
    data: { label: n.label, href: hrefFor(n.kind ? 'entity' : 'read', n.refId) },
    style: { ...size(n.label, nodeWidth), fontSize: 14, lineHeight: '22px', overflowWrap: 'anywhere', whiteSpace: 'normal', background: 'var(--surface)', color: 'var(--ink)', ...(n.kind ? { borderColor: colorFor(n.kind, graph.kinds, colors), borderWidth: 2 } : {}) } })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) }), [graph, positions, colors, compact, nodeWidth]);
  return <div className="connection-diagram"><p className="muted">{t("Drag the canvas to explore. Labels stay at a readable size; the list above contains every reference.")}</p>
    <div className="filters">{graph.kinds.filter((k) => graph.entities.some((e) => e.kind === k)).map((kind) => <label key={kind}><input type="color" value={colorFor(kind, graph.kinds, colors)} onChange={(e) => { const next = { ...colors, [kind]: e.target.value }; setColors(next); saveColors(local(), key, next); }} /> {t(kindLabel(kind))}</label>)}</div>
    <div className="graph" ref={canvas}>{flow ? <ReactFlow ariaLabelConfig={{ 'controls.ariaLabel': t("Diagram controls"), 'controls.zoomIn.ariaLabel': t("Zoom in"), 'controls.zoomOut.ariaLabel': t("Zoom out"), 'controls.fitView.ariaLabel': t("Fit diagram"), 'node.a11yDescription.default': t("Press Enter or Space to select this reference."), 'node.a11yDescription.keyboardDisabled': t("Press Enter or Space to select this reference.") }} key={compact ? 'compact' : 'wide'} defaultViewport={{ x: 0, y: 0, zoom: 1 }} nodes={flow.nodes} edges={flow.edges} fitView={!compact} fitViewOptions={{ minZoom: 1, maxZoom: 1 }} minZoom={1} maxZoom={2} nodesDraggable={false} onNodeClick={(_, node) => { window.location.hash = node.data.href; }}><Background /><Controls showInteractive={false} /></ReactFlow> : <p>{t("Arranging selected references…")}</p>}</div>
  </div>;
}
