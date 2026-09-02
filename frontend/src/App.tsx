import { useCallback, useEffect, useState, useMemo } from 'react'

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
  parent_id: number | null
  parent_name: string
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
  // crypto.randomUUID доступен только в secure-контексте (HTTPS/localhost),
  // поэтому для работы по сети используем fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 version 4 через crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Последний fallback для совсем старых браузеров
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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
  const [measures, setMeasures] = useState<any[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [showMeasureForm, setShowMeasureForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newParent, setNewParent] = useState('')
  const [newEarTag, setNewEarTag] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [newMeasureName, setNewMeasureName] = useState('')
  const [newMeasureUnit, setNewMeasureUnit] = useState('')
  const [newMeasureType, setNewMeasureType] = useState('instant')
  const [selectedTypes, setSelectedTypes] = useState<number[]>([])
  const [tab, setTab] = useState<'objects' | 'users' | 'measures'>('objects')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Auth-Token': user.token }), [user.token])

  const loadData = useCallback(async () => {
    try {
      const [objectsRes, typesRes, usersRes, statsRes, measuresRes] = await Promise.all([
        fetch('/api/admin/objects', { headers }),
        fetch('/api/object-types', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/reports/summary', { headers }),
        fetch('/api/admin/measures', { headers }),
      ])

      const objectsData = await objectsRes.json()
      const typesData = await typesRes.json()
      const usersData = await usersRes.json()
      const statsData = await statsRes.json()
      const measuresData = await measuresRes.json()

      setObjects(Array.isArray(objectsData) ? objectsData : [])
      setObjectTypes(Array.isArray(typesData) ? typesData : [])
      setUsers(Array.isArray(usersData) ? usersData : [])
      setStats(statsData)
      setMeasures(Array.isArray(measuresData) ? measuresData : [])
    } catch {
      setError('Ошибка загрузки данных')
    }
  }, [headers])

  useEffect(() => { loadData() }, [loadData])

  // Объекты после применения фильтра по типу (на клиенте)
  const visibleObjects = selectedType
    ? objects.filter((o) => String(o.object_type_id) === selectedType)
    : objects

  // Родительский тип выбранного типа (для каскадного выбора)
  const selectedTypeObj = objectTypes.find((t) => String(t.id) === newType)
  const parentTypeID = selectedTypeObj?.parent_id ?? null
  const parentCandidates = parentTypeID
    ? objects.filter((o) => o.object_type_id === parentTypeID && o.is_active)
    : []

  const handleAddObject = async () => {
    if (!newName || !newType) {
      setError('Заполните имя и тип')
      return
    }
    // Если у типа есть родительский тип — родитель обязателен
    if (parentTypeID && parentCandidates.length > 0 && !newParent) {
      setError('Выберите родительский объект')
      return
    }

    try {
      const res = await fetch('/api/admin/objects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type_id: parseInt(newType),
          parent_id: newParent ? parseInt(newParent) : null,
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
      setNewParent('')
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

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) {
      setError('Заполните логин и пароль')
      return
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка создания')
      }

      setNotice(`Пользователь ${newUsername} создан`)
      setNewUsername('')
      setNewPassword('')
      setShowUserForm(false)
      loadData()
    } catch (err: any) {
      setError(err.message || 'Ошибка создания пользователя')
    }
  }

  const handleCreateMeasure = async () => {
    if (!newMeasureName) {
      setError('Введите название показателя')
      return
    }

    try {
      const res = await fetch('/api/admin/measures', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newMeasureName,
          unit: newMeasureUnit,
          measure_type: newMeasureType,
          type_ids: selectedTypes,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка создания')
      }

      setNotice(`Показатель "${newMeasureName}" создан`)
      setNewMeasureName('')
      setNewMeasureUnit('')
      setNewMeasureType('instant')
      setSelectedTypes([])
      setShowMeasureForm(false)
      loadData()
    } catch (err: any) {
      setError(err.message || 'Ошибка создания показателя')
    }
  }

  const toggleTypeSelection = (typeId: number) => {
    setSelectedTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    )
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

      {/* Вкладки */}
      <div className="tabs">
        <button className={`tab ${tab === 'objects' ? 'active' : ''}`} onClick={() => setTab('objects')}>
          Объекты ({objects.length})
        </button>
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Пользователи ({users.length})
        </button>
        <button className={`tab ${tab === 'measures' ? 'active' : ''}`} onClick={() => setTab('measures')}>
          Показатели ({measures.length})
        </button>
      </div>

      {/* ===== Вкладка: Объекты ===== */}
      {tab === 'objects' && (
        <>
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
               onChange={(e) => { setNewType(e.target.value); setNewParent('') }}
             >
               <option value="">Выберите тип</option>
               {objectTypes.map((t) => (
                 <option key={t.id} value={t.id}>{t.name}</option>
               ))}
             </select>
             {parentTypeID && (
               <select
                 value={newParent}
                 onChange={(e) => setNewParent(e.target.value)}
               >
                 <option value="">
                   {parentCandidates.length > 0
                     ? `Входит в (${parentCandidates.length > 0 ? objectTypes.find((t) => t.id === parentTypeID)?.name : ''})`
                     : `Нет объектов типа "${objectTypes.find((t) => t.id === parentTypeID)?.name}" — сначала создайте`}
                 </option>
                 {parentCandidates.map((p) => (
                   <option key={p.id} value={p.id}>{p.name}</option>
                 ))}
               </select>
             )}
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
            <th>Входит в</th>
            <th>Бирка</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {visibleObjects.map((o) => (
            <tr key={o.id}>
              <td>{o.name}</td>
              <td>{o.object_type_name}</td>
              <td>{o.parent_name || '—'}</td>
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
        </>
      )}

      {/* ===== Вкладка: Пользователи ===== */}
      {tab === 'users' && (
        <>
          <div className="filter-bar">
            <button onClick={() => setShowUserForm(!showUserForm)}>
              {showUserForm ? 'Отмена' : '+ Добавить пользователя'}
            </button>
          </div>

          {/* Форма добавления пользователя */}
          {showUserForm && (
            <div className="add-form">
              <h3>Новый пользователь</h3>
              <div className="form-row">
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Логин"
                />
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Пароль"
                  type="password"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Админ</option>
                  <option value="zoo">Зоотехник</option>
                </select>
                <button className="btn-success" onClick={handleCreateUser}>Создать</button>
              </div>
            </div>
          )}

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
        </>
      )}

      {/* ===== Вкладка: Показатели ===== */}
      {tab === 'measures' && (
        <>
          <div className="filter-bar">
            <button onClick={() => setShowMeasureForm(!showMeasureForm)}>
              {showMeasureForm ? 'Отмена' : '+ Добавить показатель'}
            </button>
          </div>

          {/* Форма добавления показателя */}
          {showMeasureForm && (
            <div className="add-form">
              <h3>Новый показатель</h3>
              <div className="form-row">
                <input
                  value={newMeasureName}
                  onChange={(e) => setNewMeasureName(e.target.value)}
                  placeholder="Название (например: Рост)"
                />
                <input
                  value={newMeasureUnit}
                  onChange={(e) => setNewMeasureUnit(e.target.value)}
                  placeholder="Единица (например: см)"
                />
                <select
                  value={newMeasureType}
                  onChange={(e) => setNewMeasureType(e.target.value)}
                >
                  <option value="instant">Мгновенное значение</option>
                  <option value="balance">Накопительное</option>
                </select>
              </div>
              <div className="form-row" style={{marginTop: '8px'}}>
                <span style={{fontSize: '14px', marginRight: '8px'}}>Применить к типам:</span>
                {objectTypes.map((t) => (
                  <label key={t.id} style={{marginRight: '12px', fontSize: '14px'}}>
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(t.id)}
                      onChange={() => toggleTypeSelection(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <div className="form-row" style={{marginTop: '8px'}}>
                <button className="btn-success" onClick={handleCreateMeasure}>Создать</button>
              </div>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Тип данных</th>
                <th>Единица</th>
                <th>Тип</th>
              </tr>
            </thead>
            <tbody>
              {measures.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  <td>{m.name}</td>
                  <td>{m.data_type}</td>
                  <td>{m.unit || '—'}</td>
                  <td>{m.measure_type === 'instant' ? 'Мгновенный' : 'Накопительный'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  )
}

// ==================== Панель пользователя ====================
interface TreeNode extends Animal {
  parent_id: number | null
  parent_name: string
}

function UserPanel({ user }: { user: User }) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [measures, setMeasures] = useState<Measure[]>([])
  const [measureId, setMeasureId] = useState<number | null>(null)
  const [value, setValue] = useState('')
  const [values, setValues] = useState<MeasureValue[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueuedValue[]>(loadQueue())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Auth-Token': user.token }), [user.token])

  const selected = nodes.find((n) => n.id === selectedId) || null
  const childrenOf = useMemo(() => {
    const map = new Map<number | null, TreeNode[]>()
    for (const n of nodes) {
      const key = n.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(n)
    }
    return map
  }, [nodes])

  // Хлебные крошки: путь от корня до выбранного объекта
  const breadcrumb = useMemo(() => {
    const path: TreeNode[] = []
    let cur = selected
    while (cur) {
      path.unshift(cur)
      cur = cur.parent_id ? nodes.find((n) => n.id === cur!.parent_id) || null : null
    }
    return path
  }, [selected, nodes])

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

  // Загрузка всего дерева объектов
  const loadTree = useCallback(async () => {
    try {
      const res = await fetch('/api/objects', { headers })
      const data = await res.json()
      const list: TreeNode[] = Array.isArray(data) ? data : []
      setNodes(list)
      // Раскрываем корневые узлы (организации)
      setExpanded(new Set(list.filter((n) => n.parent_id == null).map((n) => n.id)))
    } catch {
      setError('Нет связи с сервером')
    }
  }, [headers])

  useEffect(() => { loadTree() }, [loadTree])

  // Показатели для выбранного объекта
  useEffect(() => {
    if (!selected) { setMeasures([]); setMeasureId(null); return }
    fetch(`/api/measures?object_type_id=${selected.object_type_id}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const list: Measure[] = Array.isArray(data) ? data : []
        setMeasures(list)
        setMeasureId(list.length > 0 ? list[0].id : null)
      })
      .catch(() => setError('Ошибка загрузки показателей'))
  }, [selected, headers])

  const loadValues = useCallback(async () => {
    if (!selected) { setValues([]); return }
    try {
      const res = await fetch(`/api/measure-values?object_id=${selected.id}`, { headers })
      const data = await res.json()
      setValues(Array.isArray(data) ? data : [])
    } catch {
      // оффлайн
    }
  }, [selected, headers])

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
    if (!selected || measureId == null || !value.trim()) return
    const num = parseFloat(value)
    if (isNaN(num)) {
      setError('Введите число')
      return
    }

    const entry: QueuedValue = {
      client_uuid: genUUID(),
      measure_id: measureId,
      object_id: selected.id,
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
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Ошибка ${res.status}`)
      }

      setValue('')
      setNotice('✅ Показатель сохранён')
      loadValues()
    } catch (err: any) {
      setError('❌ Ошибка: ' + (err.message || 'неизвестная ошибка'))
      const q = [...loadQueue(), entry]
      saveQueue(q)
      setQueue(q)
    }
  }

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Рекурсивный узел дерева
  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const kids = childrenOf.get(node.id) || []
    const isOpen = expanded.has(node.id)
    const isSelected = node.id === selectedId
    return (
      <div key={node.id}>
        <div
          className={`tree-item ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => { setSelectedId(node.id); setNotice(null); setError(null) }}
        >
          {kids.length > 0 ? (
            <span
              className="tree-arrow"
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
            >
              {isOpen ? '▾' : '▸'}
            </span>
          ) : (
            <span className="tree-arrow">·</span>
          )}
          <span className="tree-name">{node.name}</span>
          {node.ear_tag && <span className="tag">{node.ear_tag}</span>}
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  const kids = selected ? childrenOf.get(selected.id) || [] : []

  return (
    <div className="layout">
      <aside className="tree-sidebar">
        <h2>Организации</h2>
        {(childrenOf.get(null) || []).map((n) => renderNode(n, 0))}
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

        {!selected && (
          <>
            <h1>Выберите объект</h1>
            <p className="hint">Слева — дерево организаций. Раскрывайте узлы и выбирайте коровник или животное.</p>
          </>
        )}

        {selected && (
          <>
            {/* Хлебные крошки */}
            <div className="breadcrumb">
              {breadcrumb.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && <span className="crumb-sep"> / </span>}
                  <span
                    className={`crumb ${b.id === selected.id ? 'current' : 'link'}`}
                    onClick={() => b.id !== selected.id && setSelectedId(b.id)}
                  >
                    {b.name}
                  </span>
                </span>
              ))}
            </div>

            <h1>
              {selected.name}
              <span className="type-chip">{selected.object_type_name}</span>
              {selected.ear_tag && <span className="tag">{selected.ear_tag}</span>}
            </h1>

            {/* Ввод измерения */}
            {measures.length > 0 ? (
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
            ) : (
              <p className="hint">Для этого объекта нет показателей</p>
            )}

            {/* Дочерние объекты */}
            {kids.length > 0 && (
              <>
                <h2>Содержит ({kids.length})</h2>
                <div className="child-grid">
                  {kids.map((k) => (
                    <div key={k.id} className="child-card" onClick={() => setSelectedId(k.id)}>
                      <div className="child-name">{k.name}</div>
                      <div className="child-meta">{k.object_type_name}{k.ear_tag ? ` · ${k.ear_tag}` : ''}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* История измерений */}
            <h2>История измерений</h2>
            {values.length === 0 && <p className="hint">Измерений пока нет</p>}
            {values.length > 0 && (
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
            )}
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

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Auth-Token': user.token }), [user.token])

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

