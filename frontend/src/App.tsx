import { useCallback, useEffect, useState } from 'react'

interface Group {
  id: number
  group_type_id: number
  name: string
}

interface Animal {
  id: number
  object_type_id: number
  object_type_name: string
  name: string
  ear_tag: string
}

interface Measure {
  id: number
  name: string
  unit: string
  measure_type: string
}

interface MeasureValue {
  id: number
  measure_name: string
  unit: string
  value: number
  measured_at: string
  device_id: string
}

interface QueuedValue {
  client_uuid: string
  measure_id: number
  object_id: number
  value: number
  measured_at: string
  device_id: string
}

interface User {
  username: string
  role: 'admin' | 'user' | 'zoo'
  token: string
}

const QUEUE_KEY = 'offline_queue'

function loadQueue(): QueuedValue[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(q: QueuedValue[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

function genUUID(): string {
  return crypto.randomUUID()
}

// ==================== Экран логина ====================
function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка авторизации')
      }

      const data = await res.json()
      const token = res.headers.get('X-Auth-Token') || ''

      onLogin({ username: data.username, role: data.role, token })
    } catch (err: any) {
      setError(err.message || 'Не удалось войти')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <h1>Учёт коровников</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Логин</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin / user / zoo"
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary">Войти</button>
        </form>
        <div className="demo-credentials">
          <p>Тестовые аккаунты:</p>
          <ul>
            <li><code>admin</code> / <code>admin123</code></li>
            <li><code>user</code> / <code>user123</code></li>
            <li><code>zoo</code> / <code>zoo123</code></li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ==================== Панель администратора ====================
function AdminPanel({ user }: { user: User }) {
  return (
    <div className="panel">
      <h2>Панель администратора</h2>
      <p>Добро пожаловать, {user.username}!</p>
      <p>Здесь будет управление объектами, справочниками и пользователями.</p>
    </div>
  )
}

// ==================== Панель пользователя ====================
function UserPanel({ user }: { user: User }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null)
  const [measures, setMeasures] = useState<Measure[]>([])
  const [measureId, setMeasureId] = useState<number | null>(null)
  const [value, setValue] = useState('')
  const [values, setValues] = useState<MeasureValue[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueuedValue[]>(loadQueue())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': user.token }

  // Онлайн/оффлайн статус
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups', { headers })
      const data = await res.json()
      setGroups(data)
      if (data.length > 0) setSelectedGroup(data[0].id)
    } catch {
      setError('Нет связи с сервером')
    }
  }, [headers])

  useEffect(() => { loadGroups() }, [loadGroups])

  useEffect(() => {
    if (selectedGroup == null) return
    fetch(`/api/objects?group_id=${selectedGroup}`, { headers })
      .then((r) => r.json())
      .then(setAnimals)
      .catch(() => setError('Ошибка загрузки объектов'))
  }, [selectedGroup, headers])

  useEffect(() => {
    if (!selectedAnimal) { setMeasures([]); return }
    fetch(`/api/measures?object_type_id=${selectedAnimal.object_type_id}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setMeasures(data)
        if (data.length > 0) setMeasureId(data[0].id)
      })
      .catch(() => setError('Ошибка загрузки показателей'))
  }, [selectedAnimal, headers])

  const loadValues = useCallback(async () => {
    if (!selectedAnimal) { setValues([]); return }
    try {
      const res = await fetch(`/api/measure-values?object_id=${selectedAnimal.id}`, { headers })
      setValues(await res.json())
    } catch {
      // оффлайн
    }
  }, [selectedAnimal, headers])

  useEffect(() => { loadValues() }, [loadValues])

  const syncQueue = useCallback(async () => {
    const q = loadQueue()
    if (q.length === 0) return
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': user.token },
        body: JSON.stringify({ values: q }),
      })
      if (!res.ok) return
      const result = await res.json()
      saveQueue([])
      setQueue([])
      setNotice(`Синхронизировано: ${result.inserted} записей`)
      loadValues()
    } catch {
      // сеть пропала
    }
  }, [headers, loadValues, user.token])

  useEffect(() => {
    if (online) syncQueue()
  }, [online, syncQueue])

  const submitValue = async () => {
    if (!selectedAnimal || measureId == null || !value.trim()) return
    const num = parseFloat(value)
    if (isNaN(num)) {
      setError('Введите число')
      return
    }

    const entry: QueuedValue = {
      client_uuid: genUUID(),
      measure_id: measureId,
      object_id: selectedAnimal.id,
      value: num,
      measured_at: new Date().toISOString(),
      device_id: 'web-ui',
    }

    if (!online) {
      const q = [...loadQueue(), entry]
      saveQueue(q)
      setQueue(q)
      setValue('')
      setNotice('Запись сохранена локально')
      return
    }

    try {
      const res = await fetch('/api/measure-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': user.token },
        body: JSON.stringify(entry),
      })
      if (!res.ok) throw new Error(`Ошибка ${res.status}`)
      setValue('')
      setNotice(null)
      loadValues()
    } catch {
      const q = [...loadQueue(), entry]
      saveQueue(q)
      setQueue(q)
      setNotice('Запись в оффлайн-очереди')
    }
  }

  return (
    <div className="layout">
      <aside>
        <h2>Группы</h2>
        {groups.map((g) => (
          <div
            key={g.id}
            className={`group-item ${g.id === selectedGroup ? 'active' : ''}`}
            onClick={() => { setSelectedGroup(g.id); setSelectedAnimal(null) }}
          >
            {g.name}
          </div>
        ))}
      </aside>

      <main>
        <div className="statusbar">
          <span className={online ? 'online' : 'offline'}>
            {online ? '● Онлайн' : '● Оффлайн'}
          </span>
          {queue.length > 0 && <span className="queue">В очереди: {queue.length}</span>}
          {queue.length > 0 && online && (
            <button className="small" onClick={syncQueue}>Синхронизировать</button>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {!selectedAnimal && (
          <>
            <h1>Объекты</h1>
            {animals.length === 0 && <p>Пусто</p>}
            <table>
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Тип</th>
                  <th>Бирка</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.object_type_name}</td>
                    <td>{a.ear_tag}</td>
                    <td>
                      <button onClick={() => setSelectedAnimal(a)}>Открыть</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {selectedAnimal && (
          <>
            <button className="small" onClick={() => setSelectedAnimal(null)}>← Назад</button>
            <h1>{selectedAnimal.name} <span className="tag">{selectedAnimal.ear_tag}</span></h1>

            <div className="form">
              <select
                value={measureId ?? ''}
                onChange={(e) => setMeasureId(Number(e.target.value))}
              >
                {measures.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitValue()}
                placeholder="Значение"
                type="number"
                step="any"
              />
              <button onClick={submitValue}>Сохранить</button>
            </div>

            <h2>История измерений</h2>
            {values.length === 0 && <p>Измерений пока нет</p>}
            <table>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th>Значение</th>
                  <th>Время</th>
                  <th>Устройство</th>
                </tr>
              </thead>
              <tbody>
                {values.map((v) => (
                  <tr key={v.id}>
                    <td>{v.measure_name}</td>
                    <td>{v.value} {v.unit}</td>
                    <td>{new Date(v.measured_at).toLocaleString('ru-RU')}</td>
                    <td>{v.device_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </div>
  )
}

// ==================== Панель зоотехника ====================
function ZooPanel({ user }: { user: User }) {
  return (
    <div className="panel">
      <h2>Панель зоотехника</h2>
      <p>Добро пожаловать, {user.username}!</p>
      <p>Здесь будут отчёты и аналитика.</p>
    </div>
  )
}

// ==================== Основное приложение ====================
function App() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('auth_user')
    if (saved) {
      setUser(JSON.parse(saved))
    }
  }, [])

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser)
    localStorage.setItem('auth_user', JSON.stringify(loggedInUser))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('auth_user')
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="layout-with-header">
      <header className="header">
        <div className="header-left">
          <h1>Учёт коровников</h1>
        </div>
        <div className="header-right">
          <span className="role-badge">{user.role}</span>
          <span className="username">{user.username}</span>
          <button className="btn btn-small" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      <main className="main-content">
        {user.role === 'admin' && <AdminPanel user={user} />}
        {user.role === 'user' && <UserPanel user={user} />}
        {user.role === 'zoo' && <ZooPanel user={user} />}
      </main>
    </div>
  )
}

export default App

