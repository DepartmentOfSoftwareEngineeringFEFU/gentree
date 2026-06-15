import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTreeLayout,
  DEFAULT_LAYOUT_OPTIONS,
  findEdgeCardIntersections,
  findNodeOverlaps,
  formatPersonYears,
  pointsToPath,
} from './treeLayout.js'

let sequence = 0

function person(id, sex = 'UNKNOWN', birthYear = null) {
  sequence += 1
  return {
    id,
    last_name: id,
    first_name: '',
    middle_name: null,
    sex,
    is_living: true,
    birth_date: birthYear ? `${birthYear}-01-01` : null,
    death_date: null,
    created_at: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}Z`,
  }
}

function relationship(id, source, target, relationship_type, extra = {}) {
  sequence += 1
  return {
    id,
    source_person_id: source,
    target_person_id: target,
    relationship_type,
    start_date: null,
    end_date: null,
    notes: null,
    layout_as: null,
    created_at: `2026-01-01T00:01:${String(sequence).padStart(2, '0')}Z`,
    ...extra,
  }
}

function spouse(id, a, b, extra) {
  return relationship(id, a, b, 'SPOUSE', extra)
}

function parent(id, a, b) {
  return relationship(id, a, b, 'PARENT_CHILD')
}

function other(id, a, b, layout_as, notes) {
  return relationship(id, a, b, 'OTHER', { layout_as, notes })
}

function layout(nodes, edges) {
  return buildTreeLayout({ profile_id: 'profile', nodes, edges })
}

function nodeById(result, id) {
  return result.nodes.find(node => node.id === id)
}

function nodeCenterX(result, id) {
  const node = nodeById(result, id)
  const width = node.type === 'family'
    ? DEFAULT_LAYOUT_OPTIONS.familySize
    : DEFAULT_LAYOUT_OPTIONS.personWidth
  return node.position.x + width / 2
}

function representedRelationshipIds(result) {
  return result.edges
    .flatMap(edge => edge.data?.relationshipIds || [])
    .sort()
}

function assertCoreInvariants(nodes, edges) {
  const result = layout(nodes, edges)
  assert.deepEqual(findNodeOverlaps(result.nodes), [])
  assert.deepEqual(findEdgeCardIntersections(result), [])
  assert.deepEqual(
    representedRelationshipIds(result),
    edges.map(edge => edge.id).sort(),
  )
  edges.filter(edge =>
    edge.relationship_type === 'SPOUSE' ||
    (edge.relationship_type === 'OTHER' &&
      ['SPOUSE', 'SIBLING'].includes(edge.layout_as))
  ).forEach(edge => {
    assert.equal(
      nodeById(result, edge.source_person_id).position.y,
      nodeById(result, edge.target_person_id).position.y,
    )
  })
  edges.filter(edge =>
    edge.relationship_type === 'PARENT_CHILD' ||
    (edge.relationship_type === 'OTHER' && edge.layout_as === 'PARENT_CHILD')
  ).forEach(edge => {
    const rendered = result.edges.find(candidate =>
      candidate.data?.relationshipIds?.includes(edge.id)
    )
    if (rendered?.data?.relationKind === 'conflict') return
    assert.ok(
      nodeById(result, edge.source_person_id).position.y >
      nodeById(result, edge.target_person_id).position.y,
    )
  })
  assert.deepEqual(result, layout(nodes, edges))
  return result
}

test('lays out an ordinary family without overlaps', () => {
  const nodes = [
    person('father', 'MALE', 1970),
    person('mother', 'FEMALE', 1972),
    person('child', 'FEMALE', 2000),
  ]
  const edges = [
    spouse('marriage', 'father', 'mother'),
    parent('father-child', 'father', 'child'),
    parent('mother-child', 'mother', 'child'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const parentRoute = result.edges.find(edge => edge.id.startsWith('parents-'))
  assert.deepEqual(parentRoute.data.relationshipIds, ['father-child', 'mother-child'])
})

test('centers children over their own parent unions instead of the whole row', () => {
  const nodes = [
    person('grandfather', 'MALE'),
    person('grandmother', 'FEMALE'),
    person('father-a', 'MALE'),
    person('mother-a', 'FEMALE'),
    person('father-b', 'MALE'),
    person('mother-b', 'FEMALE'),
    person('child-a'),
    person('child-b'),
  ]
  const edges = [
    spouse('grandparents', 'grandfather', 'grandmother'),
    parent('grandfather-father-a', 'grandfather', 'father-a'),
    parent('grandmother-father-a', 'grandmother', 'father-a'),
    parent('grandfather-father-b', 'grandfather', 'father-b'),
    parent('grandmother-father-b', 'grandmother', 'father-b'),
    spouse('parents-a', 'father-a', 'mother-a'),
    spouse('parents-b', 'father-b', 'mother-b'),
    parent('father-a-child-a', 'father-a', 'child-a'),
    parent('mother-a-child-a', 'mother-a', 'child-a'),
    parent('father-b-child-b', 'father-b', 'child-b'),
    parent('mother-b-child-b', 'mother-b', 'child-b'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.equal(nodeCenterX(result, 'child-a'), nodeCenterX(result, 'union-parents-a'))
  assert.equal(nodeCenterX(result, 'child-b'), nodeCenterX(result, 'union-parents-b'))
})

test('uses one shared family trunk for several children', () => {
  const nodes = [
    person('father', 'MALE'),
    person('mother', 'FEMALE'),
    person('child-a'),
    person('child-b'),
  ]
  const edges = [
    spouse('marriage', 'father', 'mother'),
    parent('fa', 'father', 'child-a'),
    parent('ma', 'mother', 'child-a'),
    parent('fb', 'father', 'child-b'),
    parent('mb', 'mother', 'child-b'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.equal(result.edges.filter(edge => edge.data?.relationKind === 'parent').length, 2)
})

test('renders a single parent directly', () => {
  const nodes = [person('parent'), person('child')]
  const edges = [parent('single-parent', 'parent', 'child')]

  const result = assertCoreInvariants(nodes, edges)
  const route = result.edges.find(edge => edge.data?.relationshipIds?.includes('single-parent'))
  assert.equal(route.source, 'parent')
})

test('places known siblings together without inventing parents', () => {
  const nodes = [person('first-brother'), person('second-brother')]
  const edges = [
    other('brothers', 'first-brother', 'second-brother', 'SIBLING', 'Братья'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const first = nodeById(result, 'first-brother')
  const second = nodeById(result, 'second-brother')
  const relation = result.edges.find(edge =>
    edge.data?.relationshipIds?.includes('brothers')
  )

  assert.equal(first.position.y, second.position.y)
  assert.ok(Math.abs(first.position.x - second.position.x) < 400)
  assert.equal(relation.data.relationKind, 'sibling')
  assert.equal(relation.data.points[0].y, first.position.y)
  assert.ok(relation.data.points.some(point => point.y < first.position.y))
  assert.equal(result.nodes.filter(node => node.type === 'family').length, 0)
})

test('keeps a sibling near a married person on the same generation', () => {
  const nodes = [
    person('sister', 'FEMALE'),
    person('brother', 'MALE'),
    person('brother-wife', 'FEMALE'),
  ]
  const edges = [
    spouse('brother-marriage', 'brother', 'brother-wife'),
    other('siblings', 'sister', 'brother', 'SIBLING', 'Брат и сестра'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.equal(nodeById(result, 'sister').position.y, nodeById(result, 'brother').position.y)
  assert.equal(
    Math.abs(nodeCenterX(result, 'sister') - nodeCenterX(result, 'brother')),
    DEFAULT_LAYOUT_OPTIONS.personWidth + DEFAULT_LAYOUT_OPTIONS.nodeGap,
  )
})

test('keeps an external sibling next to the correct spouse in a crowded row', () => {
  const nodes = [
    person('husband', 'MALE'),
    person('wife', 'FEMALE'),
    person('wife-sister', 'FEMALE'),
    person('neighbor-a'),
    person('neighbor-b'),
    person('neighbor-c'),
  ]
  const edges = [
    spouse('marriage', 'husband', 'wife'),
    other('wife-siblings', 'wife', 'wife-sister', 'SIBLING', 'Сёстры'),
    other('chain-a', 'husband', 'neighbor-a', null, 'Знакомы'),
    other('chain-b', 'neighbor-a', 'neighbor-b', null, 'Знакомы'),
    other('chain-c', 'neighbor-b', 'neighbor-c', null, 'Знакомы'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.equal(
    Math.abs(nodeCenterX(result, 'wife') - nodeCenterX(result, 'wife-sister')),
    DEFAULT_LAYOUT_OPTIONS.personWidth + DEFAULT_LAYOUT_OPTIONS.nodeGap,
  )
  assert.ok(
    Math.abs(nodeCenterX(result, 'husband') - nodeCenterX(result, 'wife-sister')) >
    Math.abs(nodeCenterX(result, 'wife') - nodeCenterX(result, 'wife-sister')),
  )
})

test('shows a sibling relation as conflicting when generations differ', () => {
  const nodes = [person('parent'), person('child')]
  const edges = [
    parent('parent-child', 'parent', 'child'),
    other('invalid-siblings', 'parent', 'child', 'SIBLING', 'Братья'),
  ]

  const result = layout(nodes, edges)
  const relation = result.edges.find(edge =>
    edge.data?.relationshipIds?.includes('invalid-siblings')
  )
  assert.ok(result.diagnostics.some(item => item.code === 'sibling-generation-conflict'))
  assert.equal(relation.data.relationKind, 'conflict')
  assert.deepEqual(representedRelationshipIds(result), edges.map(edge => edge.id).sort())
})

test('selects the newest active marriage as the primary couple', () => {
  const nodes = [person('person'), person('old'), person('new')]
  const edges = [
    spouse('old-marriage', 'person', 'old', { start_date: '1990-01-01' }),
    spouse('new-marriage', 'person', 'new', { start_date: '2010-01-01' }),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.ok(nodeById(result, 'union-new-marriage'))
  assert.equal(nodeById(result, 'person').position.y, nodeById(result, 'new').position.y)
})

test('prefers an explicit marriage start date before created_at', () => {
  const nodes = [person('person'), person('dated'), person('undated')]
  const edges = [
    spouse('dated-marriage', 'person', 'dated', {
      start_date: '1990-01-01',
      created_at: '2020-01-01T00:00:00Z',
    }),
    spouse('undated-marriage', 'person', 'undated', {
      created_at: '2025-01-01T00:00:00Z',
    }),
  ]

  const result = assertCoreInvariants(nodes, edges)
  assert.ok(nodeById(result, 'union-dated-marriage'))
})

test('keeps former spouses on one generation and labels the relation', () => {
  const nodes = [person('a'), person('b')]
  const edges = [
    other('former', 'a', 'b', 'SPOUSE', 'Бывшие супруги'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const edge = result.edges.find(item => item.data?.relationshipIds?.includes('former'))
  assert.equal(edge.label, 'Бывшие супруги')
  assert.equal(nodeById(result, 'a').position.y, nodeById(result, 'b').position.y)
})

test('routes a shared child from the exact former-spouse union', () => {
  const nodes = [
    person('mother', 'FEMALE'),
    person('former-father', 'MALE'),
    person('current-husband', 'MALE'),
    person('child'),
  ]
  const edges = [
    other('former-union', 'mother', 'former-father', 'SPOUSE', 'Бывшие супруги'),
    spouse('current-union', 'mother', 'current-husband', {
      start_date: '2010-01-01',
    }),
    parent('mother-child', 'mother', 'child'),
    parent('former-father-child', 'former-father', 'child'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const childRoute = result.edges.find(edge =>
    edge.data?.relationshipIds?.includes('former-father-child')
  )
  assert.equal(childRoute.source, 'union-former-union')
  assert.deepEqual(
    childRoute.data.relationshipIds,
    ['former-father-child', 'mother-child'],
  )
})

test('places an other-parent relation on adjacent generations', () => {
  const nodes = [person('step-parent'), person('child')]
  const edges = [other('step', 'step-parent', 'child', 'PARENT_CHILD', 'Отчим')]

  const result = assertCoreInvariants(nodes, edges)
  const route = result.edges.find(edge => edge.data?.relationshipIds?.includes('step'))
  assert.equal(route.data.relationKind, 'other-parent')
  assert.equal(route.label, 'Отчим')
})

test('step-child with two-marriage parent ends up near the step-parent, not far right', () => {
  // Viktor has two marriages. Natalia is the first wife (two bio kids).
  // Jolie is the second wife (one bio kid: Chick). Popa is Viktor's step-child.
  // Voronin family is a separate branch (children of Viktor's sister Olga).
  // The step-child Popa must land near Viktor, not to the right of the Voronin kids.
  const nodes = [
    person('grandpa', 'MALE', 1940),
    person('grandma', 'FEMALE', 1945),
    person('viktor', 'MALE', 1969),
    person('olga', 'FEMALE', 1972),
    person('natalia', 'FEMALE', 1973),
    person('jolie', 'FEMALE', 1980),
    person('voronin', 'MALE', 1970),
    person('danatas', 'MALE', 2005),
    person('gleb', 'MALE', 2005),
    person('chick', 'FEMALE', 2003),
    person('roman', 'MALE', 2000),
    person('anton', 'MALE', 2002),
    person('popa', 'UNKNOWN', 2005),
  ]
  const edges = [
    spouse('grandparents', 'grandpa', 'grandma'),
    parent('gp-viktor', 'grandpa', 'viktor'),
    parent('gm-viktor', 'grandma', 'viktor'),
    parent('gp-olga', 'grandpa', 'olga'),
    parent('gm-olga', 'grandma', 'olga'),
    spouse('viktor-natalia', 'viktor', 'natalia', { start_date: '1995-01-01' }),
    parent('v-danatas', 'viktor', 'danatas'),
    parent('n-danatas', 'natalia', 'danatas'),
    parent('v-gleb', 'viktor', 'gleb'),
    parent('n-gleb', 'natalia', 'gleb'),
    spouse('viktor-jolie', 'viktor', 'jolie', { start_date: '2001-01-01' }),
    parent('v-chick', 'viktor', 'chick'),
    parent('j-chick', 'jolie', 'chick'),
    other('viktor-popa', 'viktor', 'popa', 'PARENT_CHILD', 'Отчим'),
    spouse('olga-voronin', 'olga', 'voronin'),
    parent('o-roman', 'olga', 'roman'),
    parent('v-roman', 'voronin', 'roman'),
    parent('o-anton', 'olga', 'anton'),
    parent('v-anton', 'voronin', 'anton'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const viktorX = nodeCenterX(result, 'viktor')
  const popaX = nodeCenterX(result, 'popa')
  const romanX = nodeCenterX(result, 'roman')
  const antonX = nodeCenterX(result, 'anton')
  const voroninRightEdge = Math.max(romanX, antonX) + DEFAULT_LAYOUT_OPTIONS.personWidth / 2
  assert.ok(
    popaX < voroninRightEdge,
    `step-child Popa (x=${popaX}) should be left of Voronin children right edge (${voroninRightEdge})`,
  )
  assert.ok(
    Math.abs(popaX - viktorX) < Math.abs(romanX - viktorX) + DEFAULT_LAYOUT_OPTIONS.personWidth,
    `step-child Popa (x=${popaX}) should be closer to Viktor (x=${viktorX}) than Voronin kids are`,
  )
})

test('keeps parents of an already married person near the same component', () => {
  const nodes = [
    person('grandmother'),
    person('wife'),
    person('husband'),
    person('child'),
  ]
  const edges = [
    parent('grandmother-wife', 'grandmother', 'wife'),
    spouse('marriage', 'wife', 'husband'),
    parent('wife-child', 'wife', 'child'),
    parent('husband-child', 'husband', 'child'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const xs = ['grandmother', 'wife', 'husband', 'child']
    .map(id => nodeById(result, id).position.x)
  assert.ok(Math.max(...xs) - Math.min(...xs) < 1000)
})

test('places a new sibling in the same compact family component', () => {
  const nodes = [
    person('mother'),
    person('father'),
    person('daughter'),
    person('daughter-husband'),
    person('brother'),
  ]
  const edges = [
    spouse('parents', 'mother', 'father'),
    parent('m-d', 'mother', 'daughter'),
    parent('f-d', 'father', 'daughter'),
    parent('m-b', 'mother', 'brother'),
    parent('f-b', 'father', 'brother'),
    spouse('daughter-marriage', 'daughter', 'daughter-husband'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const daughterX = nodeById(result, 'daughter').position.x
  const brotherX = nodeById(result, 'brother').position.x
  assert.ok(Math.abs(daughterX - brotherX) < 700)
})

test('packs disconnected components without node overlap', () => {
  const nodes = [
    person('a1'), person('a2'), person('a3'),
    person('b1'), person('b2'),
  ]
  const edges = [
    spouse('a-marriage', 'a1', 'a2'),
    parent('a-child', 'a1', 'a3'),
    spouse('b-marriage', 'b1', 'b2'),
  ]

  assertCoreInvariants(nodes, edges)
})

test('shows a legacy parent cycle as a diagnostic conflict', () => {
  const nodes = [person('a'), person('b'), person('c')]
  const edges = [
    parent('ab', 'a', 'b'),
    parent('bc', 'b', 'c'),
    parent('ca', 'c', 'a'),
  ]

  const result = layout(nodes, edges)
  assert.ok(result.diagnostics.some(item => item.code === 'parent-cycle'))
  assert.ok(result.edges.some(edge => edge.data?.relationKind === 'conflict'))
  assert.deepEqual(representedRelationshipIds(result), edges.map(edge => edge.id).sort())
})

test('routes overlapping families on separate local lanes', () => {
  const nodes = [
    person('p1'), person('p2'), person('p3'), person('p4'),
    person('c1'), person('c2'),
  ]
  const edges = [
    spouse('u1', 'p1', 'p2'),
    spouse('u2', 'p3', 'p4'),
    parent('p1-c1', 'p1', 'c1'),
    parent('p2-c1', 'p2', 'c1'),
    parent('p3-c2', 'p3', 'c2'),
    parent('p4-c2', 'p4', 'c2'),
  ]

  const result = assertCoreInvariants(nodes, edges)
  const routes = result.edges.filter(edge => edge.data?.relationKind === 'parent')
  routes.forEach(route => assert.ok(pointsToPath(route.data.points).startsWith('M ')))
})

test('routes a generic other relation around an intervening card', () => {
  const nodes = [person('left'), person('middle'), person('right')]
  const edges = [other('left-right', 'left', 'right', null, 'Иная связь')]

  const result = assertCoreInvariants(nodes, edges)
  const route = result.edges.find(edge => edge.data?.relationshipIds?.includes('left-right'))
  assert.ok(route.data.points.length > 2)
})

test('regression: Lolik, Olympus, Tatyana sibling, Valentina and Lidia', () => {
  const nodes = [
    person('viktor', 'MALE'),
    person('natalia', 'FEMALE'),
    person('lolik', 'MALE'),
    person('olympus', 'MALE'),
    person('lidia', 'FEMALE'),
    person('vladimir', 'MALE'),
    person('valentina', 'FEMALE'),
    person('tatyana', 'FEMALE'),
    person('tatyana-mother', 'FEMALE'),
    person('tatyana-father', 'MALE'),
    person('tatyana-brother', 'MALE'),
  ]
  const edges = [
    spouse('viktor-natalia', 'viktor', 'natalia', {
      start_date: '1990-01-01',
      created_at: '2020-01-01T00:00:00Z',
    }),
    spouse('natalia-lolik', 'natalia', 'lolik', {
      start_date: '2000-01-01',
      created_at: '2021-01-01T00:00:00Z',
    }),
    parent('lolik-olympus', 'lolik', 'olympus'),
    spouse('lidia-vladimir', 'lidia', 'vladimir'),
    parent('lidia-natalia', 'lidia', 'natalia'),
    parent('vladimir-natalia', 'vladimir', 'natalia'),
    parent('valentina-lidia', 'valentina', 'lidia'),
    spouse('tatyana-parents', 'tatyana-mother', 'tatyana-father'),
    parent('tatyana-mother-tatyana', 'tatyana-mother', 'tatyana'),
    parent('tatyana-father-tatyana', 'tatyana-father', 'tatyana'),
    parent('tatyana-mother-brother', 'tatyana-mother', 'tatyana-brother'),
    parent('tatyana-father-brother', 'tatyana-father', 'tatyana-brother'),
  ]

  assertCoreInvariants(nodes, edges)
})

test('exports stable card dimensions for UI and invariant checks', () => {
  assert.deepEqual(
    {
      width: DEFAULT_LAYOUT_OPTIONS.personWidth,
      height: DEFAULT_LAYOUT_OPTIONS.personHeight,
    },
    { width: 190, height: 64 },
  )
})

test('formats person years for known and unknown life dates', () => {
  assert.equal(formatPersonYears({
    birth_date: null,
    death_date: null,
    is_living: true,
  }), '-')
  assert.equal(formatPersonYears({
    birth_date: null,
    death_date: '2000-05-20',
    is_living: false,
  }), '? - 2000')
  assert.equal(formatPersonYears({
    birth_date: '1900-02-10',
    death_date: '2000-05-20',
    is_living: false,
  }), '1900 - 2000')
  assert.equal(formatPersonYears({
    birth_date: '2005-02-10',
    death_date: null,
    is_living: true,
  }), '2005')
})
