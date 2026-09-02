import { useEffect, useState } from 'react'
import type { User } from './types'
import LoginScreen from './components/LoginScreen'
import AdminPanel from './components/AdminPanel'
import UserPanel from './components/UserPanel'
import ZooPanel from './components/ZooPanel'

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
