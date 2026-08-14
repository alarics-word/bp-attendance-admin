import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SessionDetail() {
  const [params] = useSearchParams()
  const sessionName = params.get('name')
  const date = params.get('date')

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ id_number: '', name: '', dept: '', year: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session))
  }, [])

  useEffect(() => {
    load()
  }, [sessionName, date])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('attendance_records')
      .select('student_id, scanned_at, is_manual, students(name, dept, year)')
      .eq('session_name', sessionName)
      .eq('date', date)
      .order('scanned_at', { ascending: true })

    if (!error) setEntries(data)
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    if (!form.id_number || !form.name) {
      setError('ID and name are required.')
      return
    }

    setSaving(true)

    // Make sure the student exists in the roster (add them if not,
    // e.g. someone who forgot their ID and doesn't have a barcode
    // on file yet). Won't overwrite an existing student's info.
    const { data: existing } = await supabase
      .from('students')
      .select('id_number')
      .eq('id_number', form.id_number)
      .maybeSingle()

    if (!existing) {
      const { error: studentError } = await supabase.from('students').insert({
        id_number: form.id_number,
        name: form.name,
        dept: form.dept,
        year: form.year,
      })
      if (studentError) {
        setError(studentError.message)
        setSaving(false)
        return
      }
    }

    // Make sure the session row exists (in case this session was
    // never synced from a taker's phone for some reason)
    await supabase
      .from('sessions')
      .upsert({ session_name: sessionName, date }, { onConflict: 'session_name,date' })

    const { error: attendanceError } = await supabase.from('attendance_records').insert({
      session_name: sessionName,
      date,
      student_id: form.id_number,
      is_manual: true,
    })

    setSaving(false)

    if (attendanceError) {
      setError(attendanceError.message)
      return
    }

    setForm({ id_number: '', name: '', dept: '', year: '' })
    setShowAddForm(false)
    load()
  }

  async function handleDelete(studentId) {
    if (!confirm(`Remove ${studentId} from this session's attendance?`)) return
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('session_name', sessionName)
      .eq('date', date)
      .eq('student_id', studentId)
    if (error) {
      alert(error.message)
      return
    }
    load()
  }

  return (
    <div>
      <Link to="/">&larr; Back to sessions</Link>
      <h2>{sessionName}</h2>
      <p style={{ color: '#666' }}>{date} &middot; {entries.length} scanned</p>

      {isAdmin && (
        <div className="card">
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}>+ Add student to this session</button>
          ) : (
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <input
                  placeholder="ID number"
                  value={form.id_number}
                  onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                />
                <input
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  placeholder="Dept"
                  value={form.dept}
                  onChange={(e) => setForm({ ...form, dept: e.target.value })}
                />
                <input
                  placeholder="Year"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
              </div>
              <button type="submit" disabled={saving}>
                {saving ? 'Adding...' : 'Add to session'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setError('')
                }}
                style={{ marginLeft: 8, background: '#999' }}
              >
                Cancel
              </button>
              {error && <div className="error">{error}</div>}
            </form>
          )}
        </div>
      )}

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
              {isAdmin && <th></th>}
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
                {isAdmin && (
                  <td>
                    <button className="danger" onClick={() => handleDelete(e.student_id)}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
