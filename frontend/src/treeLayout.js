import dagre from '#dagre'

export const DEFAULT_LAYOUT_OPTIONS = {
  personWidth: 190,
  personHeight: 64,
  familySize: 12,
  spouseGap: 60,
  nodeGap: 60,
  rankGap: 140,
  componentGap: 140,
  laneGap: 8,
}

const byStableId = (a, b) => String(a.id).localeCompare(String(b.id))

function compareUnionPriority(a, b) {
  const startDate = String(b.start_date || '').localeCompare(String(a.start_date || ''))
  return startDate || String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
    String(a.id).localeCompare(String(b.id))
}

function fullName(person) {
  return [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(' ') || '—'
}

export function formatPersonYears(person) {
  const birthYear = person.birth_date?.slice(0, 4)
  const deathYear = person.death_date?.slice(0, 4)

  if (deathYear) return `${birthYear || '?'} - ${deathYear}`
  if (person.is_living && birthYear) return birthYear
  if (!person.is_living && birthYear) return `${birthYear} - ?`
  return '-'
}

function isParentLike(edge) {
  return edge.relationship_type === 'PARENT_CHILD' ||
    (edge.relationship_type === 'OTHER' && edge.layout_as === 'PARENT_CHILD')
}

function isUnionLike(edge) {
  return edge.relationship_type === 'SPOUSE' ||
    (edge.relationship_type === 'OTHER' && edge.layout_as === 'SPOUSE')
}

function isSiblingLike(edge) {
  return edge.relationship_type === 'OTHER' && edge.layout_as === 'SIBLING'
}

function reachable(adjacency, start, target) {
  const stack = [start]
  const seen = new Set()
  while (stack.length) {
    const current = stack.pop()
    if (current === target) return true
    if (seen.has(current)) continue
    seen.add(current)
    ;(adjacency.get(current) || []).forEach(next => stack.push(next))
  }
  return false
}

function removeParentCycles(edges, diagnostics) {
  const adjacency = new Map()
  const valid = []
  const invalid = []

  edges.slice().sort(byStableId).forEach(edge => {
    const parent = edge.source_person_id
    const child = edge.target_person_id
    if (parent === child || reachable(adjacency, child, parent)) {
      invalid.push(edge)
      diagnostics.push({
        code: 'parent-cycle',
        relationshipIds: [edge.id],
        personIds: [parent, child],
        message: 'Родительская связь образует цикл и исключена из расчёта поколений.',
      })
      return
    }
    if (!adjacency.has(parent)) adjacency.set(parent, [])
    adjacency.get(parent).push(child)
    valid.push(edge)
  })

  return { valid, invalid }
}

class UnionFind {
  constructor(ids) {
    this.parent = new Map(ids.map(id => [id, id]))
  }

  find(id) {
    const parent = this.parent.get(id)
    if (parent !== id) this.parent.set(id, this.find(parent))
    return this.parent.get(id)
  }

  union(a, b) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    const [first, second] = [ra, rb].sort()
    this.parent.set(second, first)
  }
}

function findConstraintDifference(adjacency, start, target) {
  const queue = [{ id: start, value: 0 }]
  const seen = new Set()
  while (queue.length) {
    const current = queue.shift()
    if (current.id === target) return current.value
    if (seen.has(current.id)) continue
    seen.add(current.id)
    ;(adjacency.get(current.id) || []).forEach(({ id, delta }) => {
      queue.push({ id, value: current.value + delta })
    })
  }
  return null
}

function assignGenerations(personIds, unions, parentEdges, siblingEdges, diagnostics) {
  const spouseGroups = new UnionFind(personIds)
  unions.forEach(union => spouseGroups.union(union.a, union.b))

  const adjacency = new Map()
  const accepted = []
  const acceptedSiblings = []
  const invalid = []
  const invalidSiblings = []
  const addConstraint = (from, to, delta) => {
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from).push({ id: to, delta })
  }

  parentEdges.slice().sort(byStableId).forEach(edge => {
    const parentGroup = spouseGroups.find(edge.source_person_id)
    const childGroup = spouseGroups.find(edge.target_person_id)
    const existing = findConstraintDifference(adjacency, parentGroup, childGroup)
    if (parentGroup === childGroup || (existing !== null && existing !== 1)) {
      invalid.push(edge)
      diagnostics.push({
        code: 'generation-conflict',
        relationshipIds: [edge.id],
        personIds: [edge.source_person_id, edge.target_person_id],
        message: 'Связь противоречит поколениям супругов и показана как конфликтная.',
      })
      return
    }
    if (existing === null) {
      addConstraint(parentGroup, childGroup, 1)
      addConstraint(childGroup, parentGroup, -1)
    }
    accepted.push(edge)
  })

  siblingEdges.slice().sort(byStableId).forEach(edge => {
    const firstGroup = spouseGroups.find(edge.source_person_id)
    const secondGroup = spouseGroups.find(edge.target_person_id)
    const existing = findConstraintDifference(adjacency, firstGroup, secondGroup)
    if (existing !== null && existing !== 0) {
      invalidSiblings.push(edge)
      diagnostics.push({
        code: 'sibling-generation-conflict',
        relationshipIds: [edge.id],
        personIds: [edge.source_person_id, edge.target_person_id],
        message: 'Связь между братьями или сёстрами противоречит известным поколениям.',
      })
      return
    }
    if (existing === null) {
      addConstraint(firstGroup, secondGroup, 0)
      addConstraint(secondGroup, firstGroup, 0)
    }
    acceptedSiblings.push(edge)
  })

  const groupIds = [...new Set(personIds.map(id => spouseGroups.find(id)))].sort()
  const values = new Map()
  groupIds.forEach(root => {
    if (values.has(root)) return
    const component = []
    const queue = [{ id: root, value: 0 }]
    while (queue.length) {
      const current = queue.shift()
      if (values.has(current.id)) continue
      values.set(current.id, current.value)
      component.push(current.id)
      ;(adjacency.get(current.id) || []).forEach(next => {
        queue.push({ id: next.id, value: current.value + next.delta })
      })
    }
    const minValue = Math.min(...component.map(id => values.get(id)))
    component.forEach(id => values.set(id, values.get(id) - minValue))
  })

  return {
    generations: Object.fromEntries(personIds.map(id => [id, values.get(spouseGroups.find(id)) || 0])),
    validEdges: accepted,
    invalidEdges: invalid,
    validSiblingEdges: acceptedSiblings,
    invalidSiblingEdges: invalidSiblings,
  }
}

function normalizeTree(tree) {
  const diagnostics = []
  const persons = (tree.nodes || []).slice().sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) || byStableId(a, b)
  )
  const personById = new Map(persons.map(person => [person.id, person]))
  const edges = (tree.edges || [])
    .filter(edge => personById.has(edge.source_person_id) && personById.has(edge.target_person_id))
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || byStableId(a, b))

  const parentCandidates = edges.filter(isParentLike)
  const siblingEdges = edges.filter(isSiblingLike)
  const cycleResult = removeParentCycles(parentCandidates, diagnostics)
  const unionEdges = edges.filter(isUnionLike)
  const currentCandidates = unionEdges
    .filter(edge => edge.relationship_type === 'SPOUSE' && !edge.end_date)
    .slice()
    .sort(compareUnionPriority)

  const primaryEdgeIds = new Set()
  const primaryPeople = new Set()
  currentCandidates.forEach(edge => {
    if (primaryPeople.has(edge.source_person_id) || primaryPeople.has(edge.target_person_id)) return
    primaryEdgeIds.add(edge.id)
    primaryPeople.add(edge.source_person_id)
    primaryPeople.add(edge.target_person_id)
  })

  const unions = unionEdges.map(edge => ({
    id: `union-${edge.id}`,
    edgeId: edge.id,
    a: edge.source_person_id,
    b: edge.target_person_id,
    primary: primaryEdgeIds.has(edge.id),
    former: edge.relationship_type === 'OTHER' || Boolean(edge.end_date),
    label: edge.notes || (edge.relationship_type === 'OTHER' || edge.end_date ? 'Бывшие супруги' : null),
    edge,
  }))

  const generationResult = assignGenerations(
    persons.map(person => person.id),
    unions,
    cycleResult.valid,
    siblingEdges,
    diagnostics,
  )

  return {
    persons,
    personById,
    edges,
    unions,
    validParentEdges: generationResult.validEdges,
    invalidParentEdges: [...cycleResult.invalid, ...generationResult.invalidEdges],
    validSiblingEdges: generationResult.validSiblingEdges,
    invalidSiblingEdges: generationResult.invalidSiblingEdges,
    generations: generationResult.generations,
    diagnostics,
  }
}

function buildBlocks(model, options) {
  const primaryByPerson = new Map()
  model.unions.filter(union => union.primary).forEach(union => {
    primaryByPerson.set(union.a, union)
    primaryByPerson.set(union.b, union)
  })

  const blocks = []
  const blockByPerson = new Map()
  const seen = new Set()
  model.persons.forEach(person => {
    if (seen.has(person.id)) return
    const union = primaryByPerson.get(person.id)
    const members = union ? [union.a, union.b] : [person.id]
    members.forEach(id => seen.add(id))
    const id = union ? `block-${union.edgeId}` : `block-person-${person.id}`
    const width = members.length === 2
      ? options.personWidth * 2 + options.spouseGap * 2 + options.familySize
      : options.personWidth
    const block = { id, members, primaryUnion: union || null, width }
    blocks.push(block)
    members.forEach(id => blockByPerson.set(id, block))
  })
  return { blocks: blocks.sort(byStableId), blockByPerson }
}

function buildBlockEdges(model, blockByPerson) {
  const seen = new Set()
  return model.validParentEdges.flatMap(edge => {
    const source = blockByPerson.get(edge.source_person_id)
    const target = blockByPerson.get(edge.target_person_id)
    if (!source || !target || source.id === target.id) return []
    const key = `${source.id}->${target.id}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ source: source.id, target: target.id }]
  })
}

function connectedComponents(blocks, blockEdges, supplementalUnions, blockByPerson) {
  const adjacency = new Map(blocks.map(block => [block.id, new Set()]))
  blockEdges.forEach(edge => {
    adjacency.get(edge.source).add(edge.target)
    adjacency.get(edge.target).add(edge.source)
  })
  supplementalUnions.forEach(union => {
    const a = blockByPerson.get(union.a)?.id
    const b = blockByPerson.get(union.b)?.id
    if (!a || !b || a === b) return
    adjacency.get(a).add(b)
    adjacency.get(b).add(a)
  })

  const components = []
  const seen = new Set()
  blocks.forEach(block => {
    if (seen.has(block.id)) return
    const ids = []
    const queue = [block.id]
    while (queue.length) {
      const id = queue.shift()
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
      ;[...(adjacency.get(id) || [])].sort().forEach(next => queue.push(next))
    }
    components.push(ids.sort())
  })
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

function crossingCount(rows, edges) {
  const positions = new Map()
  rows.forEach(ids => ids.forEach((id, index) => positions.set(id, index)))
  let count = 0
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i]
      const b = edges[j]
      const aSource = positions.get(a.source)
      const aTarget = positions.get(a.target)
      const bSource = positions.get(b.source)
      const bTarget = positions.get(b.target)
      if ([aSource, aTarget, bSource, bTarget].some(value => value === undefined)) continue
      if ((aSource - bSource) * (aTarget - bTarget) < 0) count += 1
    }
  }
  return count
}

function keepLinkedBlocksAdjacent(rows, siblingLinks, blockEdges) {
  const structuralDegree = new Map()
  blockEdges.forEach(edge => {
    structuralDegree.set(edge.source, (structuralDegree.get(edge.source) || 0) + 1)
    structuralDegree.set(edge.target, (structuralDegree.get(edge.target) || 0) + 1)
  })

  rows.forEach((ids, generation) => {
    const indexById = new Map(ids.map((id, index) => [id, index]))
    const rowLinks = siblingLinks.filter(link =>
      indexById.has(link.source) && indexById.has(link.target)
    )
    if (!rowLinks.length) return

    const groups = new UnionFind(ids)
    rowLinks.forEach(link => groups.union(link.source, link.target))
    const membersByRoot = new Map()
    ids.forEach(id => {
      const root = groups.find(id)
      if (!membersByRoot.has(root)) membersByRoot.set(root, [])
      membersByRoot.get(root).push(id)
    })

    const anchorByRoot = new Map()
    membersByRoot.forEach((members, root) => {
      if (members.length < 2) return
      const anchor = members.slice().sort((a, b) =>
        (structuralDegree.get(b) || 0) - (structuralDegree.get(a) || 0) ||
        indexById.get(a) - indexById.get(b) ||
        a.localeCompare(b)
      )[0]
      anchorByRoot.set(root, anchor)
    })

    const reordered = []
    ids.forEach(id => {
      const root = groups.find(id)
      const members = membersByRoot.get(root)
      const anchor = anchorByRoot.get(root)
      if (!anchor) {
        reordered.push(id)
        return
      }
      if (id !== anchor) return
      members
        .slice()
        .sort((a, b) => indexById.get(a) - indexById.get(b))
        .forEach(member => reordered.push(member))
    })
    rows.set(generation, reordered)
  })
}

function optimizeRows(rows, blockEdges, supplementalLinks, siblingLinks) {
  const result = new Map([...rows].map(([generation, ids]) => [generation, ids.slice()]))
  const generations = [...result.keys()].sort((a, b) => a - b)
  const neighborMap = new Map()
  const addNeighbor = (a, b) => {
    if (!neighborMap.has(a)) neighborMap.set(a, new Set())
    neighborMap.get(a).add(b)
  }
  blockEdges.forEach(edge => {
    addNeighbor(edge.source, edge.target)
    addNeighbor(edge.target, edge.source)
  })
  supplementalLinks.forEach(edge => {
    addNeighbor(edge.source, edge.target)
    addNeighbor(edge.target, edge.source)
  })

  for (let pass = 0; pass < 6; pass += 1) {
    const direction = pass % 2 === 0 ? generations : generations.slice().reverse()
    const positions = new Map()
    result.forEach(ids => ids.forEach((id, index) => positions.set(id, index)))
    direction.forEach(generation => {
      const ids = result.get(generation)
      ids.sort((a, b) => {
        const barycenter = id => {
          const values = [...(neighborMap.get(id) || [])]
            .map(neighbor => positions.get(neighbor))
            .filter(value => value !== undefined)
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : positions.get(id)
        }
        return barycenter(a) - barycenter(b) || a.localeCompare(b)
      })
      ids.forEach((id, index) => positions.set(id, index))
    })
  }

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    generations.forEach(generation => {
      const ids = result.get(generation)
      for (let index = 0; index < ids.length - 1; index += 1) {
        const before = crossingCount(result, blockEdges)
        ;[ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
        const after = crossingCount(result, blockEdges)
        if (after < before) changed = true
        else [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
      }
    })
    if (!changed) break
  }
  keepLinkedBlocksAdjacent(result, siblingLinks, blockEdges)
  return result
}

function packRowAroundAnchors(ids, desiredCenters, blockById, gap) {
  if (!ids.length) return new Map()
  const offsets = [0]
  for (let index = 1; index < ids.length; index += 1) {
    const previous = blockById.get(ids[index - 1])
    const current = blockById.get(ids[index])
    offsets.push(
      offsets[index - 1] +
      previous.width / 2 +
      gap +
      current.width / 2,
    )
  }

  const pools = ids.map((id, index) => ({
    start: index,
    end: index,
    weight: 1,
    value: desiredCenters.get(id) - offsets[index],
  }))
  for (let index = 0; index < pools.length - 1;) {
    if (pools[index].value <= pools[index + 1].value) {
      index += 1
      continue
    }
    const left = pools[index]
    const right = pools[index + 1]
    const weight = left.weight + right.weight
    pools.splice(index, 2, {
      start: left.start,
      end: right.end,
      weight,
      value: (left.value * left.weight + right.value * right.weight) / weight,
    })
    if (index > 0) index -= 1
  }

  const centers = new Map()
  pools.forEach(pool => {
    for (let index = pool.start; index <= pool.end; index += 1) {
      centers.set(ids[index], pool.value + offsets[index])
    }
  })
  return centers
}

function anchorRowsToParents(rows, blockEdges, blockById, options) {
  const positions = new Map()
  rows.forEach(ids => {
    const rowWidth = ids.reduce((sum, id, index) =>
      sum + blockById.get(id).width + (index ? options.nodeGap : 0), 0
    )
    let x = -rowWidth / 2
    ids.forEach(id => {
      const block = blockById.get(id)
      positions.set(id, x + block.width / 2)
      x += block.width + options.nodeGap
    })
  })

  const parentsByChild = new Map()
  blockEdges.forEach(edge => {
    if (!parentsByChild.has(edge.target)) parentsByChild.set(edge.target, [])
    parentsByChild.get(edge.target).push(edge.source)
  })

  const generations = [...rows.keys()].sort((a, b) => a - b)
  generations.forEach(generation => {
    const ids = rows.get(generation)
    const desiredCenters = new Map(ids.map(id => {
      const parentCenters = (parentsByChild.get(id) || [])
        .map(parentId => positions.get(parentId))
        .filter(center => center !== undefined)
      const desired = parentCenters.length
        ? parentCenters.reduce((sum, center) => sum + center, 0) / parentCenters.length
        : positions.get(id)
      return [id, desired]
    }))
    const packed = packRowAroundAnchors(
      ids,
      desiredCenters,
      blockById,
      options.nodeGap,
    )
    packed.forEach((center, id) => positions.set(id, center))
  })
  return positions
}

function layoutComponents(model, blocks, blockByPerson, blockEdges, options) {
  const blockById = new Map(blocks.map(block => [block.id, block]))
  const supplementalUnions = model.unions.filter(union => !union.primary)
  const siblingRelations = model.validSiblingEdges.map(edge => ({
    a: edge.source_person_id,
    b: edge.target_person_id,
  }))
  const supplemental = [...supplementalUnions, ...siblingRelations]
  const linksFor = relations => relations.flatMap(union => {
    const source = blockByPerson.get(union.a)?.id
    const target = blockByPerson.get(union.b)?.id
    return source && target && source !== target ? [{ source, target }] : []
  })
  const supplementalLinks = linksFor(supplemental)
  const siblingLinks = linksFor(siblingRelations)
  const components = connectedComponents(blocks, blockEdges, supplemental, blockByPerson)
  const positions = new Map()
  let componentX = 0

  components.forEach(componentIds => {
    const componentSet = new Set(componentIds)
    const graph = new dagre.graphlib.Graph()
      .setGraph({ rankdir: 'BT', nodesep: options.nodeGap, ranksep: options.rankGap })
      .setDefaultEdgeLabel(() => ({}))
    componentIds.forEach(id => {
      graph.setNode(id, { width: blockById.get(id).width, height: options.personHeight })
    })
    blockEdges
      .filter(edge => componentSet.has(edge.source) && componentSet.has(edge.target))
      .forEach(edge => graph.setEdge(edge.source, edge.target, { weight: 4, minlen: 1 }))
    dagre.layout(graph)

    const rows = new Map()
    componentIds.forEach(id => {
      const block = blockById.get(id)
      const generation = model.generations[block.members[0]] || 0
      if (!rows.has(generation)) rows.set(generation, [])
      rows.get(generation).push(id)
    })
    rows.forEach(ids => ids.sort((a, b) => graph.node(a).x - graph.node(b).x || a.localeCompare(b)))
    const optimized = optimizeRows(
      rows,
      blockEdges.filter(edge => componentSet.has(edge.source) && componentSet.has(edge.target)),
      supplementalLinks.filter(edge => componentSet.has(edge.source) && componentSet.has(edge.target)),
      siblingLinks.filter(edge => componentSet.has(edge.source) && componentSet.has(edge.target)),
    )
    const localPositions = anchorRowsToParents(
      optimized,
      blockEdges.filter(edge => componentSet.has(edge.source) && componentSet.has(edge.target)),
      blockById,
      options,
    )
    const componentLeft = Math.min(...componentIds.map(id =>
      localPositions.get(id) - blockById.get(id).width / 2
    ))
    const componentRight = Math.max(...componentIds.map(id =>
      localPositions.get(id) + blockById.get(id).width / 2
    ))
    const componentWidth = componentRight - componentLeft
    componentIds.forEach(id => {
      const block = blockById.get(id)
      positions.set(id, {
        x: componentX + localPositions.get(id) - componentLeft,
        generation: model.generations[block.members[0]] || 0,
      })
    })
    componentX += componentWidth + options.componentGap
  })

  const totalWidth = Math.max(0, componentX - options.componentGap)
  positions.forEach(position => { position.x -= totalWidth / 2 })
  return positions
}

function orientationCost(leftId, rightId, leftCenter, rightCenter, model, blockByPerson, blockPositions) {
  let cost = 0
  const personCenter = new Map([[leftId, leftCenter], [rightId, rightCenter]])
  model.validParentEdges.forEach(edge => {
    ;[edge.source_person_id, edge.target_person_id].forEach(personId => {
      if (!personCenter.has(personId)) return
      const otherId = personId === edge.source_person_id ? edge.target_person_id : edge.source_person_id
      const otherBlock = blockByPerson.get(otherId)
      const otherPosition = blockPositions.get(otherBlock?.id)
      if (otherPosition) cost += Math.abs(personCenter.get(personId) - otherPosition.x)
    })
  })
  model.unions.filter(union => !union.primary).forEach(union => {
    ;[union.a, union.b].forEach(personId => {
      if (!personCenter.has(personId)) return
      const otherId = personId === union.a ? union.b : union.a
      const otherBlock = blockByPerson.get(otherId)
      const otherPosition = blockPositions.get(otherBlock?.id)
      if (otherPosition) cost += Math.abs(personCenter.get(personId) - otherPosition.x) * 1.5
    })
  })
  return cost
}

function placePeople(model, blocks, blockByPerson, blockPositions, options) {
  const maxGeneration = Math.max(0, ...Object.values(model.generations))
  const personPositions = new Map()
  const familyPositions = new Map()

  blocks.forEach(block => {
    const position = blockPositions.get(block.id)
    const y = (maxGeneration - position.generation) * options.rankGap
    if (block.members.length === 1) {
      personPositions.set(block.members[0], { x: position.x - options.personWidth / 2, y })
      return
    }

    const [a, b] = block.members
    const leftCenter = position.x - options.familySize / 2 - options.spouseGap - options.personWidth / 2
    const rightCenter = position.x + options.familySize / 2 + options.spouseGap + options.personWidth / 2
    const abCost = orientationCost(a, b, leftCenter, rightCenter, model, blockByPerson, blockPositions)
    const baCost = orientationCost(b, a, leftCenter, rightCenter, model, blockByPerson, blockPositions)
    let left = a
    let right = b
    if (baCost < abCost) {
      left = b
      right = a
    } else if (baCost === abCost) {
      const personA = model.personById.get(a)
      const personB = model.personById.get(b)
      if (personA?.sex === 'MALE' && personB?.sex === 'FEMALE') {
        left = b
        right = a
      } else if (personA?.sex === personB?.sex && String(b).localeCompare(String(a)) < 0) {
        left = b
        right = a
      }
    }
    personPositions.set(left, { x: leftCenter - options.personWidth / 2, y })
    personPositions.set(right, { x: rightCenter - options.personWidth / 2, y })
    familyPositions.set(block.primaryUnion.id, {
      x: position.x - options.familySize / 2,
      y: y + (options.personHeight - options.familySize) / 2,
    })
  })
  return { personPositions, familyPositions, maxGeneration }
}

function orientSiblingGroups(
  model,
  blocks,
  blockByPerson,
  blockPositions,
  personPositions,
  options,
) {
  const blockById = new Map(blocks.map(block => [block.id, block]))
  const links = model.validSiblingEdges.flatMap(edge => {
    const source = blockByPerson.get(edge.source_person_id)
    const target = blockByPerson.get(edge.target_person_id)
    if (!source || !target || source.id === target.id) return []
    return [{
      source: source.id,
      target: target.id,
      sourcePersonId: edge.source_person_id,
      targetPersonId: edge.target_person_id,
    }]
  })
  if (!links.length) return

  const groups = new UnionFind(blocks.map(block => block.id))
  links.forEach(link => groups.union(link.source, link.target))
  const membersByRoot = new Map()
  blocks.forEach(block => {
    const root = groups.find(block.id)
    if (!membersByRoot.has(root)) membersByRoot.set(root, [])
    membersByRoot.get(root).push(block.id)
  })

  const rows = new Map()
  blocks.forEach(block => {
    const position = blockPositions.get(block.id)
    const key = position.generation
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key).push(block.id)
  })
  rows.forEach(ids => ids.sort((a, b) =>
    blockPositions.get(a).x - blockPositions.get(b).x || a.localeCompare(b)
  ))

  rows.forEach(ids => {
    const rowIndex = new Map(ids.map((id, index) => [id, index]))
    const roots = [...new Set(ids.map(id => groups.find(id)))]
    roots.forEach(root => {
      const members = membersByRoot.get(root)
        .filter(id => rowIndex.has(id))
        .sort((a, b) => rowIndex.get(a) - rowIndex.get(b))
      if (members.length < 2) return
      const anchor = members.find(id => blockById.get(id).members.length === 2)
      if (!anchor) return

      const anchorCenter = blockPositions.get(anchor).x
      const sideByBlock = new Map()
      links.filter(link => link.source === anchor || link.target === anchor).forEach(link => {
        const anchorIsSource = link.source === anchor
        const siblingBlock = anchorIsSource ? link.target : link.source
        const anchorPersonId = anchorIsSource
          ? link.sourcePersonId
          : link.targetPersonId
        const person = personPositions.get(anchorPersonId)
        if (!person) return
        const personCenter = person.x + options.personWidth / 2
        sideByBlock.set(siblingBlock, personCenter < anchorCenter ? -1 : 1)
      })

      const anchorIndex = members.indexOf(anchor)
      const left = members.filter((id, index) =>
        id !== anchor && (sideByBlock.get(id) === -1 ||
          (!sideByBlock.has(id) && index < anchorIndex))
      )
      const right = members.filter((id, index) =>
        id !== anchor && (sideByBlock.get(id) === 1 ||
          (!sideByBlock.has(id) && index > anchorIndex))
      )
      const ordered = [...left, anchor, ...right]
      const slots = members.map(id => rowIndex.get(id)).sort((a, b) => a - b)
      slots.forEach((slot, index) => { ids[slot] = ordered[index] })
    })

    const desired = new Map(ids.map(id => [id, blockPositions.get(id).x]))
    const packed = packRowAroundAnchors(ids, desired, blockById, options.nodeGap)
    packed.forEach((x, id) => { blockPositions.get(id).x = x })
  })
}

function rectanglesForPeople(personPositions, options) {
  return [...personPositions].map(([id, position]) => ({
    id,
    left: position.x,
    right: position.x + options.personWidth,
    top: position.y,
    bottom: position.y + options.personHeight,
  }))
}

function horizontalHitsRect(left, right, y, rectangles, ignored = new Set()) {
  return rectangles.some(rect => !ignored.has(rect.id) &&
    y > rect.top && y < rect.bottom &&
    right > rect.left && left < rect.right
  )
}

function segmentHitsRect(start, end, rectangles, ignored = new Set()) {
  return rectangles.some(rect => {
    if (ignored.has(rect.id)) return false
    if (start.y === end.y) {
      return start.y > rect.top && start.y < rect.bottom &&
        Math.max(start.x, end.x) > rect.left &&
        Math.min(start.x, end.x) < rect.right
    }
    if (start.x === end.x) {
      return start.x > rect.left && start.x < rect.right &&
        Math.max(start.y, end.y) > rect.top &&
        Math.min(start.y, end.y) < rect.bottom
    }
    return true
  })
}

function simplifyPoints(points) {
  const result = []
  points.forEach(point => {
    const previous = result[result.length - 1]
    if (previous?.x === point.x && previous?.y === point.y) return
    result.push(point)
    while (result.length >= 3) {
      const a = result[result.length - 3]
      const b = result[result.length - 2]
      const c = result[result.length - 1]
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        result.splice(result.length - 2, 1)
      } else {
        break
      }
    }
  })
  return result
}

function routeAroundRectangles(start, end, rectangles, clearance) {
  const xs = new Set([start.x, end.x])
  const ys = new Set([start.y, end.y])
  rectangles.forEach(rect => {
    xs.add(rect.left - clearance)
    xs.add(rect.right + clearance)
    ys.add(rect.top - clearance)
    ys.add(rect.bottom + clearance)
  })
  const xValues = [...xs].sort((a, b) => a - b)
  const yValues = [...ys].sort((a, b) => a - b)
  const pointIsFree = (x, y) => !rectangles.some(rect =>
    x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
  )
  const stateKey = (xIndex, yIndex, direction) => `${xIndex}:${yIndex}:${direction}`
  const startX = xValues.indexOf(start.x)
  const startY = yValues.indexOf(start.y)
  const endX = xValues.indexOf(end.x)
  const endY = yValues.indexOf(end.y)
  const distances = new Map()
  const previous = new Map()
  const queue = []
  const push = state => {
    queue.push(state)
    let index = queue.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (queue[parent].cost <= queue[index].cost) break
      ;[queue[parent], queue[index]] = [queue[index], queue[parent]]
      index = parent
    }
  }
  const pop = () => {
    const first = queue[0]
    const last = queue.pop()
    if (queue.length && last) {
      queue[0] = last
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < queue.length && queue[left].cost < queue[smallest].cost) smallest = left
        if (right < queue.length && queue[right].cost < queue[smallest].cost) smallest = right
        if (smallest === index) break
        ;[queue[smallest], queue[index]] = [queue[index], queue[smallest]]
        index = smallest
      }
    }
    return first
  }

  const firstKey = stateKey(startX, startY, 0)
  distances.set(firstKey, 0)
  push({ xIndex: startX, yIndex: startY, direction: 0, cost: 0, key: firstKey })
  let finalState = null

  while (queue.length) {
    const current = pop()
    if (current.cost !== distances.get(current.key)) continue
    if (current.xIndex === endX && current.yIndex === endY) {
      finalState = current
      break
    }
    const candidates = [
      { xIndex: current.xIndex - 1, yIndex: current.yIndex, direction: 1 },
      { xIndex: current.xIndex + 1, yIndex: current.yIndex, direction: 1 },
      { xIndex: current.xIndex, yIndex: current.yIndex - 1, direction: 2 },
      { xIndex: current.xIndex, yIndex: current.yIndex + 1, direction: 2 },
    ]
    candidates.forEach(next => {
      if (
        next.xIndex < 0 || next.xIndex >= xValues.length ||
        next.yIndex < 0 || next.yIndex >= yValues.length
      ) return
      const from = { x: xValues[current.xIndex], y: yValues[current.yIndex] }
      const to = { x: xValues[next.xIndex], y: yValues[next.yIndex] }
      if (!pointIsFree(to.x, to.y) || segmentHitsRect(from, to, rectangles)) return
      const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
      const bendPenalty = current.direction && current.direction !== next.direction ? 32 : 0
      const cost = current.cost + distance + bendPenalty
      const key = stateKey(next.xIndex, next.yIndex, next.direction)
      if (cost >= (distances.get(key) ?? Number.POSITIVE_INFINITY)) return
      distances.set(key, cost)
      previous.set(key, current.key)
      push({ ...next, cost, key })
    })
  }

  if (!finalState) {
    const outerY = Math.min(start.y, end.y, ...rectangles.map(rect => rect.top)) -
      clearance * 3
    return simplifyPoints([
      start,
      { x: start.x, y: outerY },
      { x: end.x, y: outerY },
      end,
    ])
  }

  const points = []
  let key = finalState.key
  while (key) {
    const [xIndex, yIndex] = key.split(':').map(Number)
    points.push({ x: xValues[xIndex], y: yValues[yIndex] })
    key = previous.get(key)
  }
  return simplifyPoints(points.reverse())
}

function assignLanes(routes, rectangles, options) {
  const occupied = []
  return routes.map(route => {
    const left = Math.min(route.sourceX, route.targetX)
    const right = Math.max(route.sourceX, route.targetX)
    let attempt = 0
    let offset = 0
    while (true) {
      offset = attempt === 0
        ? 0
        : Math.ceil(attempt / 2) * options.laneGap * (attempt % 2 ? -1 : 1)
      const laneY = route.baseY + offset
      const edgeConflict = occupied.some(segment =>
        segment.groupId !== route.groupId &&
        right > segment.left && left < segment.right &&
        Math.abs(laneY - segment.y) < options.laneGap
      )
      const cardConflict = horizontalHitsRect(
        left,
        right,
        laneY,
        rectangles,
        new Set([route.sourcePersonId, route.targetPersonId].filter(Boolean)),
      )
      if (!edgeConflict && !cardConflict) break
      attempt += 1
    }
    const laneY = route.baseY + offset
    occupied.push({ left, right, y: laneY, groupId: route.groupId })
    return { ...route, laneY }
  })
}

function relationEdgeData(ids, kind) {
  return { relationshipIds: ids, relationKind: kind }
}

function routeUnions(model, personPositions, familyPositions, rectangles, options) {
  const edges = []
  model.unions.forEach(union => {
    const a = personPositions.get(union.a)
    const b = personPositions.get(union.b)
    if (!a || !b) return
    const leftId = a.x <= b.x ? union.a : union.b
    const rightId = leftId === union.a ? union.b : union.a
    const leftPos = personPositions.get(leftId)
    const rightPos = personPositions.get(rightId)
    const sourceX = leftPos.x + options.personWidth
    const targetX = rightPos.x
    const centerY = leftPos.y + options.personHeight / 2
    const blocked = horizontalHitsRect(
      sourceX,
      targetX,
      centerY,
      rectangles,
      new Set([leftId, rightId]),
    )
    let laneY = centerY
    if (blocked) {
      laneY = leftPos.y - 24
      while (horizontalHitsRect(sourceX, targetX, laneY, rectangles, new Set([leftId, rightId]))) {
        laneY -= options.laneGap
      }
    }
    const points = laneY === centerY
      ? [{ x: sourceX, y: centerY }, { x: targetX, y: centerY }]
      : [
          { x: sourceX, y: centerY },
          { x: sourceX + 16, y: centerY },
          { x: sourceX + 16, y: laneY },
          { x: targetX - 16, y: laneY },
          { x: targetX - 16, y: centerY },
          { x: targetX, y: centerY },
        ]

    if (!union.primary) {
      const childUsesUnion = model.validParentEdges.some(edge => {
        const child = edge.target_person_id
        const parents = model.validParentEdges
          .filter(candidate => candidate.target_person_id === child && candidate.relationship_type === 'PARENT_CHILD')
          .map(candidate => candidate.source_person_id)
        return parents.length === 2 && parents.includes(union.a) && parents.includes(union.b)
      })
      if (childUsesUnion) {
        familyPositions.set(union.id, {
          x: (sourceX + targetX) / 2 - options.familySize / 2,
          y: laneY - options.familySize / 2,
        })
      }
    }
    edges.push({
      id: `union-edge-${union.edgeId}`,
      type: 'routed',
      source: leftId,
      sourceHandle: 'right',
      target: rightId,
      targetHandle: 'left',
      label: union.label,
      data: {
        ...relationEdgeData([union.edgeId], union.former ? 'former-union' : 'union'),
        points,
        labelX: (sourceX + targetX) / 2,
        labelY: laneY - 12,
      },
      style: union.former
        ? { stroke: '#6b7280', strokeWidth: 1.75, strokeDasharray: '6 4' }
        : { stroke: '#b85450', strokeWidth: 2 },
      zIndex: union.former ? 10 : 1,
    })
  })
  return edges
}

function exactUnionForChild(childId, model) {
  const parents = model.validParentEdges
    .filter(edge => edge.relationship_type === 'PARENT_CHILD' && edge.target_person_id === childId)
    .map(edge => edge.source_person_id)
  if (parents.length !== 2) return null
  return model.unions.find(union =>
    (union.a === parents[0] && union.b === parents[1]) ||
    (union.a === parents[1] && union.b === parents[0])
  ) || null
}

function routeParents(model, personPositions, familyPositions, rectangles, options) {
  const routes = []
  const groupedIds = new Set()
  model.persons.forEach(person => {
    const union = exactUnionForChild(person.id, model)
    const family = union && familyPositions.get(union.id)
    if (!family) return
    const parentEdges = model.validParentEdges.filter(edge =>
      edge.relationship_type === 'PARENT_CHILD' &&
      edge.target_person_id === person.id &&
      [union.a, union.b].includes(edge.source_person_id)
    )
    if (parentEdges.length !== 2) return
    parentEdges.forEach(edge => groupedIds.add(edge.id))
    const child = personPositions.get(person.id)
    routes.push({
      id: `parents-${union.edgeId}-${person.id}`,
      groupId: union.id,
      relationshipIds: parentEdges.map(edge => edge.id).sort(),
      source: union.id,
      sourceHandle: 'top',
      target: person.id,
      targetHandle: 'bottom',
      sourceX: family.x + options.familySize / 2,
      sourceY: family.y,
      targetX: child.x + options.personWidth / 2,
      targetY: child.y + options.personHeight,
      sourcePersonId: null,
      targetPersonId: person.id,
    })
  })

  model.validParentEdges.forEach(edge => {
    if (groupedIds.has(edge.id)) return
    const parent = personPositions.get(edge.source_person_id)
    const child = personPositions.get(edge.target_person_id)
    if (!parent || !child) return
    routes.push({
      id: `parent-${edge.id}`,
      groupId: `parent-${edge.source_person_id}`,
      relationshipIds: [edge.id],
      source: edge.source_person_id,
      sourceHandle: 'top',
      target: edge.target_person_id,
      targetHandle: 'bottom',
      sourceX: parent.x + options.personWidth / 2,
      sourceY: parent.y,
      targetX: child.x + options.personWidth / 2,
      targetY: child.y + options.personHeight,
      sourcePersonId: edge.source_person_id,
      targetPersonId: edge.target_person_id,
      other: edge.relationship_type === 'OTHER',
      label: edge.relationship_type === 'OTHER' ? edge.notes || 'Иная родственная связь' : null,
    })
  })

  routes.forEach(route => {
    route.baseY = (route.sourceY + route.targetY) / 2
  })
  return assignLanes(routes.sort(byStableId), rectangles, options).map(route => ({
    id: route.id,
    type: 'routed',
    source: route.source,
    sourceHandle: route.sourceHandle,
    target: route.target,
    targetHandle: route.targetHandle,
    label: route.label,
    data: {
      ...relationEdgeData(route.relationshipIds, route.other ? 'other-parent' : 'parent'),
      points: [
        { x: route.sourceX, y: route.sourceY },
        { x: route.sourceX, y: route.laneY },
        { x: route.targetX, y: route.laneY },
        { x: route.targetX, y: route.targetY },
      ],
      labelX: (route.sourceX + route.targetX) / 2,
      labelY: route.laneY - 10,
    },
    style: route.other
      ? { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '5 3' }
      : { stroke: '#6b7280', strokeWidth: 1.5 },
  }))
}

function routeSiblingEdges(model, personPositions, rectangles, options) {
  const routes = model.validSiblingEdges.flatMap(edge => {
    const source = personPositions.get(edge.source_person_id)
    const target = personPositions.get(edge.target_person_id)
    if (!source || !target) return []
    return [{
      id: `sibling-${edge.id}`,
      groupId: `sibling-${edge.id}`,
      relationshipIds: [edge.id],
      source: edge.source_person_id,
      sourceHandle: 'top',
      target: edge.target_person_id,
      targetHandle: 'target-top',
      sourceX: source.x + options.personWidth / 2,
      sourceY: source.y,
      targetX: target.x + options.personWidth / 2,
      targetY: target.y,
      sourcePersonId: edge.source_person_id,
      targetPersonId: edge.target_person_id,
      baseY: Math.min(source.y, target.y) - 24,
      label: edge.notes || 'Братья / сёстры',
    }]
  })

  return assignLanes(routes.sort(byStableId), rectangles, options).map(route => ({
    id: route.id,
    type: 'routed',
    source: route.source,
    sourceHandle: route.sourceHandle,
    target: route.target,
    targetHandle: route.targetHandle,
    label: route.label,
    data: {
      ...relationEdgeData(route.relationshipIds, 'sibling'),
      points: simplifyPoints([
        { x: route.sourceX, y: route.sourceY },
        { x: route.sourceX, y: route.laneY },
        { x: route.targetX, y: route.laneY },
        { x: route.targetX, y: route.targetY },
      ]),
      labelX: (route.sourceX + route.targetX) / 2,
      labelY: route.laneY - 10,
    },
    style: { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '5 3' },
  }))
}

function routeOtherEdges(model, personPositions, rectangles, invalidIds, options) {
  return model.edges
    .filter(edge =>
      edge.relationship_type === 'OTHER' &&
      !isUnionLike(edge) &&
      !isParentLike(edge) &&
      !isSiblingLike(edge)
    )
    .concat(model.invalidParentEdges)
    .concat(model.invalidSiblingEdges)
    .filter((edge, index, all) => all.findIndex(candidate => candidate.id === edge.id) === index)
    .flatMap(edge => {
      const source = personPositions.get(edge.source_person_id)
      const target = personPositions.get(edge.target_person_id)
      if (!source || !target) return []
      const conflict = invalidIds.has(edge.id)
      const parentLike = isParentLike(edge)
      const sourceIsLeft = source.x <= target.x
      const sourcePoint = {
        x: parentLike
        ? source.x + options.personWidth / 2
          : source.x + (sourceIsLeft ? options.personWidth : 0),
        y: parentLike
          ? source.y
          : source.y + options.personHeight / 2,
      }
      const targetPoint = {
        x: parentLike
        ? target.x + options.personWidth / 2
          : target.x + (sourceIsLeft ? 0 : options.personWidth),
        y: parentLike
          ? target.y + options.personHeight
          : target.y + options.personHeight / 2,
      }
      const clearance = options.laneGap
      const sourceAnchor = parentLike
        ? { x: sourcePoint.x, y: sourcePoint.y - clearance }
        : {
            x: sourcePoint.x + (sourceIsLeft ? clearance : -clearance),
            y: sourcePoint.y,
          }
      const targetAnchor = parentLike
        ? { x: targetPoint.x, y: targetPoint.y + clearance }
        : {
            x: targetPoint.x + (sourceIsLeft ? -clearance : clearance),
            y: targetPoint.y,
          }
      const routed = routeAroundRectangles(
        sourceAnchor,
        targetAnchor,
        rectangles,
        clearance,
      )
      const points = simplifyPoints([sourcePoint, ...routed, targetPoint])
      const labelSegment = points
        .slice(0, -1)
        .map((point, index) => ({ start: point, end: points[index + 1] }))
        .filter(segment => segment.start.y === segment.end.y)
        .sort((a, b) =>
          Math.abs(b.end.x - b.start.x) - Math.abs(a.end.x - a.start.x)
        )[0]
      const labelX = labelSegment
        ? (labelSegment.start.x + labelSegment.end.x) / 2
        : (sourcePoint.x + targetPoint.x) / 2
      const labelY = labelSegment
        ? labelSegment.start.y - 10
        : (sourcePoint.y + targetPoint.y) / 2
      return [{
        id: `other-${edge.id}`,
        type: 'routed',
        source: edge.source_person_id,
        sourceHandle: parentLike ? 'top' : sourceIsLeft ? 'right' : 'source-left',
        target: edge.target_person_id,
        targetHandle: parentLike ? 'bottom' : sourceIsLeft ? 'left' : 'target-right',
        label: conflict ? `Конфликт: ${edge.notes || 'родительская связь'}` : edge.notes || 'Иная связь',
        data: {
          ...relationEdgeData([edge.id], conflict ? 'conflict' : 'other'),
          points,
          labelX,
          labelY,
          labelStyle: { fontSize: 10, fill: conflict ? '#dc2626' : '#6b7280' },
        },
        style: {
          stroke: conflict ? '#dc2626' : '#9ca3af',
          strokeWidth: conflict ? 2 : 1.5,
          strokeDasharray: conflict ? '3 3' : '5 3',
        },
      }]
    })
}

export function pointsToPath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
}

export function buildTreeLayout(tree, userOptions = {}) {
  const options = { ...DEFAULT_LAYOUT_OPTIONS, ...userOptions }
  if (!tree?.nodes?.length) return { nodes: [], edges: [], diagnostics: [] }

  const model = normalizeTree(tree)
  const { blocks, blockByPerson } = buildBlocks(model, options)
  const blockEdges = buildBlockEdges(model, blockByPerson)
  const blockPositions = layoutComponents(model, blocks, blockByPerson, blockEdges, options)
  let placement = placePeople(
    model,
    blocks,
    blockByPerson,
    blockPositions,
    options,
  )
  orientSiblingGroups(
    model,
    blocks,
    blockByPerson,
    blockPositions,
    placement.personPositions,
    options,
  )
  placement = placePeople(
    model,
    blocks,
    blockByPerson,
    blockPositions,
    options,
  )
  const { personPositions, familyPositions } = placement
  const rectangles = rectanglesForPeople(personPositions, options)
  const unionEdges = routeUnions(model, personPositions, familyPositions, rectangles, options)
  const parentEdges = routeParents(model, personPositions, familyPositions, rectangles, options)
  const siblingEdges = routeSiblingEdges(model, personPositions, rectangles, options)
  const invalidIds = new Set([
    ...model.invalidParentEdges,
    ...model.invalidSiblingEdges,
  ].map(item => item.id))
  const otherEdges = routeOtherEdges(model, personPositions, rectangles, invalidIds, options)

  const nodes = model.persons.map(person => ({
    id: person.id,
    type: 'person',
    position: personPositions.get(person.id),
    data: {
      name: fullName(person),
      years: formatPersonYears(person),
      sex: person.sex,
      photo_url: person.photo_url || null,
    },
  }))
  model.unions.forEach(union => {
    const position = familyPositions.get(union.id)
    if (!position) return
    nodes.push({
      id: union.id,
      type: 'family',
      position,
      data: { kind: union.former ? 'former' : 'current' },
      selectable: false,
      draggable: false,
      deletable: false,
    })
  })

  return {
    nodes,
    edges: [...unionEdges, ...parentEdges, ...siblingEdges, ...otherEdges],
    diagnostics: model.diagnostics.map(item => ({
      ...item,
      personNames: item.personIds
        .map(id => model.personById.get(id))
        .filter(Boolean)
        .map(fullName),
    })),
  }
}

export function findNodeOverlaps(nodes, options = DEFAULT_LAYOUT_OPTIONS) {
  const people = nodes.filter(node => node.type === 'person')
  const overlaps = []
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i].position
      const b = people[j].position
      if (
        a.x < b.x + options.personWidth &&
        a.x + options.personWidth > b.x &&
        a.y < b.y + options.personHeight &&
        a.y + options.personHeight > b.y
      ) overlaps.push([people[i].id, people[j].id])
    }
  }
  return overlaps
}

export function findEdgeCardIntersections(layout, options = DEFAULT_LAYOUT_OPTIONS) {
  const rectangles = layout.nodes
    .filter(node => node.type === 'person')
    .map(node => ({
      id: node.id,
      left: node.position.x,
      right: node.position.x + options.personWidth,
      top: node.position.y,
      bottom: node.position.y + options.personHeight,
    }))
  const intersections = []

  layout.edges.forEach(edge => {
    const points = edge.data?.points || []
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      rectangles.forEach(rect => {
        if (rect.id === edge.source || rect.id === edge.target) return
        const horizontal = start.y === end.y &&
          start.y > rect.top && start.y < rect.bottom &&
          Math.max(start.x, end.x) > rect.left &&
          Math.min(start.x, end.x) < rect.right
        const vertical = start.x === end.x &&
          start.x > rect.left && start.x < rect.right &&
          Math.max(start.y, end.y) > rect.top &&
          Math.min(start.y, end.y) < rect.bottom
        if (horizontal || vertical) {
          intersections.push({ edgeId: edge.id, personId: rect.id })
        }
      })
    }
  })
  return intersections
}
