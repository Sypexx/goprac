import { useCallback, useEffect, useState, useMemo } from 'react'
import type { User, AdminObject, AdminUser, SummaryStats, ObjectType } from '../types'
import { authHeaders } from '../types'

// ==================== Панель администратора ====================
export default function AdminPanel({ user }: { user: User }) {
  const [objects, setObjects] = useState<AdminObject[]>([])
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<SummaryStats | null>(null)
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

  const headers = useMemo(() => authHeaders(user.token), [user.token])

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

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

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
              <div className="form-grid">
                <div className="field">
                  <label>Тип объекта</label>
                  <select
                    value={newType}
                    onChange={(e) => { setNewType(e.target.value); setNewParent('') }}
                  >
                    <option value="">Выберите тип</option>
                    {objectTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {parentTypeID && (
                  <div className="field">
                    <label>
                      Входит в <span className="field-hint">({objectTypes.find((t) => t.id === parentTypeID)?.name})</span>
                    </label>
                    <select
                      value={newParent}
                      onChange={(e) => setNewParent(e.target.value)}
                    >
                      <option value="">
                        {parentCandidates.length > 0
                          ? '— выберите —'
                          : `нет доступных, сначала создайте`}
                      </option>
                      {parentCandidates.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="field">
                  <label>Название</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddObject()}
                    placeholder="Например: Коровник №3"
                  />
                </div>

                <div className="field">
                  <label>
                    Бирка <span className="field-hint">(необязательно, для животных)</span>
                  </label>
                  <input
                    value={newEarTag}
                    onChange={(e) => setNewEarTag(e.target.value)}
                    placeholder="Например: TAG-123"
                  />
                </div>
              </div>
              <div className="form-row">
                <button className="btn-success" onClick={handleAddObject}>Создать</button>
                <button onClick={() => setShowAddForm(false)}>Отмена</button>
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
    </div>
  )
}
