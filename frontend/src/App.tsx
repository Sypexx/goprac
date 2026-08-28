import { useState } from 'react'

function App() {
  const [data, setData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/hello')
      const json = await res.json()
      setData(json.message)
    } catch (e) {
      setData('Ошибка подключения к API')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>Vite + Go</h1>
      <p>Простой шаблон с React + TypeScript на фронте и Go на бэке</p>
      <button onClick={fetchData} disabled={loading}>
        {loading ? 'Загрузка...' : 'Позвать Go API'}
      </button>
      {data && <p>Ответ: {data}</p>}
    </div>
  )
}

export default App
