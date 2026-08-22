import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import SessionsList from './pages/SessionsList'
import SessionDetail from './pages/SessionDetail'
import Login from './pages/Login'
import RosterManager from './pages/RosterManager'
import AttendanceSheet from './pages/AttendanceSheet'
import ManageSessions from './pages/ManageSessions'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return null

  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Sessions</Link>
        <Link to="/attendance-sheet">Attendance Sheet</Link>
        {session && <Link to="/roster">Roster</Link>}
        {session && <Link to="/manage-sessions">Manage Sessions</Link>}
        <div className="spacer" />
        {session ? (
          <button onClick={() => supabase.auth.signOut()}>Log out</button>
        ) : (
          <Link to="/login">Admin Login</Link>
        )}
      </nav>
      <div className="container">
        <Routes>
          <Route path="/" element={<SessionsList />} />
          <Route path="/session" element={<SessionDetail />} />
          <Route path="/attendance-sheet" element={<AttendanceSheet />} />
          <Route path="/login" element={session ? <Navigate to="/roster" /> : <Login />} />
          <Route
            path="/roster"
            element={session ? <RosterManager /> : <Navigate to="/login" />}
          />
          <Route
            path="/manage-sessions"
            element={session ? <ManageSessions /> : <Navigate to="/login" />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
