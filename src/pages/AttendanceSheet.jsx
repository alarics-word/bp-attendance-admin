import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx-js-style'

// Only sessions whose name contains this are included, since the
// app is only used for Yells Practice. Sessions are named e.g.
// "Yells Practice In - August 14" / "Yells Practice Out - August 14" —
// the date is what pairs an In session with its Out session.
const SESSION_FILTER = 'Yells Practice'

export default function AttendanceSheet() {
  const [students, setStudents] = useState([])
  const [practiceDates, setPracticeDates] = useState([]) // [{date, inSession, outSession}]
  const [attendance, setAttendance] = useState({}) // `${date}|${id}|in|out` -> true
  const [excusedSet, setExcusedSet] = useState(new Set()) // `${date}|${id}`
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session))
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data: studentRows } = await supabase
      .from('students')
      .select('id_number, name, dept, year')
      .order('dept', { ascending: true })
      .order('year', { ascending: true })
      .order('name', { ascending: true })
    setStudents(studentRows ?? [])

    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('session_name, date')
      .ilike('session_name', `%${SESSION_FILTER}%`)
      .order('date', { ascending: true })

    // Pair sessions by date: one "In" session + one "Out" session per date.
    // Older sessions that don't say "In"/"Out" in the name (e.g. from
    // before this naming convention started) fall back to counting as
    // the "In" column, so their attendance still shows instead of
    // being silently skipped.
    const byDate = {}
    for (const s of sessionRows ?? []) {
      if (!byDate[s.date]) byDate[s.date] = { date: s.date, inSession: null, outSession: null }
      if (/\bin\b/i.test(s.session_name)) byDate[s.date].inSession = s.session_name
      else if (/\bout\b/i.test(s.session_name)) byDate[s.date].outSession = s.session_name
      else if (!byDate[s.date].inSession) byDate[s.date].inSession = s.session_name
    }
    const dates = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    setPracticeDates(dates)

    const { data: attendanceRows } = await supabase
      .from('attendance_records')
      .select('student_id, date, session_name')
      .ilike('session_name', `%${SESSION_FILTER}%`)

    const map = {}
    for (const r of attendanceRows ?? []) {
      const dir = /\bin\b/i.test(r.session_name) ? 'in' : /\bout\b/i.test(r.session_name) ? 'out' : 'in'
      map[`${r.date}|${r.student_id}|${dir}`] = true
    }
    setAttendance(map)

    const { data: excusedRows } = await supabase.from('excused').select('student_id, date')
    setExcusedSet(new Set((excusedRows ?? []).map((r) => `${r.date}|${r.student_id}`)))

    setLoading(false)
  }

  function statusFor(date, studentId, dir) {
    if (attendance[`${date}|${studentId}|${dir}`]) return 'green'
    if (excusedSet.has(`${date}|${studentId}`)) return 'yellow'
    return 'red'
  }

  async function toggleExcused(date, studentId, sessionName) {
    if (!isAdmin || !sessionName) return
    const attended =
      attendance[`${date}|${studentId}|in`] || attendance[`${date}|${studentId}|out`]
    if (attended) return // can't excuse someone who has any scan that day

    const key = `${date}|${studentId}`
    if (excusedSet.has(key)) {
      await supabase
        .from('excused')
        .delete()
        .eq('session_name', sessionName)
        .eq('date', date)
        .eq('student_id', studentId)
    } else {
      await supabase.from('excused').insert({ session_name: sessionName, date, student_id: studentId })
    }
    load()
  }

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students
    const q = search.trim().toLowerCase()
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id_number.toLowerCase().includes(q)
    )
  }, [students, search])

  const grouped = useMemo(() => {
    const groups = {}
    for (const s of filteredStudents) {
      const key = `${s.dept || 'Unknown Dept'} — Year ${s.year || '?'}`
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return groups
  }, [filteredStudents])

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    const headerStyle = {
      fill: { fgColor: { rgb: '3949AB' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center' },
    }
    const groupHeaderStyle = { fill: { fgColor: { rgb: 'DDDDDD' } }, font: { bold: true } }
    const colors = {
      green: { fgColor: { rgb: 'C6EFCE' } },
      red: { fgColor: { rgb: 'FFC7CE' } },
      yellow: { fgColor: { rgb: 'FFEB9C' } },
    }

    const rows = []
    const dateHeader = ['Full Name', 'Dept', 'Year']
    const subHeader = ['', '', '']
    practiceDates.forEach((p) => {
      dateHeader.push(p.date, '')
      subHeader.push('IN', 'OUT')
    })
    rows.push(dateHeader)
    rows.push(subHeader)

    Object.entries(grouped).forEach(([groupName, groupStudents]) => {
      rows.push([groupName])
      groupStudents.forEach((s) => {
        const statusRow = []
        practiceDates.forEach((p) => {
          statusRow.push(
            statusFor(p.date, s.id_number, 'in') === 'green'
              ? 'Present'
              : statusFor(p.date, s.id_number, 'in') === 'yellow'
              ? 'Excused'
              : 'Absent'
          )
          statusRow.push(
            statusFor(p.date, s.id_number, 'out') === 'green'
              ? 'Present'
              : statusFor(p.date, s.id_number, 'out') === 'yellow'
              ? 'Excused'
              : 'Absent'
          )
        })
        rows.push([s.name, s.dept, s.year, ...statusRow])
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Merge date header cells across IN/OUT pair
    ws['!merges'] = practiceDates.map((_, i) => ({
      s: { r: 0, c: 3 + i * 2 },
      e: { r: 0, c: 4 + i * 2 },
    }))

    dateHeader.forEach((_, colIdx) => {
      const ref1 = XLSX.utils.encode_cell({ r: 0, c: colIdx })
      const ref2 = XLSX.utils.encode_cell({ r: 1, c: colIdx })
      if (ws[ref1]) ws[ref1].s = headerStyle
      if (ws[ref2]) ws[ref2].s = headerStyle
    })

    let r = 2
    Object.entries(grouped).forEach(([, groupStudents]) => {
      const groupCell = XLSX.utils.encode_cell({ r, c: 0 })
      if (ws[groupCell]) ws[groupCell].s = groupHeaderStyle
      r++
      groupStudents.forEach((s) => {
        practiceDates.forEach((p, i) => {
          const stIn = statusFor(p.date, s.id_number, 'in')
          const stOut = statusFor(p.date, s.id_number, 'out')
          const refIn = XLSX.utils.encode_cell({ r, c: 3 + i * 2 })
          const refOut = XLSX.utils.encode_cell({ r, c: 4 + i * 2 })
          if (ws[refIn]) ws[refIn].s = { fill: colors[stIn] }
          if (ws[refOut]) ws[refOut].s = { fill: colors[stOut] }
        })
        r++
      })
    })

    ws['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 6 },
      ...practiceDates.flatMap(() => [{ wch: 10 }, { wch: 10 }]),
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Yells Practice')
    XLSX.writeFile(wb, 'attendance_sheet.xlsx')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Attendance Sheet — Yells Practice</h2>
        <button onClick={exportExcel}>Download Excel</button>
      </div>

      <input
        placeholder="Search by name or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 320 }}
      />

      {isAdmin && (
        <p style={{ color: '#666', fontSize: 13 }}>
          Click a red (absent) cell to mark it excused. Click again to undo.
        </p>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : practiceDates.length === 0 ? (
        <p>No "{SESSION_FILTER}" sessions found yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Full Name</th>
                <th rowSpan={2}>Dept</th>
                <th rowSpan={2}>Year</th>
                {practiceDates.map((p) => (
                  <th key={p.date} colSpan={2} style={{ textAlign: 'center' }}>
                    {p.date}
                  </th>
                ))}
              </tr>
              <tr>
                {practiceDates.map((p) => (
                  <>
                    <th key={p.date + '-in'}>IN</th>
                    <th key={p.date + '-out'}>OUT</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([groupName, groupStudents]) => (
                <>
                  <tr key={groupName}>
                    <td
                      colSpan={3 + practiceDates.length * 2}
                      style={{ background: '#eee', fontWeight: 600 }}
                    >
                      {groupName}
                    </td>
                  </tr>
                  {groupStudents.map((s) => (
                    <tr key={s.id_number}>
                      <td>{s.name}</td>
                      <td>{s.dept}</td>
                      <td>{s.year}</td>
                      {practiceDates.map((p) => {
                        const stIn = statusFor(p.date, s.id_number, 'in')
                        const stOut = statusFor(p.date, s.id_number, 'out')
                        const cellStyle = (st) => ({
                          background: st === 'green' ? '#c6efce' : st === 'yellow' ? '#ffeb9c' : '#ffc7ce',
                          textAlign: 'center',
                        })
                        return (
                          <>
                            <td
                              key={p.date + '-in'}
                              onClick={() => toggleExcused(p.date, s.id_number, p.inSession)}
                              style={{
                                ...cellStyle(stIn),
                                cursor: isAdmin && stIn !== 'green' ? 'pointer' : 'default',
                              }}
                            >
                              {stIn === 'green' ? '✓' : stIn === 'yellow' ? 'E' : ''}
                            </td>
                            <td
                              key={p.date + '-out'}
                              onClick={() => toggleExcused(p.date, s.id_number, p.outSession)}
                              style={{
                                ...cellStyle(stOut),
                                cursor: isAdmin && stOut !== 'green' ? 'pointer' : 'default',
                              }}
                            >
                              {stOut === 'green' ? '✓' : stOut === 'yellow' ? 'E' : ''}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
