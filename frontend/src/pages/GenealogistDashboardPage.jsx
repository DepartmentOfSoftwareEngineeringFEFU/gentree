import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
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

const FILTERS = [
  { key: 'active', label: 'Активные', statuses: ['PREPARED', 'SENT', 'IN_PROGRESS', 'RESPONSE_RECEIVED'] },
  { key: 'clarification', label: 'Ожидают пользователя', statuses: ['NEEDS_CLARIFICATION'] },
  { key: 'completed', label: 'Завершённые', statuses: ['COMPLETED'] },
  { key: 'all', label: 'Все', statuses: null },
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

export default function GenealogistDashboardPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('active')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || user.role !== 'GENEALOGIST') return

    setLoading(true)
    setError('')
    api.myAssignedRequests()
      .then(setRequests)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [user])

  const activeCount = useMemo(
    () => requests.filter(req => !['COMPLETED', 'CANCELLED'].includes(req.current_status)).length,
    [requests],
  )
  const clarificationCount = useMemo(
    () => requests.filter(req => req.current_status === 'NEEDS_CLARIFICATION').length,
    [requests],
  )
  const visibleRequests = useMemo(() => {
    const selected = FILTERS.find(item => item.key === filter)
    if (!selected?.statuses) return requests
    return requests.filter(req => selected.statuses.includes(req.current_status))
  }, [filter, requests])

  if (!user) return <div className="page muted">Загрузка...</div>
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
  if (user.role !== 'GENEALOGIST') return <Navigate to="/" replace />

  return (
    <div className="page wide">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Рабочий стол генеалога</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Архивные запросы, назначенные вам для обработки
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {clarificationCount > 0 && <span className="badge needs_clarification">{clarificationCount}</span>}
          <span className="badge">{activeCount}</span>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <p className="muted">Загрузка...</p>
      ) : requests.length === 0 ? (
        <p className="muted">Назначенных архивных запросов нет.</p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            {FILTERS.map(item => {
              const count = item.statuses
                ? requests.filter(req => item.statuses.includes(req.current_status)).length
                : requests.length
              return (
                <button
                  key={item.key}
                  className={filter === item.key ? 'sm' : 'outline sm'}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label} ({count})
                </button>
              )
            })}
          </div>

          {visibleRequests.length === 0 ? (
            <p className="muted">По выбранному фильтру запросов нет.</p>
          ) : (
            <section className="card">
              <table>
                <thead>
                  <tr>
                    <th>Запрос</th>
                    <th>Статус</th>
                    <th>Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map(req => (
                    <tr
                      key={req.id}
                      onClick={() => nav(`/profiles/${req.profile_id}/requests/${req.id}`)}
                      style={{
                        cursor: 'pointer',
                        background: req.current_status === 'NEEDS_CLARIFICATION' ? '#fff7ed' : undefined,
                      }}
                    >
                      <td>
                        <strong>{req.title}</strong>
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
                      <td className="muted">{formatDate(req.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}
