const BASE = '/api/v1'

function token() { return localStorage.getItem('token') }

async function req(method, path, body) {
  const headers = {}
  if (token()) headers['Authorization'] = `Bearer ${token()}`
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await res.json()
    : { detail: await res.text() }
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
  return data
}

export const api = {
  // auth
  register: (d)  => req('POST', '/auth/register', d),
  login: (d)     => req('POST', '/auth/login', d),
  me: ()         => req('GET', '/auth/me'),
  updateMe: (d)  => req('PATCH', '/auth/me', d),

  // users
  listUsers: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.role) qs.set('role', params.role)
    if (params.status) qs.set('status', params.status)
    const query = qs.toString()
    return req('GET', `/users${query ? `?${query}` : ''}`)
  },
  createGenealogist: (d) => req('POST', '/users/genealogists', d),
  updateUser: (id,d)     => req('PATCH', `/users/${id}`, d),

  // profiles
  createProfile: (d)    => req('POST', '/profiles', d),
  myProfiles: ()        => req('GET', '/profiles/my'),
  getProfile: (id)      => req('GET', `/profiles/${id}`),
  updateProfile: (id,d) => req('PATCH', `/profiles/${id}`, d),

  // persons
  createPerson: (pid,d)  => req('POST', `/profiles/${pid}/persons`, d),
  listPersons: (pid)     => req('GET', `/profiles/${pid}/persons`),
  getPerson: (id)        => req('GET', `/persons/${id}`),
  updatePerson: (id,d)   => req('PATCH', `/persons/${id}`, d),
  deletePerson: (id)     => req('DELETE', `/persons/${id}`),
  deletePersonPhoto: (id) => req('DELETE', `/persons/${id}/photo`),
  uploadPersonPhoto: async (id, blob) => {
    const form = new FormData()
    form.append('file', blob, 'photo.jpg')
    const res = await fetch(`${BASE}/persons/${id}/photo`, {
      method: 'POST',
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      body: form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
    return data
  },

  // relationships
  createRelationship: (pid,d) => req('POST', `/profiles/${pid}/relationships`, d),
  listRelationships: (pid)    => req('GET', `/profiles/${pid}/relationships`),
  deleteRelationship: (id)    => req('DELETE', `/relationships/${id}`),
  getTree: (pid)              => req('GET', `/profiles/${pid}/tree`),

  // facts
  createFact: (pid,d)  => req('POST', `/persons/${pid}/facts`, d),
  listFacts: (pid)     => req('GET', `/persons/${pid}/facts`),
  updateFact: (id,d)   => req('PATCH', `/facts/${id}`, d),
  deleteFact: (id)     => req('DELETE', `/facts/${id}`),

  // archive requests
  createRequest: (pid,d) => req('POST', `/profiles/${pid}/archive-requests`, d),
  listRequests: (pid)    => req('GET', `/profiles/${pid}/archive-requests`),
  myAssignedRequests: ()  => req('GET', '/archive-requests/assigned/me'),
  unassignedRequests: ()  => req('GET', '/archive-requests/unassigned'),
  allRequests: ()         => req('GET', '/archive-requests'),
  getRequest: (id)       => req('GET', `/archive-requests/${id}`),
  updateRequest: (id,d)  => req('PATCH', `/archive-requests/${id}`, d),
  assignRequest: (id,d)  => req('PATCH', `/archive-requests/${id}/assignee`, d),
  changeStatus: (id,d)   => req('PATCH', `/archive-requests/${id}/status`, d),
  requestClarification: (id,d) => req('POST', `/archive-requests/${id}/request-clarification`, d),
  provideClarification: (id,d) => req('POST', `/archive-requests/${id}/provide-clarification`, d),
  getHistory: (id)       => req('GET', `/archive-requests/${id}/history`),

  // notifications
  listNotifications: ()  => req('GET', '/notifications'),
  unreadCount: ()        => req('GET', '/notifications/unread-count'),
  markRead: (id)         => req('PATCH', `/notifications/${id}/read`),
  markAllRead: ()        => req('PATCH', '/notifications/read-all'),

  // archive request templates
  listTemplates: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.template_type && params.template_type !== 'ALL') qs.set('template_type', params.template_type)
    if (params.status_filter && params.status_filter !== 'ALL') qs.set('status_filter', params.status_filter)
    if (params.search) qs.set('search', params.search)
    const query = qs.toString()
    return req('GET', `/archive-request-templates${query ? `?${query}` : ''}`)
  },
  getTemplate: (id)       => req('GET', `/archive-request-templates/${id}`),
  createTemplate: (d)     => req('POST', '/archive-request-templates', d),
  updateTemplate: (id, d) => req('PUT', `/archive-request-templates/${id}`, d),
  toggleTemplate: (id)    => req('PATCH', `/archive-request-templates/${id}/toggle`),
  duplicateTemplate: (id) => req('POST', `/archive-request-templates/${id}/duplicate`),
  deleteTemplate: (id)    => req('DELETE', `/archive-request-templates/${id}`),
  listFieldDictionary: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.category && params.category !== 'ALL') qs.set('category', params.category)
    if (params.search) qs.set('search', params.search)
    const query = qs.toString()
    return req('GET', `/field-dictionary${query ? `?${query}` : ''}`)
  },
  createFieldDictionary: (d) => req('POST', '/field-dictionary', d),

  // generated archive requests for genealogist
  activeArchiveTemplates: () => req('GET', '/genealogist/archive-request-templates/active'),
  listGeneratedDocuments: (rid) => req('GET', `/genealogist/archive-requests/${rid}/generated-documents`),
  startGeneratedDocument: (rid, d) => req('POST', `/genealogist/archive-requests/${rid}/generated-documents/start`, d),
  getGeneratedDocument: (id) => req('GET', `/genealogist/generated-documents/${id}`),
  updateGeneratedFields: (id, d) => req('PATCH', `/genealogist/generated-documents/${id}/fields`, d),
  updateGeneratedFinalText: (id, d) => req('PATCH', `/genealogist/generated-documents/${id}/final-text`, d),
  updateGeneratedAttachments: (id, d) => req('PATCH', `/genealogist/generated-documents/${id}/attachments`, d),
  updateGeneratedComment: (id, d) => req('PATCH', `/genealogist/generated-documents/${id}/comment`, d),
  previewGeneratedDocument: (id) => req('POST', `/genealogist/generated-documents/${id}/preview`),
  exportGeneratedDocument: (id) => req('POST', `/genealogist/generated-documents/${id}/export`),
  updateGeneratedStatus: (id, d) => req('PATCH', `/genealogist/generated-documents/${id}/status`, d),
  saveGeneratedDraft: (id) => req('POST', `/genealogist/generated-documents/${id}/save-draft`),
  availableGeneratedAttachments: (id) => req('GET', `/genealogist/generated-documents/${id}/available-attachments`),

  // books
  createBook: (pid,d) => req('POST', `/profiles/${pid}/book`, d),
  listBooks: (pid)   => req('GET', `/profiles/${pid}/books`),

  // documents
  deleteDoc: (id)          => req('DELETE', `/documents/${id}`),
  listDocsByPerson: (pid)  => req('GET', `/documents/by-person/${pid}`),
  uploadDoc: (formData) => {
    const headers = {}
    if (token()) headers['Authorization'] = `Bearer ${token()}`
    return fetch(BASE + '/documents', { method: 'POST', headers, body: formData })
      .then(async r => {
        const contentType = r.headers.get('content-type') || ''
        const data = contentType.includes('application/json')
          ? await r.json()
          : { detail: await r.text() }
        if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
        return data
      })
  },
  listDocsByRequest: (rid) => req('GET', `/documents/by-archive-request/${rid}`),
  downloadUrl: (id) => `${BASE}/documents/${id}/download?token=${token()}`,
}
