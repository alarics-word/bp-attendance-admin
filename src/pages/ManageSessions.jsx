import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/// Admin-only tool: pick several sessions (usually mis-named
/// duplicates from the same practice date) and merge them into
/// one target session. Every attendance record from the sources
/// gets moved onto the target (skipping students already counted
/// there), then the source sessions and any leftover records are
/// deleted.
export default function ManageSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('session_name, date')
      .order('date', { ascending: false })
      .order('session_name', { ascending: true })

    const withCounts = await Promise.all(
      (sessionRows ?? []).map(async (s) => {
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

  function toggle(key) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  async function handleMerge() {
    if (!target) {
      setStatus('Pick a target session first (the one to keep).')
      return
    }
    const sources = [...selected].filter((k) => k !== target)
    if (sources.length === 0) {
      setStatus('Select at least one other session to merge into the target.')
      return
    }

    setWorking(true)
    setStatus('Merging...')

    const [targetName, targetDate] = target.split('|||')

    for (const key of sources) {
      const [sourceName, sourceDate] = key.split('|||')
      if (sourceDate !== targetDate) continue // safety: only merge same-date sessions

      const { data: records } = await supabase
        .from('attendance_records')
        .select('student_id, scanned_at, is_manual')
        .eq('session_name', sourceName)
        .eq('date', sourceDate)

      for (const r of records ?? []) {
        await supabase.from('attendance_records').upsert(
          {
            session_name: targetName,
            date: targetDate,
            student_id: r.student_id,
            scanned_at: r.scanned_at,
            is_manual: r.is_manual,
          },
          { onConflict: 'session_name,date,student_id', ignoreDuplicates: true }
        )
      }

      // Remove the now-merged source records, then the empty session
      await supabase
        .from('attendance_records')
        .delete()
        .eq('session_name', sourceName)
        .eq('date', sourceDate)
      await supabase.from('sessions').delete().eq('session_name', sourceName).eq('date', sourceDate)
    }

    setStatus(`Merged ${sources.length} session(s) into "${targetName}".`)
    setSelected(new Set())
    setTarget('')
    setWorking(false)
    load()
  }

  return (
    <div>
      <h2>Manage Sessions</h2>
      <p style={{ color: '#666', fontSize: 13 }}>
        Select duplicate or mis-named sessions from the SAME date, choose one as the target to
        keep, then merge. All attendance moves onto the target and the extra sessions are
        deleted.
      </p>

      {selected.size > 0 && (
        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ marginBottom: 8 }}>
            <b>{selected.size}</b> selected. Choose the target session to keep:
          </div>
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ marginBottom: 8 }}>
            <option value="">-- pick target --</option>
            {[...selected].map((key) => {
              const [name, date] = key.split('|||')
              return (
                <option key={key} value={key}>
                  {name} ({date})
                </option>
              )
            })}
          </select>
          <div>
            <button onClick={handleMerge} disabled={working}>
              {working ? 'Merging...' : 'Merge selected into target'}
            </button>
            <button
              onClick={() => {
                setSelected(new Set())
                setTarget('')
                setStatus('')
              }}
              style={{ marginLeft: 8, background: '#999' }}
            >
              Clear selection
            </button>
          </div>
          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Session</th>
              <th>Date</th>
              <th>Scanned</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const key = `${s.session_name}|||${s.date}`
              return (
                <tr key={key}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                    />
                  </td>
                  <td>{s.session_name}</td>
                  <td>{s.date}</td>
                  <td>{s.count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
