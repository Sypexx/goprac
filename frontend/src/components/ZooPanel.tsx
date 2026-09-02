import { useCallback, useEffect, useState, useMemo } from 'react'
import type { User, TreeNode, Measure, ReportMeasurement } from '../types'
import { authHeaders } from '../types'

// ==================== Панель зоотехника ====================
export default function ZooPanel({ user }: { user: User }) {
  const [objects, setObjects] = useState<TreeNode[]>([])
  const [selectedObject, setSelectedObject] = useState<TreeNode | null>(null)
  const [measures, setMeasures] = useState<Measure[]>([])
  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null)
  const [measurements, setMeasurements] = useState<ReportMeasurement[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const headers = useMemo(() => authHeaders(user.token), [user.token])

  const loadObjects = useCallback(async () => {
    try {
      const res = await fetch('/api/objects', { headers })
      const data = await res.json()
      setObjects(Array.isArray(data) ? data : [])
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
      const data = await res.json()
      setMeasurements(Array.isArray(data) ? data : [])
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
        const list: Measure[] = Array.isArray(data) ? data : []
        setMeasures(list)
        if (list.length > 0) setSelectedMeasure(list[0].id)
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
              {o.name} ({o.object_type_name}{o.ear_tag ? `, ${o.ear_tag}` : ''})
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
