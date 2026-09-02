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

// Оффлайн-очередь: записи ждут в localStorage, пока не появится связь
interface QueuedValue {
  client_uuid: string
  measure_id: number
  object_id: number
  value: number
  measured_at: string
  device_id: string
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

function App() {
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
      const res = await fetch('/api/groups')
      const data = await res.json()
      setGroups(data)
      if (data.length > 0) setSelectedGroup(data[0].id)
    } catch {
      setError('Нет связи с сервером')
    }
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  // Животные выбранной группы
  useEffect(() => {
    if (selectedGroup == null) return
    fetch(`/api/objects?group_id=${selectedGroup}`)
      .then((r) => r.json())
      .then(setAnimals)
      .catch(() => setError('Ошибка загрузки объектов'))
  }, [selectedGroup])

  // Показатели для типа объекта
  useEffect(() => {
    if (!selectedAnimal) { setMeasures([]); return }
    fetch(`/api/measures?object_type_id=${selectedAnimal.object_type_id}`)
      .then((r) => r.json())
      .then((data) => {
        setMeasures(data)
        if (data.length > 0) setMeasureId(data[0].id)
      })
      .catch(() => setError('Ошибка загрузки показателей'))
  }, [selectedAnimal])

  // Значения выбранного объекта
  const loadValues = useCallback(async () => {
    if (!selectedAnimal) { setValues([]); return }
    try {
      const res = await fetch(`/api/measure-values?object_id=${selectedAnimal.id}`)
      setValues(await res.json())
    } catch {
      // оффлайн — просто не обновляем
    }
  }, [selectedAnimal])

  useEffect(() => { loadValues() }, [loadValues])

  // Автосинхронизация очереди при появлении сети
  const syncQueue = useCallback(async () => {
    const q = loadQueue()
    if (q.length === 0) return
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: q }),
      })
      if (!res.ok) return
      const result = await res.json()
      saveQueue([])
      setQueue([])
      setNotice(`Синхронизировано: ${result.inserted} записей${result.skipped ? `, пропущено дублей: ${result.skipped}` : ''}`)
      loadValues()
    } catch {
      // сеть пропала — очередь остаётся
    }
  }, [loadValues])

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
      // Оффлайн: кладём в очередь
      const q = [...loadQueue(), entry]
      saveQueue(q)
      setQueue(q)
      setValue('')
      setNotice('Запись сохранена локально, отправится при появлении сети')
      return
    }

    try {
      const res = await fetch('/api/measure-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!res.ok) throw new Error(`Ошибка ${res.status}`)
      setValue('')
      setNotice(null)
      loadValues()
    } catch {
      // Сервер недоступен — в очередь
      const q = [...loadQueue(), entry]
      saveQueue(q)
      setQueue(q)
      setNotice('Сервер недоступен, запись в оффлайн-очереди')
    }
  }

  return (
    <div className="layout">
      {/* Сайдбар: группы */}
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

        {/* Список животных */}
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

        {/* Карточка объекта: ввод измерения + история */}
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

export default App
