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
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null) // existing roster match
  const [manualForm, setManualForm] = useState({ id_number: '', name: '', dept: '', year: '' })
  const [showManualForm, setShowManualForm] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session))
  }, [])

  useEffect(() => {
    load()
  }, [sessionName, date])

  // Live search the roster as the admin types (name or ID)
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('students')
        .select('id_number, name, dept, year')
        .or(`name.ilike.%${q}%,id_number.ilike.%${q}%`)
        .limit(8)
      setResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

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

  function resetAddFlow() {
    setSearch('')
    setResults([])
    setSelectedStudent(null)
    setShowManualForm(false)
    setManualForm({ id_number: '', name: '', dept: '', year: '' })
    setError('')
    setShowAddForm(false)
  }

  async function addToSession(studentId) {
    setError('')
    setSaving(true)

    // Make sure the session row exists
    await supabase
      .from('sessions')
      .upsert({ session_name: sessionName, date }, { onConflict: 'session_name,date' })

    const { error: attendanceError } = await supabase.from('attendance_records').insert({
      session_name: sessionName,
      date,
      student_id: studentId,
      is_manual: true,
    })

    setSaving(false)

    if (attendanceError) {
      setError(attendanceError.message)
      return
    }

    resetAddFlow()
    load()
  }

  async function handleAddExisting() {
    if (!selectedStudent) return
    await addToSession(selectedStudent.id_number)
  }

  async function handleAddManual(e) {
    e.preventDefault()
    setError('')

    if (!manualForm.id_number || !manualForm.name) {
      setError('ID and name are required.')
      return
    }

    setSaving(true)

    const { error: studentError } = await supabase.from('students').insert({
      id_number: manualForm.id_number,
      name: manualForm.name,
      dept: manualForm.dept,
      year: manualForm.year,
    })
    if (studentError) {
      setError(studentError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await addToSession(manualForm.id_number)
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
            <div>
              {!showManualForm ? (
                <>
                  <input
                    placeholder="Search by name or ID..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setSelectedStudent(null)
                    }}
                    autoFocus
                  />

                  {searching && <p style={{ fontSize: 13, color: '#666' }}>Searching...</p>}

                  {!selectedStudent && results.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {results.map((s) => (
                        <div
                          key={s.id_number}
                          onClick={() => {
                            setSelectedStudent(s)
                            setSearch(s.name)
                            setResults([])
                          }}
                          style={{
                            padding: '8px 10px',
                            border: '1px solid #eee',
                            borderRadius: 6,
                            marginBottom: 4,
                            cursor: 'pointer',
                          }}
                        >
                          <b>{s.name}</b> — {s.id_number} &middot; {s.dept} &middot; Yr {s.year}
                        </div>
                      ))}
                    </div>
                  )}

                  {!selectedStudent && !searching && search.trim().length >= 2 && results.length === 0 && (
                    <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
                      No match found in roster.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setShowManualForm(true)
                          setManualForm({ id_number: '', name: search, dept: '', year: '' })
                        }}
                      >
                        Add new student
                      </button>
                    </p>
                  )}

                  {selectedStudent && (
                    <div className="card" style={{ marginTop: 8 }}>
                      <p>
                        <b>{selectedStudent.name}</b> — {selectedStudent.id_number}
                        <br />
                        {selectedStudent.dept} &middot; Year {selectedStudent.year}
                      </p>
                      <button onClick={handleAddExisting} disabled={saving}>
                        {saving ? 'Adding...' : 'Add to session'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(null)
                          setSearch('')
                        }}
                        style={{ marginLeft: 8, background: '#999' }}
                      >
                        Change
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <button type="button" onClick={resetAddFlow} style={{ background: '#999' }}>
                      Cancel
                    </button>
                  </div>
                  {error && <div className="error">{error}</div>}
                </>
              ) : (
                <form onSubmit={handleAddManual}>
                  <p style={{ fontSize: 13, color: '#666' }}>
                    Not in the roster yet — enter their details (e.g. wrote it on paper):
                  </p>
                  <div className="form-row">
                    <input
                      placeholder="ID number"
                      value={manualForm.id_number}
                      onChange={(e) => setManualForm({ ...manualForm, id_number: e.target.value })}
                    />
                    <input
                      placeholder="Name"
                      value={manualForm.name}
                      onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    />
                    <input
                      placeholder="Dept"
                      value={manualForm.dept}
                      onChange={(e) => setManualForm({ ...manualForm, dept: e.target.value })}
                    />
                    <input
                      placeholder="Year"
                      value={manualForm.year}
                      onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                    />
                  </div>
                  <button type="submit" disabled={saving}>
                    {saving ? 'Adding...' : 'Add to session'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    style={{ marginLeft: 8, background: '#999' }}
                  >
                    Back to search
                  </button>
                  {error && <div className="error">{error}</div>}
                </form>
              )}
            </div>
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
