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

interface reportMeasurement {
  id: number
  measure_name: string
  value: number
  measured_at: string
  device_id: string
  author_name: string
}

interface adminObject {
  id: number
  object_type_id: number
  object_type_name: string
  name: string
  ear_tag: string
  is_active: boolean
  created_at: string
}

interface adminUser {
  id: number
  name: string
  role: string
  created_at: string
}

interface summaryStats {
  total_objects: number
  active_objects: number
  total_measurements: number
  today_measurements: number
}

interface reportMeasurement {
  id: number
  measure_name: string
  value: number
  measured_at: string
  device_id: string
  author_name: string
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
  const [objects, setObjects] = useState<adminObject[]>([])
  const [objectTypes, setObjectTypes] = useState<any[]>([])
  const [users, setUsers] = useState<adminUser[]>([])
  const [stats, setStats] = useState<summaryStats | null>(null)
  const [selectedType, setSelectedType] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newEarTag, setNewEarTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': user.token }

  const loadData = useCallback(async () => {
    try {
      const [objectsRes, typesRes, usersRes, statsRes] = await Promise.all([
        fetch(`/api/admin/objects${selectedType ? `?type_id=${selectedType}` : ''}`, { headers }),
        fetch('/api/object-types', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/reports/summary', { headers }),
      ])

      const objectsData = await objectsRes.json()
      const typesData = await typesRes.json()
      const usersData = await usersRes.json()
      const statsData = await statsRes.json()

      setObjects(Array.isArray(objectsData) ? objectsData : [])
      setObjectTypes(Array.isArray(typesData) ? typesData : [])
      setUsers(Array.isArray(usersData) ? usersData : [])
      setStats(statsData)
    } catch {
      setError('Ошибка загрузки данных')
    }
  }, [headers, selectedType])

  useEffect(() => { loadData() }, [loadData])

  const handleAddObject = async () => {
    if (!newName || !newType) {
      setError('Заполните имя и тип')
      return
    }

    try {
      const res = await fetch('/api/admin/objects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type_id: parseInt(newType),
          name: newName,
          ear_tag: newEarTag,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка создания')
      }

      setNotice(`Объект создан`)
      setNewName('')
      setNewEarTag('')
      setShowAddForm(false)
      loadData()
    } catch (err: any) {
      setError(err.message || 'Ошибка создания объекта')
    }
  }

  const handleArchive = async (id: number) => {
    if (!confirm('Архивировать объект?')) return

    try {
      const res = await fetch(`/api/admin/objects/${id}`, {
        method: 'DELETE',
        headers,
      })

      if (!res.ok) throw new Error('Ошибка архивирования')

      setNotice('Объект архивирован')
      loadData()
    } catch (err: any) {
      setError(err.message || 'Ошибка архивирования')
    }
  }

  return (
    <div className="panel">
      <h2>Панель администратора</h2>
      <p>Добро пожаловать, {user.username}!</p>

      {/* Статистика */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.total_objects || 0}</div>
          <div className="stat-label">Всего объектов</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.active_objects || 0}</div>
          <div className="stat-label">Активных</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.total_measurements || 0}</div>
          <div className="stat-label">Измерений</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.today_measurements || 0}</div>
          <div className="stat-label">Сегодня</div>
        </div>
      </div>

      {/* Фильтр по типу */}
      <div className="filter-bar">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="">Все типы</option>
          {objectTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Отмена' : '+ Добавить объект'}
        </button>
      </div>

      {/* Форма добавления */}
      {showAddForm && (
        <div className="add-form">
          <h3>Новый объект</h3>
          <div className="form-row">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              <option value="">Выберите тип</option>
              {objectTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Имя"
            />
            <input
              value={newEarTag}
              onChange={(e) => setNewEarTag(e.target.value)}
              placeholder="Бирка (опционально)"
            />
            <button className="btn-success" onClick={handleAddObject}>Создать</button>
          </div>
        </div>
      )}

      {/* Таблица объектов */}
      <table>
        <thead>
          <tr>
            <th>Имя</th>
            <th>Тип</th>
            <th>Бирка</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((o) => (
            <tr key={o.id}>
              <td>{o.name}</td>
              <td>{o.object_type_name}</td>
              <td>{o.ear_tag || '—'}</td>
              <td>
                <span className={`status-badge ${o.is_active ? 'active' : 'inactive'}`}>
                  {o.is_active ? 'Активен' : 'Архив'}
                </span>
              </td>
              <td>
                {!o.is_active && (
                  <button className="btn-danger btn-small" onClick={() => handleArchive(o.id)}>
                    Удалить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Таблица пользователей */}
      <h3>Пользователи</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Роль</th>
            <th>Создан</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.name}</td>
              <td>
                <span className={`role-badge ${u.role}`}>
                  {u.role === 'admin' ? 'Админ' : u.role === 'zoo' ? 'Зоотехник' : 'Пользователь'}
                </span>
              </td>
              <td>{u.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
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
  const [objects, setObjects] = useState<Animal[]>([])
  const [selectedObject, setSelectedObject] = useState<Animal | null>(null)
  const [measures, setMeasures] = useState<Measure[]>([])
  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null)
  const [measurements, setMeasurements] = useState<reportMeasurement[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': user.token }

  const loadObjects = useCallback(async () => {
    try {
      const res = await fetch('/api/objects?group_id=1', { headers })
      setObjects(await res.json())
    } catch {
      setError('Ошибка загрузки объектов')
    }
  }, [headers])

  useEffect(() => { loadObjects() }, [loadObjects])

  const loadMeasurements = useCallback(async () => {
    if (!selectedObject || !selectedMeasure) return

    try {
      const params = new URLSearchParams({
        object_id: selectedObject.id.toString(),
        measure_id: selectedMeasure.toString(),
      })
      if (from) params.append('from', from)
      if (to) params.append('to', to)

      const res = await fetch(`/api/reports/measurements?${params}`, { headers })
      setMeasurements(await res.json())
    } catch {
      setError('Ошибка загрузки измерений')
    }
  }, [headers, selectedObject, selectedMeasure, from, to])

  useEffect(() => { loadMeasurements() }, [loadMeasurements])

  // Загрузка показателей для выбранного объекта
  useEffect(() => {
    if (!selectedObject) {
      setMeasures([])
      setSelectedMeasure(null)
      setMeasurements([])
      return
    }

    fetch(`/api/measures?object_type_id=${selectedObject.object_type_id}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setMeasures(data)
        if (data.length > 0) setSelectedMeasure(data[0].id)
      })
      .catch(() => setError('Ошибка загрузки показателей'))
  }, [selectedObject, headers])

  return (
    <div className="panel">
      <h2>Панель зоотехника</h2>
      <p>Добро пожаловать, {user.username}!</p>

      {/* Выбор объекта */}
      <div className="form-group">
        <label>Объект</label>
        <select
          value={selectedObject?.id || ''}
          onChange={(e) => {
            const obj = objects.find(o => o.id === parseInt(e.target.value))
            setSelectedObject(obj || null)
          }}
        >
          <option value="">Выберите объект</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.ear_tag})
            </option>
          ))}
        </select>
      </div>

      {/* Выбор показателя */}
      {selectedObject && measures.length > 0 && (
        <div className="form-group">
          <label>Показатель</label>
          <select
            value={selectedMeasure || ''}
            onChange={(e) => setSelectedMeasure(Number(e.target.value))}
          >
            {measures.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Фильтр по периоду */}
      {selectedObject && (
        <div className="form-row">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="С"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="По"
          />
        </div>
      )}

      {/* Таблица измерений */}
      {selectedObject && measurements.length > 0 && (
        <>
          <h3>История измерений</h3>
          <table>
            <thead>
              <tr>
                <th>Значение</th>
                <th>Время</th>
                <th>Устройство</th>
                <th>Автор</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((v) => (
                <tr key={v.id}>
                  <td>{v.value} {measures.find(m => m.id === selectedMeasure)?.unit}</td>
                  <td>{new Date(v.measured_at).toLocaleString('ru-RU')}</td>
                  <td>{v.device_id}</td>
                  <td>{v.author_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {selectedObject && measurements.length === 0 && (
        <p>Измерений не найдено</p>
      )}

      {error && <p className="error">{error}</p>}
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

