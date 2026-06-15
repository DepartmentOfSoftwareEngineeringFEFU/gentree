import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'

const BOOK_STATUS_LABEL = { PENDING: 'Ожидает', IN_PROGRESS: 'Формируется', SUCCEEDED: 'Готова', FAILED: 'Ошибка' }
const BOOK_STATUS_COLOR = { PENDING: '#f59e0b', IN_PROGRESS: '#6366f1', SUCCEEDED: '#16a34a', FAILED: '#ef4444' }

const SEX_LABEL = { MALE: 'М', FEMALE: 'Ж', UNKNOWN: '?' }
const SEX_OPT = ['MALE', 'FEMALE', 'UNKNOWN']
const STATUS_LABEL = {
  DRAFT: 'Подготовлен', PREPARED: 'Подготовлен', SENT: 'Направлен',
  IN_PROGRESS: 'В обработке', NEEDS_CLARIFICATION: 'Требуются доп. сведения',
  RESPONSE_RECEIVED: 'Получен ответ',
  COMPLETED: 'Завершён', CANCELLED: 'Отменён',
}
const REL_LABEL = { PARENT_CHILD: 'Родитель → Ребёнок', SPOUSE: 'Супруги', OTHER: 'Иная связь' }

const EMPTY_PERSON = { last_name: '', first_name: '', middle_name: '', sex: 'UNKNOWN',
  birth_date: '', death_date: '', birth_place: '', death_place: '', notes: '', is_living: true }
const EMPTY_REQ = { title: '', request_goal: '' }
const EMPTY_REL = { source_person_id: '', target_person_id: '', relationship_type: 'PARENT_CHILD', notes: '', layout_as: '' }

export default function ProfilePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [persons, setPersons] = useState([])
  const [requests, setRequests] = useState([])
  const [relationships, setRelationships] = useState([])
  const [books, setBooks] = useState([])
  const [bookLoading, setBookLoading] = useState(false)
  const [tab, setTab] = useState('persons')
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

  const fullName = (p) =>
    [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || '—'

  const personById = (pid) => persons.find(p => p.id === pid)

  const addPerson = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const { last_name, first_name, middle_name, sex, birth_date, death_date, birth_place, death_place, notes, is_living } = personForm
      const p = await api.createPerson(id, {
        last_name, first_name, middle_name: middle_name || null,
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
    try {
      const b = await api.createBook(id)
      setBooks(prev => [b, ...prev])
    } catch (err) { setError(err.message) }
    finally { setBookLoading(false) }
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
      <div className="row" style={{ marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 0 }}>
        {['persons', 'relationships', 'requests', ...(readOnly ? [] : ['book'])].map(t => (
          <button
            key={t}
            className="outline"
            style={{ borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent', borderRadius: '4px 4px 0 0' }}
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
              <div className="row">
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Пол</label>
                  <select value={personForm.sex} onChange={pf('sex')}>
                    {SEX_OPT.map(s => <option key={s} value={s}>{SEX_LABEL[s]} {s}</option>)}
                  </select>
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">Дата рождения</label>
                  <input type="date" value={personForm.birth_date} onChange={pf('birth_date')} />
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
                    <input type="date" value={personForm.death_date} onChange={pf('death_date')} />
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

          {persons.length === 0 ? (
            <p className="muted">Нет персон.</p>
          ) : (
            <table>
              <thead>
                <tr><th>ФИО</th><th>Пол</th><th>Дата рождения</th><th>Место рождения</th></tr>
              </thead>
              <tbody>
                {persons.map(p => (
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
          )}
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
                  <select value={relForm.source_person_id} onChange={rlf('source_person_id')} required>
                    <option value="">— выберите —</option>
                    {persons.map(p => (
                      <option key={p.id} value={p.id}>{fullName(p)}</option>
                    ))}
                  </select>
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <label className="label">
                    {relForm.relationship_type === 'PARENT_CHILD'
                      ? 'Ребёнок'
                      : relForm.layout_as === 'PARENT_CHILD'
                      ? 'Младший (пасынок, усыновлённый…)'
                      : 'Персона 2'}
                  </label>
                  <select value={relForm.target_person_id} onChange={rlf('target_person_id')} required>
                    <option value="">— выберите —</option>
                    {persons
                      .filter(p => p.id !== relForm.source_person_id)
                      .map(p => (
                        <option key={p.id} value={p.id}>{fullName(p)}</option>
                      ))}
                  </select>
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
                    </select>
                    <p className="muted" style={{ fontSize: 12 }}>
                      {relForm.layout_as === 'PARENT_CHILD' && 'Отчим, мачеха, приёмный родитель — цель встанет на уровень ниже источника.'}
                      {relForm.layout_as === 'SPOUSE' && 'Персоны выровняются на одном уровне.'}
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

          {relationships.length === 0 ? (
            <p className="muted">Нет связей.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Тип</th><th>Источник</th><th>Цель</th>{!readOnly && <th></th>}</tr>
              </thead>
              <tbody>
                {relationships.map(r => {
                  const src = personById(r.source_person_id)
                  const tgt = personById(r.target_person_id)
                  return (
                    <tr key={r.id}>
                      <td><span className="badge">{REL_LABEL[r.relationship_type] ?? r.relationship_type}</span></td>
                      <td>{src ? fullName(src) : r.source_person_id}</td>
                      <td>{tgt ? fullName(tgt) : r.target_person_id}</td>
                      {!readOnly && (
                        <td>
                          <button className="danger sm" onClick={() => deleteRelationship(r.id)}>×</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
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
              <button onClick={generateBook} disabled={bookLoading}>
                {bookLoading ? 'Создаётся...' : '+ Сформировать книгу'}
              </button>
            )}
          </div>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Система сформирует итоговый документ на основе данных профиля, персон и фактов.
          </p>
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
                    </td>
                    <td>{b.finished_at ? new Date(b.finished_at).toLocaleString('ru') : '—'}</td>
                    <td>
                      {b.status === 'SUCCEEDED' && b.document_id && (
                        <button className="outline sm" onClick={() => {
                          const token = localStorage.getItem('token')
                          fetch(`/api/v1/documents/${b.document_id}/download`, {
                            headers: { Authorization: `Bearer ${token}` }
                          }).then(r => r.blob()).then(blob => {
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url; a.download = `${profile.title}_книга.html`; a.click()
                            URL.revokeObjectURL(url)
                          })
                        }}>Скачать</button>
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
