import { useCallback, useEffect, useState, useMemo } from 'react'
import type { User, Measure, MeasureValue, QueuedValue, TreeNode } from '../types'
import { authHeaders } from '../types'
import { loadQueue, saveQueue, genUUID } from '../utils'

// ==================== Панель пользователя ====================
export default function UserPanel({ user }: { user: User }) {
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

  const headers = useMemo(() => authHeaders(user.token), [user.token])

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
        headers,
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
  }, [headers, loadValues])

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
        headers,
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
