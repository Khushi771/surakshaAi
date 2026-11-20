import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, AudioLines, Bell, Check, ChevronDown, ClipboardCheck, Clock3, Eye, HardHat, LoaderCircle, Mail, Mic, Plus, Send, ShieldCheck, Siren, X } from 'lucide-react'
import './contact.css'

type Action = { id: number; title: string; owner: string; status: string; due_date?: string | null }
type Incident = { id: number; title: string; description: string; location: string; severity: string; status: string; media_url?: string | null; assignee_name?: string | null; assignee_email?: string | null; created_at: string; actions: Action[] }
type Hazard = { title: string; details: string; severity: string; immediate_action: string; confidence: string }
type HazardAnalysis = { summary: string; severity: string; risk_score: number; findings: Hazard[]; recommended_actions: string[]; media_url: string | null }
const severityLabel: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const isResolvedStatus = (status: string) => ['resolved', 'closed'].includes(status.trim().toLowerCase())
const isActionDone = (status: string) => status.trim().toLowerCase() === 'done'
const PAGE_SIZE = 5

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showActionForm, setShowActionForm] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [evidenceIncident, setEvidenceIncident] = useState<Incident | null>(null)
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('all')
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('all')
  const [actionStatusFilter, setActionStatusFilter] = useState('all')
  const [actionSearch, setActionSearch] = useState('')
  const [incidentPage, setIncidentPage] = useState(1)
  const [actionPage, setActionPage] = useState(1)
  const [contactSending, setContactSending] = useState(false)
  const [contactError, setContactError] = useState('')
  const [actionIncidentId, setActionIncidentId] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [actionOwner, setActionOwner] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [analysis, setAnalysis] = useState<HazardAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftSeverity, setDraftSeverity] = useState('medium')
  const [draftMediaUrl, setDraftMediaUrl] = useState<string | null>(null)
  const [draftActions, setDraftActions] = useState<string[]>([])
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const transcriptionSocket = useRef<WebSocket | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const audioProcessor = useRef<ScriptProcessorNode | null>(null)
  const audioSource = useRef<MediaStreamAudioSourceNode | null>(null)
  const recordingStream = useRef<MediaStream | null>(null)

  const load = useCallback(async () => {
    try { const response = await fetch('/api/incidents', { cache: 'no-store' }); if (!response.ok) throw new Error('Could not load incidents'); setIncidents(await response.json()); setError('') }
    catch { setError('Backend unavailable — start the FastAPI server to load live site data.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (showForm && !draftTitle && !draftDescription) setDraftActions([]) }, [showForm, draftTitle, draftDescription])

  async function saveIncident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(data), media_url: draftMediaUrl, action_items: draftActions.map(item => item.trim()).filter(Boolean) }) })
      if (!response.ok) throw new Error('Create failed')
      const emailSent = response.headers.get('X-Assignment-Email') === 'sent'
      const emailNotice = emailSent ? 'Assignee email sent' : 'Assignee email failed; check SMTP settings'
      setShowForm(false); setDraftActions([]); setNotice(`Incident saved · ${emailNotice}`); await load(); window.setTimeout(() => setNotice(''), 6000)
    } catch { setError('Could not save incident. Check that the backend is running.') }
  }
  async function analyzeImage(file?: File) {
    if (!file) return
    const data = new FormData(); data.append('file', file); setAnalyzing(true); setError(''); setAnalysis(null)
    try {
      const response = await fetch('/api/ai/image-analysis', { method: 'POST', body: data })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Image analysis failed')
      setAnalysis(body)
    } catch (err) { setError(err instanceof Error ? err.message : 'Image analysis failed.') }
    finally { setAnalyzing(false) }
  }
  function draftFromAnalysis() {
    if (!analysis) return
    setDraftTitle(analysis.summary.slice(0, 180))
    setDraftDescription(`${analysis.summary}\n\n${analysis.findings.map(item => `• ${item.title}: ${item.details} Immediate action: ${item.immediate_action}`).join('\n')}\n\nAI suggested actions: ${analysis.recommended_actions.join('; ')}`)
    setDraftSeverity(analysis.severity)
    setDraftActions(analysis.recommended_actions)
    setDraftMediaUrl(analysis.media_url); setAnalysis(null); setShowForm(true)
  }
  function draftFromTranscript() {
    setDraftTitle('Voice-reported site safety concern'); setDraftDescription(transcript); setDraftSeverity('medium'); setDraftMediaUrl(null); setDraftActions([]); setShowForm(true)
  }
  async function uploadFile(file?: File) {
    if (!file) return
    const data = new FormData(); data.append('file', file)
    try { const response = await fetch('/api/media', { method: 'POST', body: data }); if (!response.ok) throw new Error(); const result = await response.json(); setNotice(`Evidence saved: ${file.name}`); window.setTimeout(() => setNotice(''), 4000); return result.url }
    catch { setError('Upload failed. Check the backend and allowed file types.') }
  }
  async function toggleRecording() {
    if (recording) {
      audioProcessor.current?.disconnect(); audioSource.current?.disconnect(); void audioContext.current?.close(); audioContext.current = null
      recorder.current?.stop(); recordingStream.current?.getTracks().forEach(track => track.stop()); setRecording(false)
      if (transcriptionSocket.current?.readyState === WebSocket.OPEN) transcriptionSocket.current.send(JSON.stringify({ event: 'end' }))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) { setError('Microphone recording requires HTTPS or localhost.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordingStream.current = stream
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${scheme}//${window.location.host}/api/transcribe/ws`); transcriptionSocket.current = socket
      socket.onopen = () => socket.send(JSON.stringify({ language_code: 'auto', mode: 'codemix' }))
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.event === 'transcript.partial') setPartialTranscript(message.text || '')
          if (message.event === 'transcript.final') { setTranscript(previous => `${previous} ${message.text || ''}`.trim()); setPartialTranscript('') }
          if (message.event === 'error') setError(message.message || 'Sarvam transcription failed.')
        } catch { setError('Could not read the transcription response.') }
      }
      socket.onerror = () => setError('Could not reach the Sarvam voice service. Check backend setup.')
      const mediaRecorder = new MediaRecorder(stream); recorder.current = mediaRecorder; chunks.current = []
      mediaRecorder.ondataavailable = e => chunks.current.push(e.data)
      mediaRecorder.onstop = async () => { const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || 'audio/webm' }); const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'; await uploadFile(new File([blob], `site-note-${Date.now()}.${ext}`, { type: blob.type })); stream.getTracks().forEach(track => track.stop()) }
      mediaRecorder.start(); setTranscript(''); setPartialTranscript(''); setRecording(true); setError('')
      const context = new AudioContext(); audioContext.current = context
      const source = context.createMediaStreamSource(stream); audioSource.current = source
      const processor = context.createScriptProcessor(4096, 1, 1); audioProcessor.current = processor
      processor.onaudioprocess = audioEvent => {
        if (socket.readyState !== WebSocket.OPEN) return
        const input = audioEvent.inputBuffer.getChannelData(0); const factor = context.sampleRate / 16000; const count = Math.floor(input.length / factor); const pcm = new Int16Array(count)
        for (let index = 0; index < count; index++) { const sample = Math.max(-1, Math.min(1, input[Math.floor(index * factor)])); pcm[index] = sample < 0 ? sample * 32768 : sample * 32767 }
        if (pcm.byteLength && socket.bufferedAmount < 262144) socket.send(pcm.buffer)
        audioEvent.outputBuffer.getChannelData(0).fill(0)
      }
      source.connect(processor); processor.connect(context.destination)
    } catch { setError('Microphone access denied or unavailable.') }
  }
  async function resolveIncident(incident: Incident) {
    try {
      const response = await fetch(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: isResolvedStatus(incident.status) ? 'open' : 'resolved' }) })
      if (!response.ok) throw new Error()
      const updated: Incident = await response.json()
      setIncidents(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))
    }
    catch { setError('Could not update incident status.') }
  }

  async function saveAction(actionId: number, update: Pick<Action, 'owner' | 'status' | 'due_date'>, statusChanged: boolean) {
    try {
      const response = await fetch(`/api/actions/${actionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) })
      if (!response.ok) throw new Error('Action update failed')
      const emailState = response.headers.get('X-Action-Email')
      await load()
      const emailNote = !statusChanged ? '' : emailState === 'sent' ? ' · Assignee notified' : emailState === 'failed' ? ' · Email failed; check SMTP settings' : emailState === 'skipped' ? ' · No assignee email is saved' : ' · Email status unavailable'
      setNotice(`Action item updated${emailNote}`); window.setTimeout(() => setNotice(''), 5000)
      return true
    } catch { setError('Could not update the action item.'); return false }
  }

  async function createAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!actionIncidentId) return
    try {
      const response = await fetch(`/api/incidents/${actionIncidentId}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: actionTitle, owner: actionOwner.trim() || 'Unassigned', due_date: actionDueDate || null }) })
      if (!response.ok) throw new Error('Action creation failed')
      setShowActionForm(false); setActionTitle(''); setActionOwner(''); setActionDueDate(''); await load()
      setNotice('Action item created'); window.setTimeout(() => setNotice(''), 3000)
    } catch { setError('Could not create the action item.') }
  }

  async function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setContactSending(true)
    setContactError('')
    try {
      const form = event.currentTarget
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Could not send your message.')
      form.reset()
      setShowContactForm(false)
      setNotice(body.message || 'Your message has been sent.')
      window.setTimeout(() => setNotice(''), 4000)
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setContactSending(false)
    }
  }

  const open = incidents.filter(i => !isResolvedStatus(i.status)).length
  const critical = incidents.filter(i => i.severity === 'critical' && !isResolvedStatus(i.status)).length
  const allActions = incidents.flatMap(i => (i.actions || []).map(action => ({ ...action, incidentTitle: i.title, location: i.location })))
  const pendingActions = allActions.filter(action => !isActionDone(action.status))
  const visibleIncidents = incidents.filter(incident => {
    const statusMatches = incidentStatusFilter === 'all' || (incidentStatusFilter === 'resolved' ? isResolvedStatus(incident.status) : !isResolvedStatus(incident.status))
    const severityMatches = incidentSeverityFilter === 'all' || incident.severity.toLowerCase() === incidentSeverityFilter
    return statusMatches && severityMatches
  })
  const visibleActions = allActions.filter(action => {
    const status = action.status.trim().toLowerCase()
    const statusMatches = actionStatusFilter === 'all' || status === actionStatusFilter
    const query = actionSearch.trim().toLowerCase()
    const textMatches = !query || `${action.title} ${action.owner} ${action.incidentTitle} ${action.location}`.toLowerCase().includes(query)
    return statusMatches && textMatches
  })
  const incidentPageCount = Math.max(1, Math.ceil(visibleIncidents.length / PAGE_SIZE))
  const actionPageCount = Math.max(1, Math.ceil(visibleActions.length / PAGE_SIZE))
  const currentIncidentPage = Math.min(incidentPage, incidentPageCount)
  const currentActionPage = Math.min(actionPage, actionPageCount)
  const pagedIncidents = visibleIncidents.slice((currentIncidentPage - 1) * PAGE_SIZE, currentIncidentPage * PAGE_SIZE)
  const pagedActions = visibleActions.slice((currentActionPage - 1) * PAGE_SIZE, currentActionPage * PAGE_SIZE)
  const resolved = incidents.filter(i => isResolvedStatus(i.status)).length
  const evidencePath = evidenceIncident?.media_url || ''
  const evidenceUrl = evidencePath.startsWith('/media/') ? evidencePath : ''
  const evidenceIsAudio = /\.(webm|wav|mp3|m4a|ogg)(?:$|[?#])/i.test(evidenceUrl)
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.3} /></div><div><strong>suraksha<span>ai</span></strong><small>FIELD SAFETY, REIMAGINED</small></div></div>
      <div className="site-switch"><div className="site-icon"><HardHat size={18} /></div><div><small>ACTIVE PROJECT</small><strong>Emerald Heights</strong></div><ChevronDown size={15} className="muted" /></div>
      <nav><p className="nav-label">WORKSPACE</p><a className="nav-item active"><Activity size={17} /> Overview <span className="nav-dot" /></a><a className="nav-item" href="#incidents"><Siren size={17} /> Incidents <span className="nav-count">{open}</span></a><a className="nav-item" href="#actions"><ClipboardCheck size={17} /> Action items</a></nav>
      <div className="sidebar-bottom"><div className="safety-score"><div className="score-title"><span>OPEN ACTION ITEMS</span></div><strong>{String(pendingActions.length).padStart(2, '0')}<span> tasks</span></strong><div className="score-track"><i style={{ width: `${pendingActions.length ? 100 : 0}%` }} /></div><small>Follow-up across site reports</small></div><div className="profile"><div className="avatar">AK</div><div><strong>Arjun Kumar</strong><small>Site Safety Officer</small></div><MoreDots /></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">Projects <span>/</span> Emerald Heights <span>/</span> <b>Overview</b></div><div className="top-actions"><span className="live"><i /> LIVE SITE</span><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i className="notification-dot" /></button><div className="top-avatar">AK</div></div></header>
      <div className="content"><section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> SITE COMMAND CENTER</div><h1>Good morning, Arjun <span>✳</span></h1><p className="subheading">Here’s what’s happening across your site today.</p></div><div className="date-box"><Clock3 size={15} /><span>{today}</span></div></section>
        {error && <div className="alert-banner"><AlertTriangle size={16} />{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="toast"><Check size={16} />{notice}</div>}
        <section className="stats-grid">
          <StatCard label="OPEN INCIDENTS" value={String(open).padStart(2, '0')} icon={<Siren size={17} />} tone="red" trend={<span className="neutral-trend">Needs follow-up</span>} note="Live site reports" />
          <StatCard label="CRITICAL RISKS" value={String(critical).padStart(2, '0')} icon={<AlertTriangle size={17} />} tone="amber" trend={<span className="neutral-trend">Requires attention</span>} note="Open critical incidents" />
          <StatCard label="ACTIONS PENDING" value={String(pendingActions.length).padStart(2, '0')} icon={<ClipboardCheck size={17} />} tone="blue" trend={<span className="neutral-trend">Assigned follow-up</span>} note="Not yet completed" />
          <StatCard label="RESOLVED INCIDENTS" value={String(resolved).padStart(2, '0')} icon={<ShieldCheck size={17} />} tone="green" trend={<span className="positive">Verified closed</span>} note="Live site reports" />
        </section>
        {(recording || transcript || partialTranscript) && <section className="voice-transcript"><div className="voice-transcript-icon"><AudioLines size={17} /></div><div className="voice-transcript-copy"><strong>{recording ? 'Live voice transcription' : 'Voice note transcript'}</strong><p>{transcript || partialTranscript ? <>{transcript}{partialTranscript && <span className="partial-text"> {partialTranscript}</span>}</> : 'Listening… speak in English or an Indian language.'}</p></div>{transcript && !recording && <button className="text-button" onClick={draftFromTranscript}>Draft incident →</button>}</section>}
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> FIELD OPERATIONS</div><h2>Site activity</h2></div><div className="heading-actions"><button className="secondary-button" onClick={() => document.getElementById('analysis-input')?.click()} disabled={analyzing}>{analyzing ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} {analyzing ? 'Analyzing…' : 'Analyze photo'}</button><input id="analysis-input" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { void analyzeImage(e.target.files?.[0]); e.currentTarget.value = '' }} /><button className={`secondary-button ${recording ? 'recording' : ''}`} onClick={() => void toggleRecording()}>{recording ? <><AudioLines size={16} /> Stop recording</> : <><Mic size={16} /> Voice note</>}</button><button className="primary-button" onClick={() => { setDraftTitle(''); setDraftDescription(''); setDraftSeverity('medium'); setDraftMediaUrl(null); setDraftActions([]); setShowForm(true) }}><Plus size={17} /> Log incident</button></div></div>
        <section className="incident-panel" id="incidents"><div className="panel-header"><div><h3>Recent incidents</h3><p>Real-time safety reports from your site</p></div><div className="panel-filters"><label className="sr-only" htmlFor="incident-status-filter">Filter incidents by status</label><select id="incident-status-filter" className="filter-select" value={incidentStatusFilter} onChange={e => { setIncidentStatusFilter(e.target.value); setIncidentPage(1) }}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select><label className="sr-only" htmlFor="incident-severity-filter">Filter incidents by severity</label><select id="incident-severity-filter" className="filter-select" value={incidentSeverityFilter} onChange={e => { setIncidentSeverityFilter(e.target.value); setIncidentPage(1) }}><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div></div>
          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={21} /> Loading site activity…</div> : incidents.length === 0 ? <div className="empty-state"><div className="empty-icon"><ShieldCheck size={21} /></div><strong>All clear for now</strong><span>New reports from your site will show up here.</span><button className="text-button" onClick={() => setShowForm(true)}>Log your first incident <span>→</span></button></div> : visibleIncidents.length === 0 ? <div className="empty-state"><strong>No incidents match these filters</strong><span>Try another status or severity.</span></div> : <div className="incident-list">{pagedIncidents.map(incident => <IncidentRow key={incident.id} incident={incident} onResolve={() => void resolveIncident(incident)} onViewEvidence={setEvidenceIncident} />)}</div>}
          {!loading && visibleIncidents.length > 0 && <Pagination page={currentIncidentPage} pageCount={incidentPageCount} total={visibleIncidents.length} onPageChange={setIncidentPage} />}
          <div className="panel-footer"><span>{incidents.length} total {incidents.length === 1 ? 'incident' : 'incidents'}</span><a href="#incidents">Incident log <span>→</span></a></div>
        </section>
        <section className="incident-panel action-panel" id="actions"><div className="panel-header"><div><h3>Action items</h3><p>Assign owners, set due dates, and track safety follow-up</p></div><div className="action-head-actions"><span className="action-total">{pendingActions.length} pending</span><button className="secondary-button" type="button" disabled={incidents.length === 0} onClick={() => { setActionIncidentId(String(incidents[0]?.id || '')); setShowActionForm(true) }}><Plus size={14} /> Add action</button></div></div><div className="action-filters"><label className="sr-only" htmlFor="action-status-filter">Filter actions by status</label><select id="action-status-filter" className="filter-select" value={actionStatusFilter} onChange={e => { setActionStatusFilter(e.target.value); setActionPage(1) }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select><label className="sr-only" htmlFor="action-search">Search actions</label><input id="action-search" className="filter-search" type="search" placeholder="Filter by action, owner, or incident" value={actionSearch} onChange={e => { setActionSearch(e.target.value); setActionPage(1) }} /></div>
          {allActions.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardCheck size={21} /></div><strong>No action items yet</strong><span>Suggested actions from reviewed hazards will appear here.</span></div> : visibleActions.length === 0 ? <div className="empty-state"><strong>No actions match these filters</strong><span>Try another status or search term.</span></div> : <><div className="action-list">{pagedActions.map(action => <ActionRow key={action.id} action={action} onSave={saveAction} />)}</div><Pagination page={currentActionPage} pageCount={actionPageCount} total={visibleActions.length} onPageChange={setActionPage} /></>}
        </section>
        <footer className="page-footer"><span><ShieldCheck size={14} /> Your site is being monitored</span><button className="contact-link" type="button" onClick={() => { setContactError(''); setShowContactForm(true) }}><Mail size={13} /> Contact us</button><span>Last synced just now <i /></span></footer>
      </div>
    </main>
    {evidenceIncident && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEvidenceIncident(null) }}><section className="incident-modal evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" /> INCIDENT EVIDENCE</div><h2 id="evidence-title">{evidenceIncident.title}</h2></div><button type="button" className="icon-button" onClick={() => setEvidenceIncident(null)} aria-label="Close"><X size={18} /></button></div>{evidenceUrl ? evidenceIsAudio ? <audio controls preload="metadata" src={evidenceUrl}>Your browser does not support audio playback.</audio> : <img className="evidence-preview" src={evidenceUrl} alt={`Evidence for ${evidenceIncident.title}`} /> : <p className="contact-intro">The evidence file is not available.</p>}</section></div>}
    {analysis && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAnalysis(null) }}><section className="incident-modal analysis-modal"><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" /> AI VISION REVIEW</div><h2>Hazard assessment</h2></div><button type="button" className="icon-button" onClick={() => setAnalysis(null)} aria-label="Close"><X size={18} /></button></div><div className="risk-overview"><span className={`severity-pill ${analysis.severity}`}>{severityLabel[analysis.severity] || analysis.severity} risk</span><strong>{analysis.risk_score}<small>/100</small></strong><p>{analysis.summary}</p></div>{analysis.findings.map((finding, index) => <div className="finding-card" key={`${finding.title}-${index}`}><div><strong>{finding.title}</strong><span className={`severity-pill ${finding.severity}`}>{severityLabel[finding.severity] || finding.severity}</span></div><p>{finding.details}</p><small>Immediate action: {finding.immediate_action} · Confidence: {finding.confidence}</small></div>)}{analysis.recommended_actions.length > 0 && <div className="recommended-actions"><strong>Recommended actions</strong>{analysis.recommended_actions.map((action, index) => <span key={index}>• {action}</span>)}</div>}<p className="ai-review-note">AI triage only. A competent site safety officer must verify this finding before action.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAnalysis(null)}>Dismiss</button><button type="button" className="primary-button" onClick={draftFromAnalysis}><Plus size={16} /> Review & create incident</button></div></section></div>}
    {showActionForm && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowActionForm(false) }}><form className="incident-modal" onSubmit={createAction}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" /> FOLLOW-UP</div><h2>Add an action item</h2></div><button type="button" className="icon-button" onClick={() => setShowActionForm(false)} aria-label="Close"><X size={18} /></button></div><label>Related incident<select value={actionIncidentId} onChange={e => setActionIncidentId(e.target.value)} required>{incidents.map(incident => <option key={incident.id} value={incident.id}>{incident.title}</option>)}</select></label><label>Action<input value={actionTitle} onChange={e => setActionTitle(e.target.value)} placeholder="e.g. Secure the exposed floor opening" required minLength={2} maxLength={180} /></label><div className="form-pair"><label>Owner<input value={actionOwner} onChange={e => setActionOwner(e.target.value)} placeholder="Name or Unassigned" maxLength={120} /></label><label>Due date<input type="date" value={actionDueDate} onChange={e => setActionDueDate(e.target.value)} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowActionForm(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Create action</button></div></form></div>}
    {showForm && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}><form className="incident-modal" onSubmit={saveIncident}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" /> FIELD REPORT</div><h2>Log an incident</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button></div><label>What happened?<input name="title" placeholder="e.g. Unsecured scaffolding on level 3" value={draftTitle} onChange={e => setDraftTitle(e.target.value)} required minLength={3} maxLength={180} /></label><label>Details<textarea name="description" rows={4} placeholder="Add context for the safety team…" value={draftDescription} onChange={e => setDraftDescription(e.target.value)} /></label><label>Action items<textarea rows={3} placeholder="Optional — enter one follow-up action per line" value={draftActions.join('\n')} onChange={e => setDraftActions(e.target.value.split('\n'))} /></label><div className="form-pair"><label>Location<input name="location" placeholder="e.g. Tower A, Level 3" defaultValue="" /></label><label>Severity<select name="severity" value={draftSeverity} onChange={e => setDraftSeverity(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div><div className="form-pair"><label>Assignee name<input name="assignee_name" autoComplete="name" placeholder="Person responsible" required minLength={2} maxLength={120} /></label><label>Assignee email<input name="assignee_email" type="email" autoComplete="email" placeholder="person@example.com" required maxLength={254} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Save incident</button></div></form></div>}
    {showContactForm && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowContactForm(false) }}><form className="incident-modal" onSubmit={submitContact}><div className="modal-top"><div><div className="eyebrow"><span className="eyebrow-line" /> GET IN TOUCH</div><h2>Contact SurakshaAI</h2></div><button type="button" className="icon-button" onClick={() => setShowContactForm(false)} aria-label="Close"><X size={18} /></button></div><p className="contact-intro">Send us a message and our team will get back to you.</p><label>Your name<input name="name" autoComplete="name" placeholder="Name" required minLength={2} maxLength={100} /></label><label>Your email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label><label>Message<textarea name="message" rows={5} placeholder="How can we help?" required minLength={10} maxLength={3000} /></label><label className="contact-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>{contactError && <p className="contact-error" role="alert">{contactError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowContactForm(false)}>Cancel</button><button className="primary-button" type="submit" disabled={contactSending}>{contactSending ? <LoaderCircle className="spin" size={15} /> : <Send size={14} />} {contactSending ? 'Sending…' : 'Send message'}</button></div></form></div>}
  </div>
}

function Pagination({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null
  const firstItem = (page - 1) * PAGE_SIZE + 1
  const lastItem = Math.min(page * PAGE_SIZE, total)
  return <nav className="pagination" aria-label="List pagination">
    <span>Showing {firstItem}–{lastItem} of {total}</span>
    <div>
      <button type="button" className="secondary-button pagination-button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Previous</button>
      <span className="pagination-page">Page {page} of {pageCount}</span>
      <button type="button" className="secondary-button pagination-button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>Next</button>
    </div>
  </nav>
}

function StatCard({ label, value, suffix, icon, tone, trend, note }: { label: string; value: string; suffix?: string; icon: React.ReactNode; tone: string; trend: React.ReactNode; note: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}>{icon}</div></div><div className="stat-value">{value}<small>{suffix}</small></div><div className="stat-bottom"><span className={tone === 'red' ? 'negative' : tone === 'green' || tone === 'blue' ? 'positive' : 'neutral'}>{trend}</span><span className="stat-note">{note}</span></div></article>
}
function IncidentRow({ incident, onResolve, onViewEvidence }: { incident: Incident; onResolve: () => void; onViewEvidence: (incident: Incident) => void }) {
  const date = new Date(incident.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const resolved = isResolvedStatus(incident.status)
  return <article className="incident-row"><div className={`incident-severity ${incident.severity}`}><Siren size={17} /></div><div className="incident-details"><div className="incident-title-line"><strong>{incident.title}</strong><span className={`severity-pill ${incident.severity}`}>{severityLabel[incident.severity] || incident.severity}</span></div><p>{incident.description || 'No additional details provided.'}</p><div className="incident-meta"><span><HardHat size={13} /> {incident.location}</span><i /><span><Mail size={13} /> {incident.assignee_name || 'Unassigned'}</span><i /><span><Clock3 size={13} /> {date}</span></div>{incident.media_url?.startsWith('/media/') && <button type="button" className="media-button" onClick={() => onViewEvidence(incident)}><Eye size={13} /> View evidence</button>}</div><div className="incident-state"><span className={`status-pill ${resolved ? 'resolved' : incident.status}`}>{resolved ? 'Resolved' : 'Open'}</span><button onClick={onResolve} className="resolve-button">{resolved ? 'Reopen' : 'Resolve'}</button></div></article>
}
function ActionRow({ action, onSave }: { action: Action & { incidentTitle: string; location: string }; onSave: (id: number, update: Pick<Action, 'owner' | 'status' | 'due_date'>, statusChanged: boolean) => Promise<boolean> }) {
  const [owner, setOwner] = useState(action.owner || 'Unassigned')
  const [status, setStatus] = useState(action.status)
  const [dueDate, setDueDate] = useState(action.due_date || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setOwner(action.owner || 'Unassigned'); setStatus(action.status); setDueDate(action.due_date || '') }, [action.owner, action.status, action.due_date])
  async function submit() { setSaving(true); await onSave(action.id, { owner, status, due_date: dueDate || null }, status !== action.status); setSaving(false) }
  return <article className={`action-row ${action.status === 'done' ? 'completed' : ''}`}>
    <div className="action-copy"><strong>{action.title}</strong><span>{action.incidentTitle} · {action.location}</span></div>
    <label className="action-field">Owner<input value={owner} onChange={event => setOwner(event.target.value)} maxLength={120} placeholder="Unassigned" /></label>
    <label className="action-field">Due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
    <label className="action-field">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
    <button className="secondary-button action-save" type="button" onClick={() => void submit()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Save</button>
  </article>
}
function MoreDots() { return <span className="more-dots">···</span> }
