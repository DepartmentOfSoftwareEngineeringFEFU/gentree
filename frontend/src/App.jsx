import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AuthPage from './pages/AuthPage'
import GenealogistDashboardPage from './pages/GenealogistDashboardPage'
import PersonPage from './pages/PersonPage'
import ProfilePage from './pages/ProfilePage'
import ProfilesPage from './pages/ProfilesPage'
import RequestDetailPage from './pages/RequestDetailPage'
import SettingsPage from './pages/SettingsPage'
import TreePage from './pages/TreePage'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const NOTIF_TYPE_LABEL = {
  REQUEST_ASSIGNED: 'Назначение запроса',
  REQUEST_STATUS_CHANGED: 'Статус запроса изменён',
  REQUEST_NEEDS_CLARIFICATION: 'Запрос уточнений',
  DOCUMENT_UPLOADED: 'Документ загружен',
  BOOK_READY: 'Книга готова',
  SYSTEM: 'Системное',
}

function AppHeader() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [unread, setUnread] = useState(0)
  const [notifs, setNotifs] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const loadUnread = useCallback(async () => {
    try { setUnread((await api.unreadCount()).count) } catch {}
  }, [])

  useEffect(() => {
    loadUnread()
    const t = setInterval(loadUnread, 30000)
    return () => clearInterval(t)
  }, [loadUnread])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const openPanel = async () => {
    if (!open) {
      try { setNotifs(await api.listNotifications()) } catch {}
    }
    setOpen(v => !v)
  }

  const markRead = async (id) => {
    try {
      await api.markRead(id)
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnread(prev => Math.max(0, prev - 1))
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await api.markAllRead()
      setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      setUnread(0)
    } catch {}
  }

  const userName = user
    ? ([user.last_name, user.first_name].filter(Boolean).join(' ') || user.email)
    : ''

  return (
    <header style={{
      height: 48, background: '#0a1f44', borderBottom: '1px solid #162e5e',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 24px', position: 'sticky', top: 0, zIndex: 100,
    }}>
      <span
        onClick={() => nav('/')}
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontWeight: 700,
          fontSize: 18,
          cursor: 'pointer',
          color: '#f5f0e1',
        }}
      >
        dinastia
      </span>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {/* Bell */}
        <div style={{ position: 'relative' }} ref={panelRef}>
          <button
            className="outline sm on-dark"
            onClick={openPanel}
            style={{ position: 'relative' }}
            title="Уведомления"
          >
            🔔
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#9b3030', color: '#fff', borderRadius: '50%',
                fontSize: 10, width: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700,
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: '#fdfaf4', border: '1px solid #ddd4c0', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,.1)', width: 340,
              maxHeight: 400, overflowY: 'auto', zIndex: 200,
            }}>
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid #ddd4c0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <strong style={{ fontSize: 14 }}>Уведомления</strong>
                {unread > 0 && (
                  <button className="outline sm" onClick={markAllRead}>
                    Прочитать все
                  </button>
                )}
              </div>
              {notifs.length === 0 ? (
                <p style={{ padding: 16, color: '#7a6e62', textAlign: 'center' }}>Нет уведомлений</p>
              ) : (
                notifs.map(n => (
                  <div
                    key={n.id}
                    onClick={() => !n.read_at && markRead(n.id)}
                    style={{
                      padding: '10px 16px', borderBottom: '1px solid #f0ece4',
                      background: n.read_at ? '#fdfaf4' : '#f0e8d8',
                      cursor: n.read_at ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    <div style={{ color: '#7a6e62', fontSize: 12, margin: '2px 0' }}>{n.body}</div>
                    <div style={{ color: '#c0b8aa', fontSize: 11 }}>
                      {NOTIF_TYPE_LABEL[n.notification_type] ?? n.notification_type}
                      {' · '}
                      {new Date(n.created_at).toLocaleString('ru')}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {user?.role === 'GENEALOGIST' && (
          <button className="outline sm on-dark" onClick={() => nav('/genealogist')}>
            Рабочий стол
          </button>
        )}
        {user?.role === 'ADMIN' && (
          <button className="outline sm on-dark" onClick={() => nav('/admin')}>
            Панель администратора
          </button>
        )}
        <button className="outline sm on-dark" onClick={() => nav('/settings')}>
          {userName || 'Настройки'}
        </button>
        <button className="outline sm on-dark" onClick={logout}>Выйти</button>
      </div>
    </header>
  )
}

function Guard({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/auth" replace />
}

function RoleHome() {
  const { user } = useAuth()
  if (!user) return <div className="page muted">Загрузка...</div>
  if (user.role === 'GENEALOGIST') return <Navigate to="/genealogist" replace />
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
  return <ProfilesPage />
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)

  const login = useCallback((t) => {
    setToken(t)
    localStorage.setItem('token', t)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }, [])

  useEffect(() => {
    if (!token) { setUser(null); return }
    api.me().then(setUser).catch(logout)
  }, [token, logout])

  return (
    <AuthCtx.Provider value={{ token, user, setUser, login, logout }}>
      <BrowserRouter>
        {token && <AppHeader />}
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<Guard><RoleHome /></Guard>} />
          <Route path="/genealogist" element={<Guard><GenealogistDashboardPage /></Guard>} />
          <Route path="/admin" element={<Guard><AdminDashboardPage /></Guard>} />
          <Route path="/profiles/:id" element={<Guard><ProfilePage /></Guard>} />
          <Route path="/profiles/:profileId/persons/:personId" element={<Guard><PersonPage /></Guard>} />
          <Route path="/profiles/:id/tree" element={<Guard><TreePage /></Guard>} />
          <Route path="/profiles/:profileId/requests/:requestId" element={<Guard><RequestDetailPage /></Guard>} />
          <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthCtx.Provider>
  )
}
