import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SessionDetail() {
  const [params] = useSearchParams()
  const sessionName = params.get('name')
  const date = params.get('date')

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [sessionName, date])

  async function load() {
    setLoading(true)
    // Join attendance_records with students to get names
    const { data, error } = await supabase
      .from('attendance_records')
      .select('student_id, scanned_at, is_manual, students(name, dept, year)')
      .eq('session_name', sessionName)
      .eq('date', date)
      .order('scanned_at', { ascending: true })

    if (!error) setEntries(data)
    setLoading(false)
  }

  return (
    <div>
      <Link to="/">&larr; Back to sessions</Link>
      <h2>{sessionName}</h2>
      <p style={{ color: '#666' }}>{date} &middot; {entries.length} scanned</p>

      {loading ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p>No one scanned in this session.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Dept</th>
              <th>Year</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{e.student_id}</td>
                <td>{e.students?.name ?? '—'}</td>
                <td>{e.students?.dept ?? '—'}</td>
                <td>{e.students?.year ?? '—'}</td>
                <td>
                  <span className={`badge ${e.is_manual ? 'manual' : 'auto'}`}>
                    {e.is_manual ? 'Manual' : 'Scanned'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
