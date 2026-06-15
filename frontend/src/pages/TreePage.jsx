import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../api'

const W = 190, H = 64, FAM = 12, GX = 60, GY = 140

function PersonNode({ data }) {
  const bg = data.sex === 'MALE' ? '#dbeafe' : data.sex === 'FEMALE' ? '#fce7f3' : '#f3f4f6'
  return (
    <div style={{
      width: W, minHeight: H, background: bg,
      border: '1px solid #d1d5db', borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '8px 10px', textAlign: 'center', boxSizing: 'border-box',
    }}>
      <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{data.name}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{data.years || '—'}</div>
    </div>
  )
}

function FamilyNode() {
  return (
    <div style={{ width: FAM, height: FAM, borderRadius: '50%', background: '#f43f5e' }}>
      <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { person: PersonNode, family: FamilyNode }

// ── Layout ─────────────────────────────────────────────────────────────────────
//
// Algorithm (no external libraries):
//   1. BFS → assign generation numbers (oldest ancestors = 0, newest = N)
//   2. Equalize spouse generations
//   3. Propagate: ensure every parent is strictly older (higher gen) than child
//   4. Compute subtree width bottom-up (memoised recursion)
//      width(unit) = max(selfWidth, sum of children widths + gaps)
//   5. Layout: Y is flipped — newest gen (N) at top (y=0), oldest (0) at bottom
//      placeUnit(id, anchorX) → places couple + recursively places children

function buildFlow({ nodes: raw, edges: rawEdges }) {
  if (!raw || raw.length === 0) return { nodes: [], edges: [] }

  const pEdges = rawEdges.filter(e => e.relationship_type === 'PARENT_CHILD')
  const sEdges = rawEdges.filter(e => e.relationship_type === 'SPOUSE')
  const oEdges = rawEdges.filter(e => e.relationship_type === 'OTHER')
  // OTHER edges that participate in layout (but render as dashed, no family node)
  const oEdgesParent = oEdges.filter(e => e.layout_as === 'PARENT_CHILD')
  const oEdgesSpouse = oEdges.filter(e => e.layout_as === 'SPOUSE')

  // Only PARENT_CHILD edges define the layout tree structure.
  // oEdgesParent affects generation numbers (via propagation) but NOT the placement tree,
  // so the step-parent/adoptive-parent doesn't hijack a child's subtree position.
  const childrenOf = {}, parentsOf = {}
  pEdges.forEach(({ source_person_id: p, target_person_id: c }) => {
    ;(childrenOf[p] = childrenOf[p] || []).push(c)
    ;(parentsOf[c]  = parentsOf[c]  || []).push(p)
  })

  const pairs = sEdges.map(e => ({
    edgeId: e.id, a: e.source_person_id, b: e.target_person_id, famId: `fam-${e.id}`,
  }))
  const spouseOf = {}, famOf = {}
  pairs.forEach(p => {
    spouseOf[p.a] = p.b; spouseOf[p.b] = p.a
    famOf[p.a] = p.famId; famOf[p.b] = p.famId
  })

  // 1. BFS generation assignment (structural only)
  const hasParent = new Set(Object.keys(parentsOf))
  const gen = {}
  const q = raw.filter(n => !hasParent.has(n.id)).map(n => ({ id: n.id, g: 0 }))
  while (q.length) {
    const { id, g } = q.shift()
    if (gen[id] !== undefined && gen[id] >= g) continue
    gen[id] = g
    ;(childrenOf[id] || []).forEach(c => q.push({ id: c, g: g + 1 }))
  }
  raw.forEach(n => { if (gen[n.id] === undefined) gen[n.id] = 0 })

  // 2. Equalize spouses to same row
  pairs.forEach(p => {
    const g = Math.max(gen[p.a] || 0, gen[p.b] || 0)
    gen[p.a] = g; gen[p.b] = g
  })
  oEdgesSpouse.forEach(({ source_person_id: a, target_person_id: b }) => {
    const g = Math.max(gen[a] || 0, gen[b] || 0)
    gen[a] = g; gen[b] = g
  })

  // 3. Propagate generation: oEdgesParent ensures step-parent is older than step-child
  const allParentEdges = [...pEdges, ...oEdgesParent]
  for (let iter = 0; iter < raw.length; iter++) {
    let changed = false
    allParentEdges.forEach(({ source_person_id: p, target_person_id: c }) => {
      if ((gen[c] || 0) <= gen[p]) { gen[c] = gen[p] + 1; changed = true }
    })
    if (!changed) break
  }

  const maxGen = raw.reduce((m, n) => Math.max(m, gen[n.id] ?? 0), 0)

  // 4. Subtree width (memoised)
  // "anchor" of a unit = centre of marriage dot (couple) or centre of person (single parent)
  // width = horizontal space the unit + all its descendants need
  const wMemo = {}
  const computing = new Set()

  function subtreeW(id) {
    if (wMemo[id] !== undefined) return wMemo[id]
    if (computing.has(id)) return W   // cycle guard
    computing.add(id)

    const g  = gen[id]
    const sp = spouseOf[id]
    const spHere = sp && gen[sp] === g

    // If partner already memoised, share result
    if (spHere && wMemo[sp] !== undefined) {
      wMemo[id] = wMemo[sp]; computing.delete(id); return wMemo[id]
    }

    const selfW = spHere ? W + GX + FAM + GX + W : W

    const kids = spHere
      ? [...new Set([...(childrenOf[id] || []), ...(childrenOf[sp] || [])])]
      : (childrenOf[id] || [])

    if (!kids.length) {
      wMemo[id] = selfW; if (spHere) wMemo[sp] = selfW
      computing.delete(id); return selfW
    }

    const kw = kids.reduce((s, c, i) => s + subtreeW(c) + (i > 0 ? GX : 0), 0)
    const w = Math.max(selfW, kw)
    wMemo[id] = w; if (spHere) wMemo[sp] = w
    computing.delete(id); return w
  }

  raw.forEach(n => subtreeW(n.id))

  // 5. Top-down placement
  const personPos = {}, famPos = {}, placed = new Set()

  function placeUnit(id, anchorX) {
    if (placed.has(id)) return
    const g  = gen[id]
    const y  = (maxGen - g) * GY
    const sp = spouseOf[id]
    const spHere = sp && gen[sp] === g && !placed.has(sp)

    placed.add(id)
    if (spHere) {
      placed.add(sp)
      famPos[famOf[id]] = { x: anchorX - FAM / 2, y: y + (H - FAM) / 2 }
      personPos[id] = { x: anchorX - FAM / 2 - GX - W, y }
      personPos[sp] = { x: anchorX + FAM / 2 + GX,     y }
      placeKids([...new Set([...(childrenOf[id] || []), ...(childrenOf[sp] || [])])], anchorX)
    } else {
      personPos[id] = { x: anchorX - W / 2, y }
      placeKids(childrenOf[id] || [], anchorX)
    }
  }

  function placeKids(kids, parentAnchor) {
    const todo = kids.filter(c => !placed.has(c))
    if (!todo.length) return
    const total = todo.reduce((s, c, i) => s + subtreeW(c) + (i > 0 ? GX : 0), 0)
    let x = parentAnchor - total / 2
    todo.forEach(c => {
      const cw = subtreeW(c)
      placeUnit(c, x + cw / 2)
      x += cw + GX
    })
  }

  // Find layout roots: persons with no parents whose spouse also has no parents
  // (spouses whose partner HAS parents will be placed automatically when the
  //  partner is placed, so we don't start a separate traversal from them)
  const rootIds = raw.filter(n => !hasParent.has(n.id)).map(n => n.id)
  const layoutRoots = rootIds.filter(id => {
    const sp = spouseOf[id]
    return !sp || !hasParent.has(sp)
  })

  // Deduplicate couples (only list one person per couple)
  const rootUnits = [], rootSeen = new Set()
  layoutRoots.forEach(id => {
    if (rootSeen.has(id)) return
    rootSeen.add(id)
    const sp = spouseOf[id]
    if (sp && !hasParent.has(sp)) rootSeen.add(sp)
    rootUnits.push(id)
  })

  const totalRootW = rootUnits.reduce((s, id, i) => s + subtreeW(id) + (i > 0 ? GX : 0), 0)
  let rx = -totalRootW / 2
  rootUnits.forEach(id => {
    const uw = subtreeW(id)
    placeUnit(id, rx + uw / 2)
    rx += uw + GX
  })

  // Place OTHER-as-parent sources near their target child's X to avoid edge crossings.
  // They were excluded from the layout tree, so they're unpositioned at this point.
  oEdgesParent.forEach(({ source_person_id: p, target_person_id: c }) => {
    if (personPos[p]) return
    const cPos = personPos[c]
    personPos[p] = {
      x: cPos ? cPos.x : 0,
      y: (maxGen - (gen[p] ?? 0)) * GY,
    }
  })

  // Safety net: place any person still unpositioned
  raw.forEach(n => { if (!personPos[n.id]) personPos[n.id] = { x: 0, y: (maxGen - (gen[n.id] ?? 0)) * GY } })

  // ── React Flow nodes ──────────────────────────────────────────────────────
  const nodes = []
  raw.forEach(n => {
    const name  = [n.last_name, n.first_name, n.middle_name].filter(Boolean).join(' ') || '—'
    const years = [n.birth_date?.slice(0, 4), n.death_date?.slice(0, 4)].filter(Boolean).join('–')
    nodes.push({ id: n.id, type: 'person', position: personPos[n.id], data: { name, years, sex: n.sex } })
  })
  pairs.forEach(p => {
    if (!famPos[p.famId]) return
    nodes.push({ id: p.famId, type: 'family', position: famPos[p.famId],
      data: {}, selectable: false, draggable: false, deletable: false })
  })

  // ── React Flow edges ──────────────────────────────────────────────────────
  const edges = []

  pairs.forEach(p => {
    const pa = personPos[p.a], pb = personPos[p.b]
    if (!pa || !pb || !famPos[p.famId]) return
    const [lId, rId] = pa.x <= pb.x ? [p.a, p.b] : [p.b, p.a]
    edges.push({ id: `${p.edgeId}-L`, type: 'straight',
      source: lId, sourceHandle: 'right', target: p.famId, targetHandle: 'left',
      style: { stroke: '#f43f5e', strokeWidth: 2 } })
    edges.push({ id: `${p.edgeId}-R`, type: 'straight',
      source: p.famId, sourceHandle: 'right', target: rId, targetHandle: 'left',
      style: { stroke: '#f43f5e', strokeWidth: 2 } })
  })

  const seenFC = new Set()
  pEdges.forEach(({ source_person_id: pid, target_person_id: cid, id }) => {
    const fid = famOf[pid]
    if (fid && famPos[fid]) {
      const key = `${fid}→${cid}`
      if (!seenFC.has(key)) {
        edges.push({ id: `fc-${key}`, type: 'smoothstep',
          source: fid, sourceHandle: 'top', target: cid, targetHandle: 'bottom',
          style: { stroke: '#6b7280', strokeWidth: 1.5 } })
        seenFC.add(key)
      }
    } else {
      edges.push({ id, type: 'smoothstep',
        source: pid, sourceHandle: 'top', target: cid, targetHandle: 'bottom',
        style: { stroke: '#6b7280', strokeWidth: 1.5 } })
    }
  })

  oEdges.forEach(e => {
    if (!personPos[e.source_person_id] || !personPos[e.target_person_id]) return
    const asParent = e.layout_as === 'PARENT_CHILD'
    edges.push({
      id: `other-${e.id}`,
      type: 'smoothstep',
      source: e.source_person_id,
      sourceHandle: asParent ? 'top' : 'right',
      target: e.target_person_id,
      targetHandle: asParent ? 'bottom' : 'left',
      label: e.notes || 'иная связь',
      labelStyle: { fontSize: 10, fill: '#9ca3af' },
      style: { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '5 3' },
    })
  })

  return { nodes, edges }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TreePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getTree(id).then(tree => {
      const { nodes: n, edges: e } = buildFlow(tree)
      setNodes(n)
      setEdges(e)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  return (
    <div style={{ height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          className="outline sm"
          onClick={() => {
            const returnTo = location.state?.returnTo
            const treeBackTo = location.state?.treeBackTo
            nav(treeBackTo || `/profiles/${id}`, {
              state: returnTo ? { returnTo } : undefined,
            })
          }}
        >
          ← Назад
        </button>
        <strong>Генеалогическое дерево</strong>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Новейшие сверху · Синий — мужчины · Розовый — женщины · Красная — супруги · Пунктир — иные связи</span>
      </div>
      <div style={{ flex: 1 }}>
        {loading ? (
          <div style={{ padding: 24, color: '#6b7280' }}>Загрузка...</div>
        ) : nodes.filter(n => n.type === 'person').length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280' }}>Нет персон в профиле.</div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.1}>
            <Background gap={24} color="#e5e7eb" />
            <Controls />
            <MiniMap nodeColor={n =>
              n.type === 'family' ? '#f43f5e' :
              n.data?.sex === 'MALE' ? '#dbeafe' :
              n.data?.sex === 'FEMALE' ? '#fce7f3' : '#f3f4f6'} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
