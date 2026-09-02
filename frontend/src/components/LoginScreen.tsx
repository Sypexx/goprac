import { useState } from 'react'
import type { User } from '../types'

// ==================== Экран логина ====================
export default function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
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
