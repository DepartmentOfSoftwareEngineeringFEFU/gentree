import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'

export default function SettingsPage() {
  const nav = useNavigate()
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({
    last_name: '', first_name: '', middle_name: '',
    birth_date: '', birth_place: '', region: '', notes: '',
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setForm({
      last_name: user.last_name ?? '',
      first_name: user.first_name ?? '',
      middle_name: user.middle_name ?? '',
      birth_date: user.birth_date ?? '',
      birth_place: user.birth_place ?? '',
      region: user.region ?? '',
      notes: user.notes ?? '',
    })
  }, [user])

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    try {
      const updated = await api.updateMe({
        last_name: form.last_name || null,
        first_name: form.first_name || null,
        middle_name: form.middle_name || null,
        birth_date: form.birth_date || null,
        birth_place: form.birth_place || null,
        region: form.region || null,
        notes: form.notes || null,
      })
      setUser(updated)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <div className="settings-content">
        <div className="row" style={{ marginBottom: 20 }}>
          <span className="link" onClick={() => nav('/')}>← Исследования</span>
        </div>

        <h1 style={{ marginBottom: 20 }}>Настройки профиля</h1>

        <form onSubmit={submit} className="card col settings-form">
          <h3>Личные данные</h3>
          <div className="settings-form__grid settings-form__grid--name">
            <div className="col">
              <label className="label">Фамилия</label>
              <input value={form.last_name} onChange={f('last_name')} />
            </div>
            <div className="col">
              <label className="label">Имя</label>
              <input value={form.first_name} onChange={f('first_name')} />
            </div>
            <div className="col">
              <label className="label">Отчество</label>
              <input value={form.middle_name} onChange={f('middle_name')} />
            </div>
          </div>
          <div className="settings-form__grid settings-form__grid--birth">
            <div className="col">
              <label className="label">Дата рождения</label>
              <input type="date" value={form.birth_date} onChange={f('birth_date')} />
            </div>
            <div className="col">
              <label className="label">Место рождения</label>
              <input value={form.birth_place} onChange={f('birth_place')} />
            </div>
          </div>
          <div className="col">
            <label className="label">Регион происхождения</label>
            <input value={form.region} onChange={f('region')} />
          </div>
          <div className="col">
            <label className="label">Примечания</label>
            <textarea value={form.notes} onChange={f('notes')} rows={3} />
          </div>

          {error && <p className="error">{error}</p>}
          {saved && <p className="success">Сохранено.</p>}

          <div className="row">
            <button type="submit">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  )
}
