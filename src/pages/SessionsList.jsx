import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SessionsList() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    // Get sessions, then a count of attendance per session
    const { data: sessionRows, error } = await supabase
      .from('sessions')
      .select('session_name, date, created_at')
      .order('date', { ascending: false })

    if (error) {
      setLoading(false)
      return
    }

    const withCounts = await Promise.all(
      sessionRows.map(async (s) => {
        const { count } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('session_name', s.session_name)
          .eq('date', s.date)
        return { ...s, count: count ?? 0 }
      })
    )

    setSessions(withCounts)
    setLoading(false)
  }

  return (
    <div>
      <h2>Sessions</h2>
      {loading ? (
        <p>Loading...</p>
      ) : sessions.length === 0 ? (
        <p>No sessions yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Date</th>
              <th>Scanned</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={`${s.session_name}-${s.date}`}>
                <td>
                  <Link
                    to={`/session?name=${encodeURIComponent(s.session_name)}&date=${s.date}`}
                  >
                    {s.session_name}
                  </Link>
                </td>
                <td>{s.date}</td>
                <td>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
