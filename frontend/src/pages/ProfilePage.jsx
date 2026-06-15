import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'

const BOOK_STATUS_LABEL = { PENDING: 'Ожидает', IN_PROGRESS: 'Формируется', SUCCEEDED: 'Готова', FAILED: 'Ошибка' }
const BOOK_STATUS_COLOR = { PENDING: '#c2860a', IN_PROGRESS: '#7c5c3b', SUCCEEDED: '#16a34a', FAILED: '#9b3030' }
const BOOK_TONE_LABEL = {
  WARM: 'Тёплая семейная летопись',
  DOCUMENTARY: 'Документальное изложение',
  CONCISE: 'Краткий справочник',
}

const SEX_LABEL = { MALE: 'М', FEMALE: 'Ж', UNKNOWN: '?' }
const SEX_LABEL_FULL = { MALE: 'Мужской', FEMALE: 'Женский', UNKNOWN: 'Неизвестно' }
const SEX_OPT = ['MALE', 'FEMALE', 'UNKNOWN']
const STATUS_LABEL = {
  DRAFT: 'Подготовлен', PREPARED: 'Подготовлен', SENT: 'Направлен',
  IN_PROGRESS: 'В обработке', NEEDS_CLARIFICATION: 'Требуются доп. сведения',
  RESPONSE_RECEIVED: 'Получен ответ',
  COMPLETED: 'Завершён', CANCELLED: 'Отменён',
}
const REL_LABEL = { PARENT_CHILD: 'Родитель → Ребёнок', SPOUSE: 'Супруги', OTHER: 'Иная связь' }
const relationshipLabel = (relationship) =>
  relationship.relationship_type === 'OTHER' && relationship.layout_as === 'SIBLING'
    ? 'Братья / сёстры'
    : REL_LABEL[relationship.relationship_type] ?? relationship.relationship_type

const EMPTY_PERSON = { last_name: '', first_name: '', middle_name: '', sex: 'UNKNOWN',
  birth_date: '', death_date: '', birth_place: '', death_place: '', notes: '', is_living: true, maiden_name: '' }
const EMPTY_REQ = { title: '', request_goal: '', requested_archive_name: '' }
const EMPTY_REL = { source_person_id: '', target_person_id: '', relationship_type: 'PARENT_CHILD', notes: '', layout_as: '' }

const fullName = (p) =>
  [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || '—'


function PersonSelect({ persons, value, onChange, placeholder, exclude }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const selected = persons.find(p => p.id === value)
  const filtered = (exclude ? persons.filter(p => p.id !== exclude) : persons)
    .filter(p => fullName(p).toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={open ? query : (selected ? fullName(selected) : '')}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        placeholder={placeholder || '— поиск по имени —'}
        required={!value}
        style={{ width: '100%' }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fdfaf4', border: '1px solid #d0c4b0', borderRadius: 7,
          zIndex: 200, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}>
          {filtered.length === 0
            ? <div style={{ padding: '10px 12px', color: '#7a6e62', fontSize: 13 }}>Не найдено</div>
            : filtered.map(p => (
              <div
                key={p.id}
                onMouseDown={() => { onChange(p.id); setOpen(false); setQuery('') }}
                style={{
                  padding: '9px 12px', cursor: 'pointer', fontSize: 14,
                  background: p.id === value ? '#f0e8d8' : 'transparent',
                  borderBottom: '1px solid #f0ece4',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0e8d8'}
                onMouseLeave={e => e.currentTarget.style.background = p.id === value ? '#f0e8d8' : 'transparent'}
              >
                {fullName(p)}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = searchParams.get('tab') ?? 'persons'
  const personSearch = searchParams.get('pq') ?? ''
  const relSearch = searchParams.get('rq') ?? ''

  const setTab = (t) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    p.set('tab', t)
    return p
  })
  const setPersonSearch = (v) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (v) p.set('pq', v); else p.delete('pq')
    return p
  })
  const setRelSearch = (v) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (v) p.set('rq', v); else p.delete('rq')
    return p
  })
  const [profile, setProfile] = useState(null)
  const [persons, setPersons] = useState([])
  const [requests, setRequests] = useState([])
  const [relationships, setRelationships] = useState([])
  const [books, setBooks] = useState([])
  const [bookLoading, setBookLoading] = useState(false)
  const [bookOptions, setBookOptions] = useState({
    tone: 'WARM',
    include_unverified: true,
  })
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({})
  const [showPersonForm, setShowPersonForm] = useState(false)
  const [showReqForm, setShowReqForm] = useState(false)
  const [showRelForm, setShowRelForm] = useState(false)
  const [personForm, setPersonForm] = useState(EMPTY_PERSON)
  const [reqForm, setReqForm] = useState(EMPTY_REQ)
  const [relForm, setRelForm] = useState(EMPTY_REL)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getProfile(id).then(setProfile)
    api.listPersons(id).then(setPersons)
    api.listRequests(id).then(setRequests)
    api.listRelationships(id).then(setRelationships)
    api.listBooks(id).then(setBooks).catch(() => setBooks([]))
  }, [id])

  const hasActiveBooks = books.some(book =>
    book.status === 'PENDING' || book.status === 'IN_PROGRESS'
  )

  useEffect(() => {
    if (!hasActiveBooks) return undefined
    const timer = setInterval(() => {
      api.listBooks(id).then(setBooks).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [hasActiveBooks, id])

  const personById = (pid) => persons.find(p => p.id === pid)

  const addPerson = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { last_name, first_name, middle_name, maiden_name, sex, birth_date, death_date, birth_place, death_place, notes, is_living } = personForm
      const p = await api.createPerson(id, {
        last_name, first_name, middle_name: middle_name || null,
        maiden_name: maiden_name || null,
        sex, birth_date: birth_date || null, death_date: death_date || null,
        birth_place: birth_place || null, death_place: death_place || null,
        notes: notes || null, is_living,
      })
      setPersons(prev => [...prev, p])
      setShowPersonForm(false)
      setPersonForm(EMPTY_PERSON)
    } catch (err) { setError(err.message) }
  }

  const addRequest = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const r = await api.createRequest(id, {
        title: reqForm.title,
        request_goal: reqForm.request_goal || null,
      })
      setRequests(prev => [r, ...prev])
      setShowReqForm(false)
      setReqForm(EMPTY_REQ)
    } catch (err) { setError(err.message) }
  }

  const addRelationship = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const r = await api.createRelationship(id, {
        source_person_id: relForm.source_person_id,
        target_person_id: relForm.target_person_id,
        relationship_type: relForm.relationship_type,
        notes: relForm.notes || null,
        layout_as: relForm.layout_as || null,
      })
      setRelationships(prev => [...prev, r])
      setShowRelForm(false)
      setRelForm(EMPTY_REL)
    } catch (err) { setError(err.message) }
  }

  const deleteRelationship = async (relId) => {
    if (!confirm('Удалить связь?')) return
    await api.deleteRelationship(relId)
    setRelationships(prev => prev.filter(r => r.id !== relId))
  }

  const startEditProfile = () => {
    setProfileForm({ title: profile.title, description: profile.description ?? '', status: profile.status })
    setEditingProfile(true)
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const updated = await api.updateProfile(id, {
        title: profileForm.title || null,
        description: profileForm.description || null,
        status: profileForm.status,
      })
      setProfile(updated)
      setEditingProfile(false)
    } catch (err) { setError(err.message) }
  }

  const ppf = (k) => (e) => setProfileForm(f => ({ ...f, [k]: e.target.value }))

  const pf = (k) => (e) => setPersonForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const rf = (k) => (e) => setReqForm(f => ({ ...f, [k]: e.target.value }))
  const rlf = (k) => (e) => setRelForm(f => ({ ...f, [k]: e.target.value }))

  const generateBook = async () => {
    setBookLoading(true)
    setError('')
    try {
      const b = await api.createBook(id, bookOptions)
      setBooks(prev => [b, ...prev])
    } catch (err) { setError(err.message) }
    finally { setBookLoading(false) }
  }

  const getBookFile = async (book, preview = false) => {
    const previewWindow = preview ? window.open('', '_blank') : null
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/v1/documents/${book.document_id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Не удалось загрузить книгу.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      if (previewWindow) {
        previewWindow.location.href = url
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = `${profile.title}_книга.html`
        link.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      previewWindow?.close()
      setError(err.message)
    }
  }

  if (!profile) return <div className="page muted">Загрузка...</div>
  const readOnly = user?.role === 'GENEALOGIST'
  const returnTo = location.state?.returnTo
  const backPath = readOnly && returnTo ? returnTo : '/'
  const backLabel = readOnly && returnTo ? '← Назад' : '← Исследования'

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 4, justifyContent: 'space-between' }}>
        <span className="link" onClick={() => nav(backPath)}>{backLabel}</span>
        <button
          className="outline sm"
          onClick={() => nav(`/profiles/${id}/tree`, {
            state: returnTo
              ? { returnTo, treeBackTo: `/profiles/${id}` }
              : undefined,
          })}
        >
          🌳 Дерево
        </button>
      </div>

      <div className="row" style={{ marginBottom: editingProfile ? 8 : 20, marginTop: 8, justifyContent: 'space-between' }}>
        <h1>{profile.title}</h1>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${profile.status.toLowerCase()}`}>{STATUS_LABEL[profile.status] ?? profile.status}</span>
          {!readOnly && !editingProfile && <button className="outline sm" onClick={startEditProfile}>Изменить</button>}
        </div>
      </div>

      {editingProfile && (
        <form onSubmit={saveProfile} className="card col" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Редактирование профиля</h3>
          <div className="col">
            <label className="label">Название</label>
            <input value={profileForm.title} onChange={ppf('title')} required />
          </div>
          <div className="col">
            <label className="label">Описание</label>
            <textarea value={profileForm.description} onChange={ppf('description')} rows={2} />
          </div>
          <div className="col" style={{ maxWidth: 200 }}>
            <label className="label">Статус</label>
            <select value={profileForm.status} onChange={ppf('status')}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">Сохранить</button>
            <button type="button" className="outline" onClick={() => setEditingProfile(false)}>Отмена</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="row" style={{ marginBottom: 16, borderBottom: '1px solid #ddd4c0', paddingBottom: 0 }}>
        {['persons', 'relationships', 'requests', ...(readOnly ? [] : ['book'])].map(t => (
          <button
            key={t}
            className="outline"
            style={{ borderBottom: tab === t ? '2px solid #7c5c3b' : '2px solid transparent', borderRadius: '7px 7px 0 0', height: 36 }}
            onClick={() => setTab(t)}
          >
            {t === 'persons' && `Персоны (${persons.length})`}
            {t === 'relationships' && `Связи (${relationships.length})`}
            {t === 'requests' && `Запросы (${requests.length})`}
            {t === 'book' && 'Книга'}
          </button>
        ))}
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      {/* Persons tab */}
      {tab === 'persons' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>Персоны</h2>
            {!readOnly && (
              <button onClick={() => setShowPersonForm(!showPersonForm)}>
                {showPersonForm ? 'Отмена' : '+ Добавить'}
              </button>
            )}
          </div>

          {persons.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#c0b8aa', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13" y1="13" x2="18" y2="18" />
              </svg>
              <input
                placeholder="Поиск по имени, месту рождения..."
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 34, boxSizing: 'border-box' }}
              />
            </div>
          )}

          {!readOnly && showPersonForm && (
            <form onSubmit={addPerson} className="card col" style={{ marginBottom: 16 }}>
              <h3>Новая персона</h3>
              <div className="row">
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Фамилия *</label>
                  <input value={personForm.last_name} onChange={pf('last_name')} required />
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Имя *</label>
                  <input value={personForm.first_name} onChange={pf('first_name')} required />
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Отчество</label>
                  <input value={personForm.middle_name} onChange={pf('middle_name')} />
                </div>
              </div>
              {personForm.sex === 'FEMALE' && (
                <div className="col">
                  <label className="label">Девичья фамилия</label>
                  <input value={personForm.maiden_name} onChange={pf('maiden_name')} />
                </div>
              )}
              <div className="row">
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Пол</label>
                  <select value={personForm.sex} onChange={pf('sex')}>
                    {SEX_OPT.map(s => <option key={s} value={s}>{SEX_LABEL_FULL[s]}</option>)}
                  </select>
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Дата рождения</label>
                  <input value={personForm.birth_date} onChange={pf('birth_date')} type="date" />
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Место рождения</label>
                  <input value={personForm.birth_place} onChange={pf('birth_place')} />
                </div>
              </div>
              <div className="row">
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={personForm.is_living} onChange={pf('is_living')} style={{ width: 'auto' }} />
                  Живёт
                </label>
              </div>
              {!personForm.is_living && (
                <div className="row">
                  <div className="col" style={{ flex: 1 }}>
                    <label className="label">Дата смерти</label>
                    <input value={personForm.death_date} onChange={pf('death_date')} type="date" />
                  </div>
                  <div className="col" style={{ flex: 1 }}>
                    <label className="label">Место смерти</label>
                    <input value={personForm.death_place} onChange={pf('death_place')} />
                  </div>
                </div>
              )}
              <div className="col">
                <label className="label">Примечания</label>
                <textarea value={personForm.notes} onChange={pf('notes')} rows={2} />
              </div>
              <div className="row">
                <button type="submit">Сохранить</button>
                <button type="button" className="outline" onClick={() => setShowPersonForm(false)}>Отмена</button>
              </div>
            </form>
          )}

          {(() => {
            const q = personSearch.trim().toLowerCase()
            const filtered = q
              ? persons.filter(p =>
                  fullName(p).toLowerCase().includes(q) ||
                  (p.birth_place ?? '').toLowerCase().includes(q) ||
                  (p.birth_date ?? '').includes(q)
                )
              : persons
            if (persons.length === 0) return <p className="muted">Нет персон.</p>
            if (filtered.length === 0) return <p className="muted">Ничего не найдено.</p>
            return (
              <table>
                <thead>
                  <tr><th>ФИО</th><th>Пол</th><th>Дата рождения</th><th>Место рождения</th></tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }}
                      onClick={() => nav(`/profiles/${id}/persons/${p.id}`)}>
                      <td><strong>{fullName(p)}</strong></td>
                      <td>{SEX_LABEL[p.sex]}</td>
                      <td>{p.birth_date ?? '—'}</td>
                      <td>{p.birth_place ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </>
      )}

      {/* Relationships tab */}
      {tab === 'relationships' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>Родственные связи</h2>
            {!readOnly && (
              <button onClick={() => setShowRelForm(!showRelForm)} disabled={persons.length < 2}>
                {showRelForm ? 'Отмена' : '+ Добавить связь'}
              </button>
            )}
          </div>

          {!readOnly && persons.length < 2 && (
            <p className="muted" style={{ marginBottom: 12 }}>
              Добавьте минимум 2 персоны, чтобы создавать связи.
            </p>
          )}

          {!readOnly && showRelForm && (
            <form onSubmit={addRelationship} className="card col" style={{ marginBottom: 16 }}>
              <h3>Новая связь</h3>
              <div className="row">
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Тип связи</label>
                  <select value={relForm.relationship_type} onChange={rlf('relationship_type')}>
                    <option value="PARENT_CHILD">Родитель → Ребёнок</option>
                    <option value="SPOUSE">Супруги</option>
                    <option value="OTHER">Иная связь (отчим, крёстный, троюродный и др.)</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">
                    {relForm.relationship_type === 'PARENT_CHILD'
                      ? 'Родитель'
                      : relForm.layout_as === 'PARENT_CHILD'
                      ? 'Старший (отчим, усыновитель…)'
                      : 'Персона 1'}
                  </label>
                  <PersonSelect
                    persons={persons}
                    value={relForm.source_person_id}
                    onChange={id => setRelForm(f => ({ ...f, source_person_id: id }))}
                  />
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">
                    {relForm.relationship_type === 'PARENT_CHILD'
                      ? 'Ребёнок'
                      : relForm.layout_as === 'PARENT_CHILD'
                      ? 'Младший (пасынок, усыновлённый…)'
                      : 'Персона 2'}
                  </label>
                  <PersonSelect
                    persons={persons}
                    value={relForm.target_person_id}
                    onChange={id => setRelForm(f => ({ ...f, target_person_id: id }))}
                    exclude={relForm.source_person_id}
                  />
                </div>
              </div>
              {relForm.relationship_type === 'PARENT_CHILD' && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Братья/сёстры определяются автоматически через общего родителя. Максимум 2 родителя на персону.
                </p>
              )}
              {relForm.relationship_type === 'OTHER' && (
                <>
                  <div className="col">
                    <label className="label">Описание связи *</label>
                    <input
                      value={relForm.notes}
                      onChange={rlf('notes')}
                      placeholder="Например: отчим, крёстный отец, троюродный брат"
                      required
                    />
                  </div>
                  <div className="col">
                    <label className="label">Позиция в дереве</label>
                    <select value={relForm.layout_as} onChange={rlf('layout_as')}>
                      <option value="">Только пунктир (позиция не меняется)</option>
                      <option value="PARENT_CHILD">Как родитель → ребёнок (источник старше цели)</option>
                      <option value="SPOUSE">Как супруги (один уровень)</option>
                      <option value="SIBLING">Братья / сёстры (один уровень, родители неизвестны)</option>
                    </select>
                    <p className="muted" style={{ fontSize: 12 }}>
                      {relForm.layout_as === 'PARENT_CHILD' && 'Отчим, мачеха, приёмный родитель — цель встанет на уровень ниже источника.'}
                      {relForm.layout_as === 'SPOUSE' && 'Персоны выровняются на одном уровне.'}
                      {relForm.layout_as === 'SIBLING' && 'Персоны встанут рядом на одном поколении и соединятся пунктирной скобой без вымышленного родителя.'}
                      {!relForm.layout_as && 'Связь отобразится пунктиром между текущими позициями персон.'}
                    </p>
                  </div>
                </>
              )}
              <div className="row">
                <button type="submit">Сохранить</button>
                <button type="button" className="outline" onClick={() => setShowRelForm(false)}>Отмена</button>
              </div>
            </form>
          )}

          {relationships.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#c0b8aa', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13" y1="13" x2="18" y2="18" />
              </svg>
              <input
                placeholder="Поиск по имени или типу связи..."
                value={relSearch}
                onChange={e => setRelSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 34, boxSizing: 'border-box' }}
              />
            </div>
          )}

          {(() => {
            const q = relSearch.trim().toLowerCase()
            const filtered = q
              ? relationships.filter(r => {
                  const src = personById(r.source_person_id)
                  const tgt = personById(r.target_person_id)
                  return (
                    (src && fullName(src).toLowerCase().includes(q)) ||
                    (tgt && fullName(tgt).toLowerCase().includes(q)) ||
                    relationshipLabel(r).toLowerCase().includes(q) ||
                    (r.notes ?? '').toLowerCase().includes(q)
                  )
                })
              : relationships
            if (relationships.length === 0) return <p className="muted">Нет связей.</p>
            if (filtered.length === 0) return <p className="muted">Ничего не найдено.</p>
            return (
              <table>
                <thead>
                  <tr><th>Тип</th><th>Источник</th><th>Цель</th>{!readOnly && <th></th>}</tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const src = personById(r.source_person_id)
                    const tgt = personById(r.target_person_id)
                    return (
                      <tr key={r.id}>
                        <td><span className="badge">{relationshipLabel(r)}</span></td>
                        <td>{src ? fullName(src) : r.source_person_id}</td>
                        <td>{tgt ? fullName(tgt) : r.target_person_id}</td>
                        {!readOnly && (
                          <td>
                            <button
                              onClick={() => deleteRelationship(r.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 32, minWidth: 0, borderRadius: 7, border: 'none',
                                background: '#9b3030', color: '#fff', cursor: 'pointer', padding: 0,
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
        </>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>Архивные запросы</h2>
            {!readOnly && (
              <button onClick={() => setShowReqForm(!showReqForm)}>
                {showReqForm ? 'Отмена' : '+ Создать'}
              </button>
            )}
          </div>

          {!readOnly && showReqForm && (
            <form onSubmit={addRequest} className="card col" style={{ marginBottom: 16 }}>
              <h3>Новый запрос</h3>
              <div className="col">
                <label className="label">Название *</label>
                <input value={reqForm.title} onChange={rf('title')} required />
              </div>
              <div className="col">
                <label className="label">Цель запроса</label>
                <textarea value={reqForm.request_goal} onChange={rf('request_goal')} rows={2} />
              </div>
              <div className="row">
                <button type="submit">Создать</button>
                <button type="button" className="outline" onClick={() => setShowReqForm(false)}>Отмена</button>
              </div>
            </form>
          )}

          {requests.length === 0 ? (
            <p className="muted">Нет запросов.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Название</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }}
                    onClick={() => nav(`/profiles/${id}/requests/${r.id}`)}>
                    <td><strong>{r.title}</strong></td>
                    <td><span className={`badge ${r.current_status.toLowerCase()}`}>
                      {STATUS_LABEL[r.current_status] ?? r.current_status}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {/* Book tab */}
      {tab === 'book' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <h2>Генеалогическая книга</h2>
            {!readOnly && (
              <button onClick={generateBook} disabled={bookLoading || hasActiveBooks}>
                {bookLoading
                  ? 'Запускается...'
                  : hasActiveBooks
                    ? 'Книга формируется...'
                    : '+ Сформировать книгу'}
              </button>
            )}
          </div>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Нейросеть подготовит легко читаемую семейную летопись на основе персон,
            родственных связей и сохранённых фактов. Она не должна добавлять сведения,
            которых нет в исследовании.
          </p>
          <div className="card row" style={{
            marginBottom: 20,
            alignItems: 'flex-end',
            gap: 20,
            flexWrap: 'wrap',
          }}>
            <div className="col" style={{ minWidth: 260 }}>
              <label className="label">Стиль повествования</label>
              <select
                value={bookOptions.tone}
                onChange={event => setBookOptions(options => ({
                  ...options,
                  tone: event.target.value,
                }))}
              >
                {Object.entries(BOOK_TONE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              paddingBottom: 8,
            }}>
              <input
                type="checkbox"
                checked={bookOptions.include_unverified}
                onChange={event => setBookOptions(options => ({
                  ...options,
                  include_unverified: event.target.checked,
                }))}
                style={{ width: 'auto' }}
              />
              Включать гипотезы и непроверенные факты
            </label>
          </div>
          {hasActiveBooks && (
            <p style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 6,
              background: '#f0e8d8',
              color: '#7c5c3b',
              fontSize: 13,
            }}>
              Книга формируется в фоне. Статус обновляется автоматически.
            </p>
          )}
          {books.length === 0 ? (
            <p className="muted">Книги ещё не формировались.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Дата запроса</th><th>Статус</th><th>Завершено</th><th></th></tr>
              </thead>
              <tbody>
                {books.map(b => (
                  <tr key={b.id}>
                    <td>{new Date(b.created_at).toLocaleString('ru')}</td>
                    <td>
                      <span style={{ color: BOOK_STATUS_COLOR[b.status], fontWeight: 600 }}>
                        {BOOK_STATUS_LABEL[b.status] ?? b.status}
                      </span>
                      {b.status === 'FAILED' && b.error_message && (
                        <div className="error" style={{ marginTop: 4, maxWidth: 420, fontSize: 11 }}>
                          {b.error_message}
                        </div>
                      )}
                    </td>
                    <td>{b.finished_at ? new Date(b.finished_at).toLocaleString('ru') : '—'}</td>
                    <td>
                      {b.status === 'SUCCEEDED' && b.document_id && (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="outline sm" onClick={() => getBookFile(b, true)}>
                            Открыть
                          </button>
                          <button className="outline sm" onClick={() => getBookFile(b)}>
                            Скачать
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
