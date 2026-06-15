import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import PhotoCropModal from '../components/PhotoCropModal'
import { useAuth } from '../App'

const FACT_TYPES = ['BIRTH','DEATH','MARRIAGE','RESIDENCE','SERVICE','NOTE']
const FACT_LABELS = { BIRTH:'Рождение', DEATH:'Смерть', MARRIAGE:'Брак', RESIDENCE:'Проживание', SERVICE:'Служба', NOTE:'Заметка' }
const CONF_LABELS = { UNVERIFIED:'Не проверено', HYPOTHESIS:'Гипотеза', PROBABLE:'Вероятно', CONFIRMED:'Подтверждено' }
const CONF_OPT = ['UNVERIFIED','HYPOTHESIS','PROBABLE','CONFIRMED']
const SEX_LABEL = { MALE: 'Мужской', FEMALE: 'Женский', UNKNOWN: 'Неизвестно' }

const EMPTY_FACT = { fact_type: 'NOTE', fact_date: '', place: '', value_text: '', confidence: 'UNVERIFIED' }
const SEX_OPTS = ['MALE', 'FEMALE', 'UNKNOWN']
const SEX_LABELS_EDIT = { MALE: 'Мужской', FEMALE: 'Женский', UNKNOWN: 'Неизвестно' }

export default function PersonPage() {
  const { profileId, personId } = useParams()
  const nav = useNavigate()
  const { state } = useLocation()
  const fromTree = state?.from === 'tree'
  const { user } = useAuth()
  const [person, setPerson] = useState(null)
  const [facts, setFacts] = useState([])
  const [docs, setDocs] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FACT)
  const [editingFactId, setEditingFactId] = useState(null)
  const [editFactForm, setEditFactForm] = useState({})
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    api.getPerson(personId).then(setPerson)
    api.listFacts(personId).then(setFacts)
    api.listDocsByPerson(personId).then(setDocs).catch(() => {})
  }, [personId])

  const startEdit = () => {
    setEditForm({
      last_name:   person.last_name   ?? '',
      first_name:  person.first_name  ?? '',
      middle_name: person.middle_name ?? '',
      maiden_name: person.maiden_name ?? '',
      sex:         person.sex         ?? 'UNKNOWN',
      birth_date:  person.birth_date  ?? '',
      death_date:  person.death_date  ?? '',
      birth_place: person.birth_place ?? '',
      death_place: person.death_place ?? '',
      notes:       person.notes       ?? '',
      is_living:   person.is_living   ?? true,
    })
    setEditError('')
    setEditing(true)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setEditError('')
    try {
      const payload = {
        last_name:   editForm.last_name   || null,
        first_name:  editForm.first_name  || null,
        middle_name: editForm.middle_name || null,
        maiden_name: editForm.maiden_name || null,
        sex:         editForm.sex,
        birth_date:  editForm.birth_date  || null,
        death_date:  editForm.death_date  || null,
        birth_place: editForm.birth_place || null,
        death_place: editForm.death_place || null,
        notes:       editForm.notes       || null,
        is_living:   editForm.is_living,
      }
      const updated = await api.updatePerson(personId, payload)
      setPerson(updated)
      setEditing(false)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ef = (k) => (e) => setEditForm(f => ({ ...f, [k]: e.target.value }))

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    e.target.value = ''
  }

  const handleCropSave = async (blob) => {
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    await api.uploadPersonPhoto(personId, blob)
    const fresh = await api.getPerson(personId)
    setPerson(fresh)
  }

  const handleDeletePhoto = async (e) => {
    e.stopPropagation()
    if (!confirm('Удалить фото?')) return
    const updated = await api.deletePersonPhoto(personId)
    setPerson(updated)
  }

  const fullName = (p) =>
    [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || '—'

const addFact = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const f = await api.createFact(personId, {
        fact_type: form.fact_type,
        fact_date: form.fact_date || null,
        place: form.place || null,
        value_text: form.value_text || null,
        confidence: form.confidence,
      })
      setFacts(prev => [...prev, f])
      setShowForm(false)
      setForm(EMPTY_FACT)
    } catch (err) { setError(err.message) }
  }

  const deleteFact = async (id) => {
    if (!confirm('Удалить факт?')) return
    await api.deleteFact(id)
    setFacts(prev => prev.filter(f => f.id !== id))
  }

  const startEditFact = (fact) => {
    setEditingFactId(fact.id)
    setEditFactForm({
      fact_type: fact.fact_type,
      fact_date: fact.fact_date ?? '',
      place: fact.place ?? '',
      value_text: fact.value_text ?? '',
      confidence: fact.confidence,
    })
  }

  const saveEditFact = async (e) => {
    e.preventDefault()
    try {
      const updated = await api.updateFact(editingFactId, {
        fact_type: editFactForm.fact_type,
        fact_date: editFactForm.fact_date || null,
        place: editFactForm.place || null,
        value_text: editFactForm.value_text || null,
        confidence: editFactForm.confidence,
      })
      setFacts(prev => prev.map(f => f.id === editingFactId ? updated : f))
      setEditingFactId(null)
    } catch (err) { setError(err.message) }
  }

  const eff = (k) => (e) => setEditFactForm(f => ({ ...f, [k]: e.target.value }))

  const ff = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  if (!person) return <div className="page muted">Загрузка...</div>
  const readOnly = user?.role === 'GENEALOGIST'

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="link" onClick={() => nav(-1)}>{fromTree ? '← Дерево' : '← Профиль'}</span>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        {/* Circular photo */}
        <div style={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            title="Нажмите, чтобы изменить фото"
            style={{
              width: 80, height: 80, borderRadius: '50%',
              backgroundColor: '#e8ddd0',
              backgroundImage: person.photo_url ? `url(${person.photo_url})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              border: person.photo_url ? '2px solid #ddd4c0' : '2px dashed #c0b8aa',
              overflow: 'hidden',
            }}
          >
            {!person.photo_url && <span style={{ fontSize: 28, color: '#9ca3af' }}>+</span>}
          </div>
          {person.photo_url && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              title="Удалить фото"
              style={{
                position: 'absolute', top: 0, right: 0,
                width: 22, height: 22, minWidth: 0, borderRadius: '50%',
                background: '#9b3030', color: '#fff',
                border: '2px solid #fdfaf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0,
              }}
            >
              <svg width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
              </svg>
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{fullName(person)}</h1>
            <div className="row" style={{ gap: 8, flexShrink: 0 }}>
              {!readOnly && !editing && <button className="outline sm" onClick={startEdit}>Редактировать</button>}
              {!readOnly && (
                <button className="danger sm" onClick={async () => {
                  if (!confirm('Удалить персону?')) return
                  await api.deletePerson(personId)
                  nav(`/profiles/${profileId}`)
                }}>Удалить персону</button>
              )}
            </div>
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            {SEX_LABEL[person.sex]}
            {person.birth_date && ` · р. ${person.birth_date}`}
            {person.death_date && ` · ум. ${person.death_date}`}
            {person.birth_place && ` · ${person.birth_place}`}
          </p>
        </div>
      </div>

      {cropSrc && (
        <PhotoCropModal
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null) }}
        />
      )}

      {!readOnly && editing && (
        <form onSubmit={saveEdit} className="card col" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Редактирование персоны</h3>
          <div className="row">
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Фамилия</label>
              <input value={editForm.last_name} onChange={ef('last_name')} />
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Имя</label>
              <input value={editForm.first_name} onChange={ef('first_name')} />
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Отчество</label>
              <input value={editForm.middle_name} onChange={ef('middle_name')} />
            </div>
          </div>
          {editForm.sex === 'FEMALE' && (
            <div className="col">
              <label className="label">Девичья фамилия</label>
              <input value={editForm.maiden_name} onChange={ef('maiden_name')} />
            </div>
          )}
          <div className="row">
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Пол</label>
              <select value={editForm.sex} onChange={ef('sex')}>
                {SEX_OPTS.map(s => <option key={s} value={s}>{SEX_LABELS_EDIT[s]}</option>)}
              </select>
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Дата рождения</label>
              <input value={editForm.birth_date} onChange={ef('birth_date')} type="date" />
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Место рождения</label>
              <input value={editForm.birth_place} onChange={ef('birth_place')} />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="is_living"
              checked={editForm.is_living}
              onChange={e => setEditForm(f => ({ ...f, is_living: e.target.checked }))} />
            <label htmlFor="is_living" style={{ fontSize: 13 }}>Ещё жив</label>
          </div>
          {!editForm.is_living && (
            <div className="row">
              <div className="col" style={{ flex: 1 }}>
                <label className="label">Дата смерти</label>
                <input value={editForm.death_date} onChange={ef('death_date')} type="date" />
              </div>
              <div className="col" style={{ flex: 1 }}>
                <label className="label">Место смерти</label>
                <input value={editForm.death_place} onChange={ef('death_place')} />
              </div>
            </div>
          )}
          <div className="col">
            <label className="label">Примечания</label>
            <textarea value={editForm.notes} onChange={ef('notes')} rows={2} />
          </div>
          {editError && <p className="error">{editError}</p>}
          <div className="row">
            <button type="submit" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
            <button type="button" className="outline" onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </form>
      )}

      <hr />

      <div className="row" style={{ justifyContent: 'space-between', margin: '16px 0 12px' }}>
        <h2>Факты</h2>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Отмена' : '+ Добавить факт'}
          </button>
        )}
      </div>

      {error && <p className="error" style={{ marginBottom: 8 }}>{error}</p>}

      {!readOnly && showForm && (
        <form onSubmit={addFact} className="card col" style={{ marginBottom: 16 }}>
          <div className="row">
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Тип</label>
              <select value={form.fact_type} onChange={ff('fact_type')}>
                {FACT_TYPES.map(t => <option key={t} value={t}>{FACT_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Дата</label>
              <input type="date" value={form.fact_date} onChange={ff('fact_date')} />
            </div>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">Место</label>
              <input value={form.place} onChange={ff('place')} />
            </div>
          </div>
          <div className="col">
            <label className="label">Описание</label>
            <textarea value={form.value_text} onChange={ff('value_text')} rows={2} />
          </div>
          <div className="col" style={{ maxWidth: 200 }}>
            <label className="label">Достоверность</label>
            <select value={form.confidence} onChange={ff('confidence')}>
              {CONF_OPT.map(c => <option key={c} value={c}>{CONF_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="row">
            <button type="submit">Сохранить</button>
            <button type="button" className="outline" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      {facts.length === 0 ? (
        <p className="muted">Нет фактов.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Тип</th><th>Дата</th><th>Место</th><th>Описание</th><th>Достоверность</th>{!readOnly && <th></th>}</tr>
          </thead>
          <tbody>
            {facts.map(f => !readOnly && editingFactId === f.id ? (
              <tr key={f.id}>
                <td>
                  <select value={editFactForm.fact_type} onChange={eff('fact_type')} style={{ fontSize: 12 }}>
                    {FACT_TYPES.map(t => <option key={t} value={t}>{FACT_LABELS[t]}</option>)}
                  </select>
                </td>
                <td><input type="date" value={editFactForm.fact_date} onChange={eff('fact_date')} style={{ fontSize: 12, width: 130 }} /></td>
                <td><input value={editFactForm.place} onChange={eff('place')} style={{ fontSize: 12 }} /></td>
                <td><input value={editFactForm.value_text} onChange={eff('value_text')} style={{ fontSize: 12 }} /></td>
                <td>
                  <select value={editFactForm.confidence} onChange={eff('confidence')} style={{ fontSize: 12 }}>
                    {CONF_OPT.map(c => <option key={c} value={c}>{CONF_LABELS[c]}</option>)}
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="sm" onClick={saveEditFact} style={{ marginRight: 4 }}>✓</button>
                  <button className="outline sm" onClick={() => setEditingFactId(null)}>✕</button>
                </td>
              </tr>
            ) : (
              <tr key={f.id}>
                <td><strong>{FACT_LABELS[f.fact_type]}</strong></td>
                <td>{f.fact_date ?? '—'}</td>
                <td>{f.place ?? '—'}</td>
                <td>{f.value_text ?? '—'}</td>
                <td><span className="badge">{CONF_LABELS[f.confidence]}</span></td>
                {!readOnly && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="outline sm" onClick={() => startEditFact(f)} style={{ marginRight: 4 }}>✎</button>
                    <button className="danger sm" onClick={() => deleteFact(f.id)}>×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {docs.length > 0 && (
        <>
          <hr />
          <h2 style={{ margin: '16px 0 10px' }}>Документы</h2>
          <table>
            <thead>
              <tr><th>Файл</th><th>Тип</th><th>Размер</th><th></th></tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td>{d.file_name}</td>
                  <td className="muted">{d.mime_type}</td>
                  <td className="muted">{(d.file_size_bytes / 1024).toFixed(1)} KB</td>
                  <td>
                    <button className="outline sm" onClick={() => {
                      const token = localStorage.getItem('token')
                      fetch(`/api/v1/documents/${d.id}/download`, {
                        headers: { Authorization: `Bearer ${token}` }
                      }).then(r => r.blob()).then(blob => {
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = d.file_name; a.click()
                        URL.revokeObjectURL(url)
                      })
                    }}>Скачать</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
