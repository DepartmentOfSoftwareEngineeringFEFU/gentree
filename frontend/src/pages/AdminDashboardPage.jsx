import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'

const STATUS_LABEL = {
  DRAFT: 'Черновик',
  PREPARED: 'Подготовлен',
  SENT: 'Направлен',
  IN_PROGRESS: 'В обработке',
  NEEDS_CLARIFICATION: 'Требуются доп. сведения',
  RESPONSE_RECEIVED: 'Получен ответ',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
}

const STATUS_FILTERS = [
  ['ALL', 'Все статусы'],
  ['PREPARED', 'Подготовлен'],
  ['SENT', 'Направлен'],
  ['IN_PROGRESS', 'В обработке'],
  ['NEEDS_CLARIFICATION', 'Требуются доп. сведения'],
  ['RESPONSE_RECEIVED', 'Получен ответ'],
  ['COMPLETED', 'Завершён'],
  ['CANCELLED', 'Отменён'],
]

const USER_STATUS_LABEL = {
  ACTIVE: 'Активен',
  BLOCKED: 'Отстранён',
}

const TEMPLATE_TYPE_LABEL = {
  GENERAL_ARCHIVE: 'Государственный архив',
  MILITARY_ARCHIVE: 'Военный архив',
  CIVIL_REGISTRY: 'ЗАГС / актовые записи',
  MEDICAL_ARCHIVE: 'Медицинская организация / роддом',
  PERSONNEL_ARCHIVE: 'Документы по личному составу',
  RESIDENCE_PROPERTY_ARCHIVE: 'Проживание / домовые книги / имущество',
  CUSTOM: 'Другое',
}

const TEMPLATE_TYPES = Object.entries(TEMPLATE_TYPE_LABEL)

const FIELD_CATEGORY_LABEL = {
  person: 'Персона',
  applicant: 'Заявитель',
  archive: 'Архив',
  military: 'Военные сведения',
  medical: 'Медицина',
  residence: 'Проживание / имущество',
  document: 'Документ',
  custom: 'Пользовательские',
}

const FIELD_CATEGORIES = Object.entries(FIELD_CATEGORY_LABEL)

const FIELD_DATA_TYPE_LABEL = {
  text: 'Строка',
  textarea: 'Текст',
  date: 'Дата',
  year: 'Год',
  number: 'Число',
  select: 'Список',
  checkbox: 'Флаг',
}

const BLOCK_TYPE_LABEL = {
  HEADER_RIGHT: 'Правый верхний блок',
  HEADER_LEFT: 'Левый верхний блок',
  TITLE: 'Заголовок',
  BODY: 'Основной текст',
  ATTACHMENTS: 'Список приложений',
  FOOTER: 'Дата и подпись',
  CUSTOM_BLOCK: 'Дополнительный блок',
}

const BLOCK_TYPES = Object.entries(BLOCK_TYPE_LABEL)

const TERMINAL_REQUEST_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

function fullName(user) {
  return [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ') || user.email
}

function SummaryItem({ label, value }) {
  return (
    <div style={{
      minWidth: 170,
      flex: '1 1 170px',
      border: '1px solid #ddd4c0',
      borderRadius: 7,
      padding: 12,
      background: '#fdfaf4',
    }}>
      <div className="label">{label}</div>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  )
}

const EMPTY_GENEALOGIST = {
  email: '',
  password: '',
  last_name: '',
  first_name: '',
  middle_name: '',
  notes: '',
}

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const [adminSection, setAdminSection] = useState('REQUESTS')
  const [requests, setRequests] = useState([])
  const [unassigned, setUnassigned] = useState([])
  const [genealogists, setGenealogists] = useState([])
  const [genealogistForm, setGenealogistForm] = useState(EMPTY_GENEALOGIST)
  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState({})
  const [selectedAssignees, setSelectedAssignees] = useState({})
  const [requestStatusFilter, setRequestStatusFilter] = useState('ALL')
  const [assigneeFilter, setAssigneeFilter] = useState('ALL')
  const [requestScope, setRequestScope] = useState('ACTIVE')
  const [showGenealogistForm, setShowGenealogistForm] = useState(false)
  const [genealogistSort, setGenealogistSort] = useState('NAME')
  const [assigningId, setAssigningId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return

    setLoading(true)
    setError('')
    setMessage('')
    Promise.all([
      api.allRequests(),
      api.unassignedRequests(),
      api.listUsers({ role: 'GENEALOGIST' }),
    ])
      .then(([allRequests, unassignedRequests, users]) => {
        setRequests(allRequests)
        setUnassigned(unassignedRequests)
        setGenealogists(users)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [user])

  const activeGenealogists = useMemo(
    () => genealogists.filter(g => g.status === 'ACTIVE'),
    [genealogists],
  )
  const sortedGenealogists = useMemo(() => {
    const list = [...genealogists]
    list.sort((a, b) => {
      if (genealogistSort === 'STATUS') {
        const statusOrder = { ACTIVE: 0, BLOCKED: 1 }
        const byStatus = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
        if (byStatus !== 0) return byStatus
      }
      if (genealogistSort === 'LOAD') {
        const loadA = requests.filter(req =>
          req.assigned_genealogist_user_id === a.id
          && !TERMINAL_REQUEST_STATUSES.has(req.current_status)
        ).length
        const loadB = requests.filter(req =>
          req.assigned_genealogist_user_id === b.id
          && !TERMINAL_REQUEST_STATUSES.has(req.current_status)
        ).length
        if (loadA !== loadB) return loadB - loadA
      }
      return fullName(a).localeCompare(fullName(b), 'ru')
    })
    return list
  }, [genealogists, genealogistSort, requests])
  const genealogistById = useMemo(
    () => Object.fromEntries(genealogists.map(g => [g.id, g])),
    [genealogists],
  )
  const assignedRequests = useMemo(
    () => requests.filter(req => req.assigned_genealogist_user_id),
    [requests],
  )
  const filteredAssignedRequests = useMemo(
    () => assignedRequests.filter(req => {
      const scopeOk = requestScope === 'ARCHIVE'
        ? TERMINAL_REQUEST_STATUSES.has(req.current_status)
        : !TERMINAL_REQUEST_STATUSES.has(req.current_status)
      const statusOk = requestStatusFilter === 'ALL' || req.current_status === requestStatusFilter
      const assigneeOk = assigneeFilter === 'ALL' || req.assigned_genealogist_user_id === assigneeFilter
      return scopeOk && statusOk && assigneeOk
    }),
    [assignedRequests, assigneeFilter, requestScope, requestStatusFilter],
  )
  const workloadByGenealogist = useMemo(
    () => Object.fromEntries(genealogists.map(g => [
      g.id,
      {
        active: requests.filter(req =>
          req.assigned_genealogist_user_id === g.id
          && !TERMINAL_REQUEST_STATUSES.has(req.current_status)
        ).length,
        waiting: requests.filter(req =>
          req.assigned_genealogist_user_id === g.id
          && req.current_status === 'NEEDS_CLARIFICATION'
        ).length,
        completed: requests.filter(req =>
          req.assigned_genealogist_user_id === g.id
          && req.current_status === 'COMPLETED'
        ).length,
      },
    ])),
    [genealogists, requests],
  )
  const requestSummary = useMemo(() => {
    const activeAssigned = requests.filter(req =>
      req.assigned_genealogist_user_id
      && !TERMINAL_REQUEST_STATUSES.has(req.current_status)
    ).length
    const needsClarification = requests.filter(req =>
      req.current_status === 'NEEDS_CLARIFICATION'
    ).length
    const completed = requests.filter(req => req.current_status === 'COMPLETED').length
    const problematicUnassigned = unassigned.filter(req => req.current_status !== 'PREPARED').length
    return {
      unassigned: unassigned.length,
      activeAssigned,
      needsClarification,
      completed,
      problematicUnassigned,
    }
  }, [requests, unassigned])

  const selectAssignee = (requestId, genealogistId) => {
    setSelectedAssignees(prev => ({ ...prev, [requestId]: genealogistId }))
  }

  const assignRequest = async (requestId) => {
    const genealogistId = selectedAssignees[requestId]
    if (!genealogistId) return
    const req = requests.find(item => item.id === requestId) || unassigned.find(item => item.id === requestId)
    const previousAssignee = req?.assigned_genealogist_user_id
      ? genealogistById[req.assigned_genealogist_user_id]
      : null
    const nextAssignee = genealogistById[genealogistId]
    if (previousAssignee && previousAssignee.id !== genealogistId) {
      const confirmed = window.confirm(
        `Переназначить запрос «${req.title}» с ${fullName(previousAssignee)} на ${fullName(nextAssignee)}?`,
      )
      if (!confirmed) return
    }

    setError('')
    setMessage('')
    setAssigningId(requestId)
    try {
      const updated = await api.assignRequest(requestId, { genealogist_user_id: genealogistId })
      setRequests(prev => prev.map(req => req.id === requestId ? updated : req))
      setUnassigned(prev => prev.filter(req => req.id !== requestId))
      setSelectedAssignees(prev => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
      setMessage(previousAssignee ? 'Запрос переназначен.' : 'Запрос назначен.')
    } catch (err) {
      setError(err.message)
    } finally {
      setAssigningId('')
    }
  }

  const formField = (field) => (e) => {
    setGenealogistForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const editField = (field) => (e) => {
    setEditForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const createGenealogist = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const created = await api.createGenealogist({
        email: genealogistForm.email,
        password: genealogistForm.password,
        last_name: genealogistForm.last_name || null,
        first_name: genealogistForm.first_name || null,
        middle_name: genealogistForm.middle_name || null,
        notes: genealogistForm.notes || null,
      })
      setGenealogists(prev => [...prev, created].sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru')))
      setGenealogistForm(EMPTY_GENEALOGIST)
      setShowGenealogistForm(false)
      setMessage('Генеалог добавлен в активный состав.')
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (genealogist) => {
    setEditingId(genealogist.id)
    setEditForm({
      email: genealogist.email,
      last_name: genealogist.last_name ?? '',
      first_name: genealogist.first_name ?? '',
      middle_name: genealogist.middle_name ?? '',
      notes: genealogist.notes ?? '',
    })
  }

  const saveEdit = async (genealogistId) => {
    setError('')
    setMessage('')
    try {
      const updated = await api.updateUser(genealogistId, {
        email: editForm.email,
        last_name: editForm.last_name || null,
        first_name: editForm.first_name || null,
        middle_name: editForm.middle_name || null,
        notes: editForm.notes || null,
      })
      setGenealogists(prev => prev.map(g => g.id === updated.id ? updated : g))
      setEditingId('')
      setEditForm({})
      setMessage('Данные генеалога сохранены.')
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleStatus = async (genealogist) => {
    const nextStatus = genealogist.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE'
    const actionText = nextStatus === 'BLOCKED' ? 'отстранить' : 'вернуть в активный состав'
    const consequence = nextStatus === 'BLOCKED'
      ? ' Активные запросы этого генеалога останутся без исполнителя.'
      : ''
    if (!window.confirm(`Вы действительно хотите ${actionText} генеалога ${fullName(genealogist)}?${consequence}`)) {
      return
    }
    setError('')
    setMessage('')
    try {
      const updated = await api.updateUser(genealogist.id, { status: nextStatus })
      setGenealogists(prev => prev.map(g => g.id === updated.id ? updated : g))
      if (nextStatus === 'BLOCKED') {
        const [allRequests, unassignedRequests] = await Promise.all([
          api.allRequests(),
          api.unassignedRequests(),
        ])
        setRequests(allRequests)
        setUnassigned(unassignedRequests)
      }
      setMessage(nextStatus === 'BLOCKED'
        ? 'Генеалог отстранён от работы.'
        : 'Генеалог возвращён в активный состав.')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!user) return <div className="page muted">Загрузка...</div>
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />

  return (
    <div className="page wide">
      <div style={{ marginBottom: 20 }}>
        <h1>Панель администратора</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Распределение запросов, управление генеалогами и шаблонами архивных обращений
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className={adminSection === 'REQUESTS' ? 'sm' : 'outline sm'}
            onClick={() => setAdminSection('REQUESTS')}
          >
            Запросы
          </button>
          <button
            className={adminSection === 'GENEALOGISTS' ? 'sm' : 'outline sm'}
            onClick={() => setAdminSection('GENEALOGISTS')}
          >
            Генеалоги
          </button>
          <button
            className={adminSection === 'TEMPLATES' ? 'sm' : 'outline sm'}
            onClick={() => setAdminSection('TEMPLATES')}
          >
            Шаблоны
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {message && <p className="success" style={{ marginBottom: 12 }}>{message}</p>}

      {loading ? (
        <p className="muted">Загрузка...</p>
      ) : (
        <div className="col" style={{ gap: 18 }}>
          {adminSection === 'REQUESTS' && (
            <>
          <section className="card">
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <SummaryItem label="Без исполнителя" value={requestSummary.unassigned} />
              <SummaryItem label="Активные назначенные" value={requestSummary.activeAssigned} />
              <SummaryItem label="Требуют доп. сведений" value={requestSummary.needsClarification} />
              <SummaryItem label="Завершённые" value={requestSummary.completed} />
            </div>
            {requestSummary.problematicUnassigned > 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                {requestSummary.problematicUnassigned} запрос(ов) уже были в обработке, но сейчас не имеют исполнителя.
              </p>
            )}
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h2>Запросы без исполнителя</h2>
              <div className="row" style={{ gap: 8 }}>
                {activeGenealogists.length === 0 && (
                  <span className="badge cancelled">Нет активных генеалогов</span>
                )}
                {unassigned.some(req => req.current_status !== 'PREPARED') && (
                  <span className="badge needs_clarification">
                    Есть запросы после отстранения
                  </span>
                )}
                <span className="badge">{unassigned.length}</span>
              </div>
            </div>

            {unassigned.length === 0 ? (
              <p className="muted">Нет запросов, ожидающих назначения.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Запрос</th>
                    <th>Статус</th>
                    <th>Исполнитель</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map(req => (
                    <tr
                      key={req.id}
                      style={{
                        background: req.current_status !== 'PREPARED' ? '#fff7ed' : undefined,
                      }}
                    >
                      <td>
                        <strong>{req.title}</strong>
                        {req.current_status !== 'PREPARED' && (
                          <div style={{ color: '#9a3412', fontSize: 12, marginTop: 2 }}>
                            Запрос уже был в работе и требует нового исполнителя
                          </div>
                        )}
                        {req.request_goal && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {req.request_goal}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${req.current_status.toLowerCase()}`}>
                          {STATUS_LABEL[req.current_status] ?? req.current_status}
                        </span>
                      </td>
                      <td>
                        <select
                          value={selectedAssignees[req.id] ?? ''}
                          onChange={e => selectAssignee(req.id, e.target.value)}
                          disabled={activeGenealogists.length === 0 || assigningId === req.id}
                          style={{ minWidth: 190 }}
                        >
                          <option value="">Выберите генеалога</option>
                          {activeGenealogists.map(g => (
                            <option key={g.id} value={g.id}>{fullName(g)}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="sm"
                          disabled={!selectedAssignees[req.id] || assigningId === req.id}
                          onClick={() => assignRequest(req.id)}
                        >
                          {assigningId === req.id ? '...' : 'Назначить'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h2>Назначенные запросы</h2>
              <span className="badge">{filteredAssignedRequests.length}</span>
            </div>

            <div className="row" style={{ marginBottom: 12 }}>
              <button
                className={requestScope === 'ACTIVE' ? 'sm' : 'outline sm'}
                onClick={() => {
                  setRequestScope('ACTIVE')
                  setRequestStatusFilter('ALL')
                }}
              >
                Активные
              </button>
              <button
                className={requestScope === 'ARCHIVE' ? 'sm' : 'outline sm'}
                onClick={() => {
                  setRequestScope('ARCHIVE')
                  setRequestStatusFilter('ALL')
                }}
              >
                Архив
              </button>
              <select value={requestStatusFilter} onChange={e => setRequestStatusFilter(e.target.value)}>
                {STATUS_FILTERS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                <option value="ALL">Все генеалоги</option>
                {sortedGenealogists.map(g => (
                  <option key={g.id} value={g.id}>{fullName(g)}</option>
                ))}
              </select>
            </div>

            {filteredAssignedRequests.length === 0 ? (
              <p className="muted">Назначенных запросов по выбранным фильтрам нет.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Запрос</th>
                    <th>Статус</th>
                    <th>Текущий исполнитель</th>
                    <th>Переназначить</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignedRequests.map(req => {
                    const assignee = genealogistById[req.assigned_genealogist_user_id]
                    const selected = selectedAssignees[req.id] ?? req.assigned_genealogist_user_id ?? ''
                    return (
                      <tr key={req.id}>
                        <td>
                          <strong>{req.title}</strong>
                          {req.request_goal && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{req.request_goal}</div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${req.current_status.toLowerCase()}`}>
                            {STATUS_LABEL[req.current_status] ?? req.current_status}
                          </span>
                        </td>
                        <td>
                          {assignee ? fullName(assignee) : '—'}
                          {assignee?.status === 'BLOCKED' && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Отстранён от работы</div>
                          )}
                        </td>
                        <td>
                          <select
                            value={selected}
                            onChange={e => selectAssignee(req.id, e.target.value)}
                            disabled={
                              TERMINAL_REQUEST_STATUSES.has(req.current_status)
                              || activeGenealogists.length === 0
                              || assigningId === req.id
                            }
                            style={{ minWidth: 190 }}
                          >
                            <option value="">Выберите генеалога</option>
                          {activeGenealogists.map(g => (
                            <option key={g.id} value={g.id}>{fullName(g)}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="sm"
                            disabled={
                              TERMINAL_REQUEST_STATUSES.has(req.current_status)
                              || !selectedAssignees[req.id]
                              || selectedAssignees[req.id] === req.assigned_genealogist_user_id
                              || assigningId === req.id
                            }
                            onClick={() => assignRequest(req.id)}
                          >
                            {assigningId === req.id ? '...' : 'Сохранить'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
            </>
          )}

          {adminSection === 'GENEALOGISTS' && (
          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h2>Состав генеалогов</h2>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge">{activeGenealogists.length} активных</span>
                <button
                  className={showGenealogistForm ? 'outline sm' : 'sm'}
                  onClick={() => setShowGenealogistForm(prev => !prev)}
                >
                  {showGenealogistForm ? 'Скрыть форму' : 'Добавление генеалога'}
                </button>
              </div>
            </div>

            {showGenealogistForm && (
              <form onSubmit={createGenealogist} className="col" style={{ marginBottom: 16 }}>
                <div className="row">
                  <input
                    type="email"
                    placeholder="Email"
                    value={genealogistForm.email}
                    onChange={formField('email')}
                    required
                    style={{ flex: 1 }}
                  />
                  <input
                    type="password"
                    placeholder="Пароль"
                    value={genealogistForm.password}
                    onChange={formField('password')}
                    required
                    minLength={8}
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="row">
                  <input
                    placeholder="Фамилия"
                    value={genealogistForm.last_name}
                    onChange={formField('last_name')}
                    style={{ flex: 1 }}
                  />
                  <input
                    placeholder="Имя"
                    value={genealogistForm.first_name}
                    onChange={formField('first_name')}
                    style={{ flex: 1 }}
                  />
                  <input
                    placeholder="Отчество"
                    value={genealogistForm.middle_name}
                    onChange={formField('middle_name')}
                    style={{ flex: 1 }}
                  />
                </div>
                <textarea
                  placeholder="Примечание"
                  value={genealogistForm.notes}
                  onChange={formField('notes')}
                  rows={2}
                />
                <div className="row">
                  <button type="submit">Добавить</button>
                  <button type="button" className="outline" onClick={() => setShowGenealogistForm(false)}>
                    Отмена
                  </button>
                </div>
              </form>
            )}

            <div className="row" style={{ marginBottom: 12 }}>
              <span className="label">Сортировка</span>
              <select value={genealogistSort} onChange={e => setGenealogistSort(e.target.value)}>
                <option value="NAME">По ФИО</option>
                <option value="STATUS">По статусу</option>
                <option value="LOAD">По активной нагрузке</option>
              </select>
            </div>

            {genealogists.length === 0 ? (
              <p className="muted">Генеалоги не найдены.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>ФИО</th><th>Email</th><th>Нагрузка</th><th>Статус</th><th></th></tr>
                </thead>
                <tbody>
                  {sortedGenealogists.map(g => (
                    <tr key={g.id}>
                      {editingId === g.id ? (
                        <>
                          <td>
                            <div className="col">
                              <input value={editForm.last_name} onChange={editField('last_name')} placeholder="Фамилия" />
                              <input value={editForm.first_name} onChange={editField('first_name')} placeholder="Имя" />
                              <input value={editForm.middle_name} onChange={editField('middle_name')} placeholder="Отчество" />
                            </div>
                          </td>
                          <td>
                            <div className="col">
                              <input type="email" value={editForm.email} onChange={editField('email')} required />
                              <textarea value={editForm.notes} onChange={editField('notes')} placeholder="Примечание" rows={2} />
                            </div>
                          </td>
                          <td className="muted">—</td>
                        </>
                      ) : (
                        <>
                          <td>
                            {fullName(g)}
                            {g.notes && (
                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{g.notes}</div>
                            )}
                          </td>
                          <td className="muted">{g.email}</td>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <span className="badge">Активные: {workloadByGenealogist[g.id]?.active ?? 0}</span>
                              <span className="badge needs_clarification">
                                Уточнения: {workloadByGenealogist[g.id]?.waiting ?? 0}
                              </span>
                              <span className="badge completed">
                                Завершены: {workloadByGenealogist[g.id]?.completed ?? 0}
                              </span>
                            </div>
                          </td>
                        </>
                      )}
                      <td>
                        <span className={`badge ${g.status.toLowerCase()}`}>
                          {USER_STATUS_LABEL[g.status] ?? g.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {editingId === g.id ? (
                          <>
                            <button className="sm" onClick={() => saveEdit(g.id)}>Сохранить</button>
                            <button className="outline sm" style={{ marginLeft: 6 }} onClick={() => setEditingId('')}>Отмена</button>
                          </>
                        ) : (
                          <>
                            <button className="outline sm" onClick={() => startEdit(g)}>Изменить</button>
                            <button className="outline sm" style={{ marginLeft: 6 }} onClick={() => toggleStatus(g)}>
                              {g.status === 'ACTIVE' ? 'Исключить' : 'Вернуть'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          )}

          {adminSection === 'TEMPLATES' && <TemplatesAdmin />}
        </div>
      )}
    </div>
  )
}

function TemplatesAdmin() {
  const [templates, setTemplates] = useState([])
  const [dictionary, setDictionary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState({ template_type: 'ALL', status_filter: 'ALL', search: '' })
  const [draft, setDraft] = useState(null)
  const [activeTab, setActiveTab] = useState('INFO')
  const [saving, setSaving] = useState(false)
  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [fieldFilter, setFieldFilter] = useState({ category: 'ALL', search: '' })
  const [customField, setCustomField] = useState({
    title: '',
    code: '',
    description: '',
    data_type: 'text',
    category: 'custom',
  })

  const scrollToTemplateEditor = () => {
    window.setTimeout(() => {
      document.getElementById('template-editor-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  const loadTemplates = async () => {
    setError('')
    const data = await api.listTemplates(filters)
    setTemplates(data)
  }

  const loadDictionary = async () => {
    const data = await api.listFieldDictionary()
    setDictionary(data)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([loadTemplates(), loadDictionary()])
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    loadTemplates().catch(err => setError(err.message))
  }, [filters.template_type, filters.status_filter])

  const dictionaryById = useMemo(
    () => Object.fromEntries(dictionary.map(field => [field.id, field])),
    [dictionary],
  )

  const availableFields = useMemo(() => {
    const selectedIds = new Set((draft?.fields ?? []).map(item => item.field_id))
    const search = fieldFilter.search.trim().toLowerCase()
    return dictionary.filter(field => {
      if (selectedIds.has(field.id)) return false
      if (fieldFilter.category !== 'ALL' && field.category !== fieldFilter.category) return false
      if (!search) return true
      return field.title.toLowerCase().includes(search) || field.code.toLowerCase().includes(search)
    })
  }, [dictionary, draft?.fields, fieldFilter])

  const selectedFields = useMemo(
    () => (draft?.fields ?? []).map(item => ({
      ...item,
      field: item.field ?? dictionaryById[item.field_id],
    })).filter(item => item.field),
    [dictionaryById, draft?.fields],
  )

  const fieldCodeMap = useMemo(
    () => Object.fromEntries(selectedFields.map(item => [item.field.code, item])),
    [selectedFields],
  )

  const startCreate = () => {
    setDraft(emptyTemplateDraft())
    setActiveTab('INFO')
    setShowFieldPicker(false)
    setError('')
    setMessage('')
    scrollToTemplateEditor()
  }

  const startEdit = async (templateId) => {
    setError('')
    setMessage('')
    try {
      const template = await api.getTemplate(templateId)
      setDraft(toTemplateDraft(template))
      setActiveTab('INFO')
      setShowFieldPicker(false)
      scrollToTemplateEditor()
    } catch (err) {
      setError(err.message)
    }
  }

  const saveDraft = async () => {
    const validationError = validateTemplateDraft(draft)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = toTemplatePayload(draft)
      const saved = draft.id
        ? await api.updateTemplate(draft.id, payload)
        : await api.createTemplate(payload)
      setDraft(toTemplateDraft(saved))
      await loadTemplates()
      setMessage(draft.id ? 'Шаблон сохранён.' : 'Шаблон создан.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const duplicateTemplate = async (templateId) => {
    setError('')
    setMessage('')
    try {
      const duplicated = await api.duplicateTemplate(templateId)
      await loadTemplates()
      setMessage('Копия шаблона создана и отключена для проверки.')
      setDraft(toTemplateDraft(duplicated))
      setActiveTab('INFO')
      setShowFieldPicker(false)
      scrollToTemplateEditor()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleTemplate = async (templateId) => {
    const template = templates.find(item => item.id === templateId)
    if (template?.is_active) {
      const confirmed = window.confirm(
        `Отключить шаблон «${template.name}»? Генеалог больше не увидит его при формировании архивного обращения.`,
      )
      if (!confirmed) return
    } else if (template && !window.confirm(`Включить шаблон «${template.name}»?`)) {
      return
    }
    setError('')
    setMessage('')
    try {
      const updated = await api.toggleTemplate(templateId)
      await loadTemplates()
      if (draft?.id === templateId) setDraft(toTemplateDraft(updated))
      setMessage(updated.is_active ? 'Шаблон включён.' : 'Шаблон отключён.')
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteTemplate = async (templateId) => {
    const template = templates.find(item => item.id === templateId)
    const name = template ? ` «${template.name}»` : ''
    if (!window.confirm(`Удалить шаблон${name}? Если он уже использовался, он будет скрыт и отключён.`)) return
    setError('')
    setMessage('')
    try {
      const result = await api.deleteTemplate(templateId)
      if (draft?.id === templateId) setDraft(null)
      await loadTemplates()
      setMessage(result?.soft_deleted
        ? 'Шаблон уже использовался, поэтому он отключён и скрыт.'
        : 'Шаблон удалён.')
    } catch (err) {
      setError(err.message)
    }
  }

  const updateDraft = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  const updateField = (index, patch) => {
    setDraft(prev => ({
      ...prev,
      fields: prev.fields.map((field, idx) => idx === index ? { ...field, ...patch } : field),
    }))
  }

  const updateBlock = (index, patch) => {
    setDraft(prev => ({
      ...prev,
      blocks: prev.blocks.map((block, idx) => idx === index ? { ...block, ...patch } : block),
    }))
  }

  const updateAttachment = (index, patch) => {
    setDraft(prev => ({
      ...prev,
      attachments: prev.attachments.map((item, idx) => idx === index ? { ...item, ...patch } : item),
    }))
  }

  const addFieldToDraft = (field) => {
    setDraft(prev => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          field_id: field.id,
          field,
          is_required: false,
          autofill_enabled: Boolean(field.autofill_source),
          is_visible_to_genealogist: true,
          sort_order: prev.fields.length,
          hint: '',
          default_value: '',
          editable_after_autofill: true,
        },
      ],
    }))
  }

  const createCustomField = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const created = await api.createFieldDictionary({
        ...customField,
        code: customField.code || null,
        description: customField.description || null,
      })
      setDictionary(prev => [...prev, created].sort((a, b) => a.title.localeCompare(b.title, 'ru')))
      addFieldToDraft(created)
      setCustomField({ title: '', code: '', description: '', data_type: 'text', category: 'custom' })
      setMessage('Пользовательское поле создано и добавлено в шаблон.')
    } catch (err) {
      setError(err.message)
    }
  }

  const moveItem = (collection, index, direction) => {
    setDraft(prev => {
      const list = [...prev[collection]]
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= list.length) return prev
      const current = list[index]
      list[index] = list[nextIndex]
      list[nextIndex] = current
      return {
        ...prev,
        [collection]: list.map((item, idx) => ({ ...item, sort_order: idx })),
      }
    })
  }

  const removeItem = (collection, index) => {
    setDraft(prev => ({
      ...prev,
      [collection]: prev[collection]
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sort_order: idx })),
    }))
  }

  const addBlock = () => {
    setDraft(prev => ({
      ...prev,
      blocks: [
        ...prev.blocks,
        {
          block_type: 'BODY',
          title: '',
          content: '',
          sort_order: prev.blocks.length,
          is_required: false,
          is_active: true,
        },
      ],
    }))
  }

  const addAttachment = () => {
    setDraft(prev => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        {
          title: '',
          description: '',
          is_required: false,
          sort_order: prev.attachments.length,
        },
      ],
    }))
  }

  const insertVariable = (blockIndex, code) => {
    setDraft(prev => ({
      ...prev,
      blocks: prev.blocks.map((block, idx) => {
        if (idx !== blockIndex) return block
        const separator = block.content && !block.content.endsWith(' ') ? ' ' : ''
        return { ...block, content: `${block.content}${separator}{{${code}}}` }
      }),
    }))
  }

  if (loading) return <p className="muted">Загрузка шаблонов...</p>

  return (
    <div className="col" style={{ gap: 18 }}>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <section className="card" style={{ order: draft ? 2 : 1 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2>Шаблоны архивных запросов</h2>
          <button className="sm" onClick={startCreate}>Создать шаблон</button>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <select
            value={filters.template_type}
            onChange={e => setFilters(prev => ({ ...prev, template_type: e.target.value }))}
          >
            <option value="ALL">Все типы</option>
            {TEMPLATE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filters.status_filter}
            onChange={e => setFilters(prev => ({ ...prev, status_filter: e.target.value }))}
          >
            <option value="ALL">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="DISABLED">Отключённые</option>
          </select>
          <input
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
            placeholder="Поиск по названию"
            style={{ minWidth: 220 }}
          />
          <button className="outline sm" onClick={() => loadTemplates().catch(err => setError(err.message))}>
            Найти
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="muted">Шаблоны не найдены.</p>
        ) : (
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Описание</th>
                <th>Поля</th>
                <th>Блоки</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Изменен</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(template => (
                <tr key={template.id}>
                  <td style={{ overflowWrap: 'anywhere' }}><strong>{template.name}</strong></td>
                  <td style={{ overflowWrap: 'anywhere' }}>{TEMPLATE_TYPE_LABEL[template.template_type] ?? template.template_type}</td>
                  <td className="muted" style={{ overflowWrap: 'anywhere' }}>{template.description || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{template.fields_count}</td>
                  <td style={{ textAlign: 'center' }}>{template.blocks_count}</td>
                  <td>
                        <span className={`badge ${template.is_active ? 'active' : 'blocked'}`}>
                      {template.is_active ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td>{formatDate(template.created_at)}</td>
                  <td>{formatDate(template.updated_at)}</td>
                  <td>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                        justifyContent: 'end',
                      }}
                    >
                      <button className="outline sm" style={{ width: '100%', paddingInline: 6 }} onClick={() => startEdit(template.id)}>Редактировать</button>
                      <button className="outline sm" style={{ width: '100%', paddingInline: 6 }} onClick={() => duplicateTemplate(template.id)}>
                        Дублировать
                      </button>
                      <button className="outline sm" style={{ width: '100%', paddingInline: 6 }} onClick={() => toggleTemplate(template.id)}>
                        {template.is_active ? 'Отключить' : 'Включить'}
                      </button>
                      <button className="danger sm" style={{ width: '100%', paddingInline: 6 }} onClick={() => deleteTemplate(template.id)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {draft && (
        <section id="template-editor-panel" className="card" style={{ order: 1 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>{draft.id ? 'Редактирование шаблона' : 'Создание шаблона'}</h2>
            <div className="row">
              <button className="outline sm" onClick={() => setDraft(null)}>Закрыть</button>
              <button className="sm" disabled={saving} onClick={saveDraft}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['INFO', 'Основное'],
              ['FIELDS', 'Поля'],
              ['BLOCKS', 'Блоки документа'],
              ['ATTACHMENTS', 'Приложения'],
              ['PREVIEW', 'Предпросмотр'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={activeTab === value ? 'sm' : 'outline sm'}
                onClick={() => setActiveTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'INFO' && (
            <div className="col">
              <label className="col">
                <span className="label">Название шаблона</span>
                <input value={draft.name} onChange={e => updateDraft('name', e.target.value)} />
              </label>
              <label className="col">
                <span className="label">Тип шаблона</span>
                <select value={draft.template_type} onChange={e => updateDraft('template_type', e.target.value)}>
                  {TEMPLATE_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="col">
                <span className="label">Описание</span>
                <textarea
                  value={draft.description}
                  onChange={e => updateDraft('description', e.target.value)}
                  rows={3}
                />
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={e => updateDraft('is_active', e.target.checked)}
                />
                <span>Шаблон активен</span>
              </label>
            </div>
          )}

          {activeTab === 'FIELDS' && (
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Поля шаблона</h3>
                <button className="sm" onClick={() => setShowFieldPicker(prev => !prev)}>
                  {showFieldPicker ? 'Скрыть справочник' : 'Добавить поле'}
                </button>
              </div>

              {showFieldPicker && (
                <div style={{ border: '1px solid #ddd4c0', borderRadius: 6, padding: 12 }}>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <input
                      value={fieldFilter.search}
                      onChange={e => setFieldFilter(prev => ({ ...prev, search: e.target.value }))}
                      placeholder="Поиск поля"
                    />
                    <select
                      value={fieldFilter.category}
                      onChange={e => setFieldFilter(prev => ({ ...prev, category: e.target.value }))}
                    >
                      <option value="ALL">Все категории</option>
                      {FIELD_CATEGORIES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col" style={{ maxHeight: 220, overflow: 'auto' }}>
                    {availableFields.map(field => (
                      <div key={field.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <strong>{field.title}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {field.code} · {FIELD_CATEGORY_LABEL[field.category]} · {FIELD_DATA_TYPE_LABEL[field.data_type]}
                          </div>
                        </div>
                        <button className="outline sm" onClick={() => addFieldToDraft(field)}>Добавить</button>
                      </div>
                    ))}
                    {availableFields.length === 0 && <p className="muted">Подходящих полей нет.</p>}
                  </div>

                  <hr />
                  <form className="col" onSubmit={createCustomField}>
                    <h3>Пользовательское поле</h3>
                    <div className="row">
                      <input
                        required
                        value={customField.title}
                        onChange={e => setCustomField(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Название поля"
                        style={{ flex: 1 }}
                      />
                      <input
                        value={customField.code}
                        onChange={e => setCustomField(prev => ({ ...prev, code: e.target.value }))}
                        placeholder="code, можно пустым"
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div className="row">
                      <select
                        value={customField.data_type}
                        onChange={e => setCustomField(prev => ({ ...prev, data_type: e.target.value }))}
                      >
                        {Object.entries(FIELD_DATA_TYPE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={customField.category}
                        onChange={e => setCustomField(prev => ({ ...prev, category: e.target.value }))}
                      >
                        {FIELD_CATEGORIES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={customField.description}
                      onChange={e => setCustomField(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      placeholder="Описание"
                    />
                    <div><button className="sm" type="submit">Создать и добавить</button></div>
                  </form>
                </div>
              )}

              {draft.fields.length === 0 ? (
                <p className="muted">В шаблон пока не добавлены поля.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Поле</th>
                      <th>Настройки</th>
                      <th>Подсказка / значение</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFields.map((item, index) => (
                      <tr key={item.field_id}>
                        <td>
                          <strong>{item.field.title}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {item.field.code} · {FIELD_CATEGORY_LABEL[item.field.category]}
                          </div>
                        </td>
                        <td>
                          <div className="col" style={{ gap: 4 }}>
                            <label><input type="checkbox" checked={item.is_required} onChange={e => updateField(index, { is_required: e.target.checked })} /> Обязательное</label>
                            <label><input type="checkbox" checked={item.autofill_enabled} onChange={e => updateField(index, { autofill_enabled: e.target.checked })} /> Автозаполнение</label>
                            <label><input type="checkbox" checked={item.is_visible_to_genealogist} onChange={e => updateField(index, { is_visible_to_genealogist: e.target.checked })} /> Показывать генеалогу</label>
                            <label><input type="checkbox" checked={item.editable_after_autofill} onChange={e => updateField(index, { editable_after_autofill: e.target.checked })} /> Редактируемое после автозаполнения</label>
                          </div>
                        </td>
                        <td>
                          <div className="col">
                            <input value={item.hint || ''} onChange={e => updateField(index, { hint: e.target.value })} placeholder="Подсказка" />
                            <input value={item.default_value || ''} onChange={e => updateField(index, { default_value: e.target.value })} placeholder="Значение по умолчанию" />
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="outline sm" onClick={() => moveItem('fields', index, -1)}>Выше</button>
                          <button className="outline sm" style={{ marginLeft: 6 }} onClick={() => moveItem('fields', index, 1)}>Ниже</button>
                          <button className="danger sm" style={{ marginLeft: 6 }} onClick={() => removeItem('fields', index)}>Удалить</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'BLOCKS' && (
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Блоки документа</h3>
                <button className="sm" onClick={addBlock}>Добавить блок</button>
              </div>

              {draft.blocks.map((block, index) => (
                <div key={index} style={{ border: '1px solid #ddd4c0', borderRadius: 6, padding: 12 }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <div className="col" style={{ flex: 1 }}>
                      <div className="row">
                        <select value={block.block_type} onChange={e => updateBlock(index, { block_type: e.target.value })}>
                          {BLOCK_TYPES.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(index, { title: e.target.value })}
                          placeholder="Название блока"
                          style={{ flex: 1 }}
                        />
                      </div>
                      <textarea
                        value={block.content}
                        onChange={e => updateBlock(index, { content: e.target.value })}
                        rows={7}
                        placeholder="Текст блока с переменными вида {{person_full_name}}"
                      />
                      <div className="row">
                        <label><input type="checkbox" checked={block.is_required} onChange={e => updateBlock(index, { is_required: e.target.checked })} /> Обязательный</label>
                        <label><input type="checkbox" checked={block.is_active} onChange={e => updateBlock(index, { is_active: e.target.checked })} /> Активен</label>
                      </div>
                    </div>
                    <div style={{ width: 260 }}>
                      <div className="label" style={{ marginBottom: 6 }}>Доступные переменные</div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {selectedFields.map(item => (
                          <button
                            key={item.field.code}
                            className="outline sm"
                            onClick={() => insertVariable(index, item.field.code)}
                            title={item.field.title}
                          >
                            {`{{${item.field.code}}}`}
                          </button>
                        ))}
                        {selectedFields.length === 0 && <span className="muted">Сначала добавьте поля.</span>}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="outline sm" onClick={() => moveItem('blocks', index, -1)}>Выше</button>
                    <button className="outline sm" onClick={() => moveItem('blocks', index, 1)}>Ниже</button>
                    <button className="danger sm" onClick={() => removeItem('blocks', index)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'ATTACHMENTS' && (
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Необходимые приложения</h3>
                <button className="sm" onClick={addAttachment}>Добавить приложение</button>
              </div>
              {draft.attachments.length === 0 && <p className="muted">Приложения не указаны.</p>}
              {draft.attachments.map((attachment, index) => (
                <div key={index} className="row">
                  <input
                    value={attachment.title}
                    onChange={e => updateAttachment(index, { title: e.target.value })}
                    placeholder="Название"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={attachment.description || ''}
                    onChange={e => updateAttachment(index, { description: e.target.value })}
                    placeholder="Описание"
                    style={{ flex: 1 }}
                  />
                  <label><input type="checkbox" checked={attachment.is_required} onChange={e => updateAttachment(index, { is_required: e.target.checked })} /> Обязательное</label>
                  <button className="outline sm" onClick={() => moveItem('attachments', index, -1)}>Выше</button>
                  <button className="outline sm" onClick={() => moveItem('attachments', index, 1)}>Ниже</button>
                  <button className="danger sm" onClick={() => removeItem('attachments', index)}>Удалить</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'PREVIEW' && (
            <TemplatePreview draft={draft} fieldCodeMap={fieldCodeMap} />
          )}
        </section>
      )}
    </div>
  )
}

function emptyTemplateDraft() {
  return {
    id: null,
    name: '',
    template_type: 'GENERAL_ARCHIVE',
    description: '',
    is_active: true,
    fields: [],
    blocks: [
      {
        block_type: 'BODY',
        title: 'Основной текст',
        content: '',
        sort_order: 0,
        is_required: true,
        is_active: true,
      },
    ],
    attachments: [],
  }
}

function toTemplateDraft(template) {
  return {
    id: template.id,
    name: template.name,
    template_type: template.template_type,
    description: template.description || '',
    is_active: template.is_active,
    fields: [...template.fields]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => ({
        field_id: item.field_id,
        field: item.field,
        is_required: item.is_required,
        autofill_enabled: item.autofill_enabled,
        is_visible_to_genealogist: item.is_visible_to_genealogist,
        sort_order: item.sort_order,
        hint: item.hint || '',
        default_value: item.default_value || '',
        editable_after_autofill: item.editable_after_autofill,
      })),
    blocks: [...template.blocks]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => ({
        id: item.id,
        block_type: item.block_type,
        title: item.title || '',
        content: item.content || '',
        sort_order: item.sort_order,
        is_required: item.is_required,
        is_active: item.is_active,
      })),
    attachments: [...template.attachments]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        is_required: item.is_required,
        sort_order: item.sort_order,
      })),
  }
}

function toTemplatePayload(draft) {
  return {
    name: draft.name,
    template_type: draft.template_type,
    description: draft.description || null,
    is_active: draft.is_active,
    fields: draft.fields.map((item, index) => ({
      field_id: item.field_id,
      is_required: item.is_required,
      autofill_enabled: item.autofill_enabled,
      is_visible_to_genealogist: item.is_visible_to_genealogist,
      sort_order: index,
      hint: item.hint || null,
      default_value: item.default_value || null,
      editable_after_autofill: item.editable_after_autofill,
    })),
    blocks: draft.blocks.map((item, index) => ({
      id: item.id,
      block_type: item.block_type,
      title: item.title || null,
      content: item.content || '',
      sort_order: index,
      is_required: item.is_required,
      is_active: item.is_active,
    })),
    attachments: draft.attachments.map((item, index) => ({
      id: item.id,
      title: item.title,
      description: item.description || null,
      is_required: item.is_required,
      sort_order: index,
    })),
  }
}

function validateTemplateDraft(draft) {
  if (!draft.name.trim()) return 'Укажите название шаблона.'
  if (!draft.template_type) return 'Выберите тип шаблона.'
  if (!draft.blocks.some(block => block.block_type === 'BODY' && block.is_active)) {
    return 'Добавьте хотя бы один активный блок основного текста.'
  }
  const fieldIds = draft.fields.map(item => item.field_id)
  if (fieldIds.length !== new Set(fieldIds).size) return 'В шаблоне есть повторяющиеся поля.'
  return ''
}

function TemplatePreview({ draft, fieldCodeMap }) {
  const activeBlocks = draft.blocks
    .filter(block => block.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="col" style={{ gap: 14 }}>
      <h3>Предпросмотр будущего документа</h3>
      <div style={{ background: '#fffdf8', border: '1px solid #d0c4b0', padding: 24, minHeight: 420 }}>
        {activeBlocks.map((block, index) => (
          <div key={index} style={previewBlockStyle(block.block_type)}>
            {block.title && block.block_type === 'CUSTOM_BLOCK' && <strong>{block.title}</strong>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{renderPreviewContent(block.content, fieldCodeMap)}</div>
          </div>
        ))}
        {draft.attachments.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <strong>Приложения:</strong>
            <ol style={{ marginTop: 6, paddingLeft: 20 }}>
              {draft.attachments
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((attachment, index) => (
                  <li key={index}>
                    {attachment.title}{attachment.is_required ? ' (обязательно)' : ''}
                  </li>
                ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

function renderPreviewContent(content, fieldCodeMap) {
  return (content || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, code) => {
    const item = fieldCodeMap[code]
    if (!item) return `[${code}]`
    return item.default_value || `[${item.field.title}]`
  })
}

function previewBlockStyle(blockType) {
  const base = { marginBottom: 16 }
  if (blockType === 'HEADER_RIGHT') return { ...base, textAlign: 'right' }
  if (blockType === 'HEADER_LEFT') return { ...base, textAlign: 'left' }
  if (blockType === 'TITLE') return { ...base, textAlign: 'center', fontWeight: 700, fontSize: 18 }
  if (blockType === 'FOOTER') return { ...base, marginTop: 24 }
  return base
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}
