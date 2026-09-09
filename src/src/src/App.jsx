import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Logged in! Redirecting...')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Signup successful! Check your email to confirm, then log in.')
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>GroWiz OTC</h1>
      <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: 10, marginBottom: 10 }}
        />
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Please wait...' : isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
      <p style={{ marginTop: 20, cursor: 'pointer', color: 'blue' }} onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
      </p>
    </div>
  )
}

function Dashboard({ session }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>GroWiz OTC Dashboard</h1>
      <p>Logged in as: {session.user.email}</p>
      <button onClick={handleLogout}>Log out</button>
      <p style={{ marginTop: 40 }}>Signal generator coming next.</p>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Dashboard session={session} /> : <Auth />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
