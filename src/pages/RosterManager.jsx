import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RosterManager() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ id_number: '', name: '', dept: '', year: '' })
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('id_number, name, dept, year')
      .order('name', { ascending: true })
    if (!error) setStudents(data)
    setLoading(false)
  }

  function startEdit(s) {
    setEditingId(s.id_number)
    setForm({ id_number: s.id_number, name: s.name, dept: s.dept, year: s.year })
    setError('')
  }

  function resetForm() {
    setEditingId(null)
    setForm({ id_number: '', name: '', dept: '', year: '' })
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.id_number || !form.name) {
      setError('ID and name are required.')
      return
    }

    if (editingId) {
      // Editing: id_number is the primary key, don't let it change here
      const { error } = await supabase
        .from('students')
        .update({ name: form.name, dept: form.dept, year: form.year })
        .eq('id_number', editingId)
      if (error) {
        setError(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('students').insert({
        id_number: form.id_number,
        name: form.name,
        dept: form.dept,
        year: form.year,
      })
      if (error) {
        setError(error.message)
        return
      }
    }

    resetForm()
    load()
  }

  async function handleDelete(idNumber) {
    if (!confirm(`Remove student ${idNumber} from the roster?`)) return
    const { error } = await supabase.from('students').delete().eq('id_number', idNumber)
    if (error) {
      alert(error.message)
      return
    }
    load()
  }

  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h2>Roster Management</h2>

      <div className="card">
        <h3>{editingId ? `Editing ${editingId}` : 'Add student'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <input
              placeholder="ID number"
              value={form.id_number}
              disabled={!!editingId}
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
          <button type="submit">{editingId ? 'Save changes' : 'Add student'}</button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              style={{ marginLeft: 8, background: '#999' }}
            >
              Cancel
            </button>
          )}
          {error && <div className="error">{error}</div>}
        </form>
      </div>

      <input
        placeholder="Search by name or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Dept</th>
              <th>Year</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id_number}>
                <td>{s.id_number}</td>
                <td>{s.name}</td>
                <td>{s.dept}</td>
                <td>{s.year}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(s)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(s.id_number)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
