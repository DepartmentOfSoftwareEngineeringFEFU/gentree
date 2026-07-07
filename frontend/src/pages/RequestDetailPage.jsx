import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'

const STATUS_LABEL = {
  DRAFT: 'Черновик', PREPARED: 'Подготовлен', SENT: 'Направлен',
  IN_PROGRESS: 'В обработке', NEEDS_CLARIFICATION: 'Требуются доп. сведения',
  RESPONSE_RECEIVED: 'Получен ответ',
  COMPLETED: 'Завершён', CANCELLED: 'Отменён',
}

const STATUS_ACTIONS = {
  DRAFT: {
    next: 'PREPARED',
    title: 'Подготовить запрос',
    description: 'Перевести старую черновую запись в состояние подготовленного запроса.',
  },
  PREPARED: {
    next: 'SENT',
    title: 'Направить запрос',
    description: 'Зафиксировать отправку запроса в архив или другой источник сведений.',
  },
  SENT: {
    next: 'IN_PROGRESS',
    title: 'Принять в работу',
    description: 'Начать обработку запроса после его направления.',
  },
  IN_PROGRESS: {
    next: 'RESPONSE_RECEIVED',
    title: 'Получен ответ',
    description: 'Зафиксировать получение ответа или дополнительных сведений.',
  },
  RESPONSE_RECEIVED: {
    next: 'COMPLETED',
    title: 'Завершить обработку',
    description: 'Завершить работу по запросу после внесения результата.',
  },
}

const FACT_LABEL = {
  BIRTH: 'Рождение',
  DEATH: 'Смерть',
  MARRIAGE: 'Брак',
  RESIDENCE: 'Проживание',
  SERVICE: 'Служба',
  NOTE: 'Заметка',
}

const CONF_LABEL = {
  UNVERIFIED: 'Не проверено',
  HYPOTHESIS: 'Гипотеза',
  PROBABLE: 'Вероятно',
  CONFIRMED: 'Подтверждено',
}

const CONF_OPTIONS = ['UNVERIFIED', 'HYPOTHESIS', 'PROBABLE', 'CONFIRMED']

const SEX_LABEL = {
  MALE: 'Мужской',
  FEMALE: 'Женский',
  UNKNOWN: 'Неизвестно',
}

const REL_LABEL = {
  PARENT_CHILD: 'Родитель - ребёнок',
  SPOUSE: 'Супруги',
  OTHER: 'Другая связь',
}

const DOC_KIND_LABEL = {
  ARCHIVE_SCAN: 'Архивный документ',
  REQUEST_DRAFT: 'Черновик запроса',
  REQUEST_FINAL: 'Итоговый запрос',
  BOOK_RESULT: 'Результат книги',
  ATTACHMENT: 'Вложение',
}

const DOC_SOURCE_LABEL = {
  USER_UPLOAD: 'Пользователь',
  GENEALOGIST_UPLOAD: 'Генеалог',
  SYSTEM_GENERATED: 'Система',
  ARCHIVE_RECEIVED: 'Архив',
}

const REQUEST_DOC_RELATION_LABEL = {
  USER_ATTACHMENT: 'Пользователь',
  USER_MATERIAL: 'Пользователь',
  GENEALOGIST_RESULT: 'Генеалог',
  PROFILE_ATTACHMENT: 'Профиль',
  ATTACHMENT: 'Материал',
}

const ATTACHMENT_PURPOSE_LABEL = {
  USER_ATTACHMENT: 'Материал пользователя',
  USER_MATERIAL: 'Материал пользователя',
  GENEALOGIST_RESULT: 'Результат генеалога',
  PROFILE_ATTACHMENT: 'Документ профиля',
  ATTACHMENT: 'Материал',
}

const RESULT_STATUS_LABEL = {
  FOUND: 'Сведения найдены',
  PARTIAL: 'Сведения найдены частично',
  NOT_FOUND: 'Сведения не найдены',
}

const TEMPLATE_TYPE_LABEL = {
  GENERAL_ARCHIVE: 'Государственный архив',
  MILITARY_ARCHIVE: 'Военный архив',
  CIVIL_REGISTRY: 'ЗАГС / актовые записи',
  MEDICAL_ARCHIVE: 'Медицинская организация / роддом',
  PERSONNEL_ARCHIVE: 'Документы по личному составу',
  RESIDENCE_PROPERTY_ARCHIVE: 'Проживание / домовые книги / имущество',
  CUSTOM: 'Другое',
}

const GENERATED_STATUS_LABEL = {
  DRAFT: 'Черновик',
  PREPARED: 'Подготовлено',
  EXPORTED: 'Экспортировано',
  SENT_OUTSIDE_SYSTEM: 'Направлено вне системы',
  RESPONSE_RECEIVED: 'Получен ответ',
  CANCELLED: 'Отменено',
}

export default function RequestDetailPage() {
  const { profileId, requestId } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [req, setReq] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [persons, setPersons] = useState([])
  const [relationships, setRelationships] = useState([])
  const [factsByPerson, setFactsByPerson] = useState({})
  const [history, setHistory] = useState([])
  const [docs, setDocs] = useState([])
  const [generatedDocs, setGeneratedDocs] = useState([])
  const [activeTemplates, setActiveTemplates] = useState([])
  const [activeSection, setActiveSection] = useState('OVERVIEW')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState('SELECT')
  const [currentGenerated, setCurrentGenerated] = useState(null)
  const [availableAttachments, setAvailableAttachments] = useState([])
  const [editingFinalText, setEditingFinalText] = useState(false)
  const [wizardBusy, setWizardBusy] = useState(false)
  const [wizardMessage, setWizardMessage] = useState('')
  const [comment, setComment] = useState('')
  const [clarificationComment, setClarificationComment] = useState('')
  const [clarificationResponse, setClarificationResponse] = useState('')
  const [error, setError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [clarificationBusy, setClarificationBusy] = useState(false)
  const [editingReq, setEditingReq] = useState(false)
  const [editReqForm, setEditReqForm] = useState({})
  const [fileName, setFileName] = useState('')
  const [resultForm, setResultForm] = useState({
    processing_comment: '',
    result_summary: '',
    found_information: '',
    result_sources: '',
    result_recommendations: '',
    result_status: '',
    result_persons: [],
    result_facts: [],
    result_relationships: [],
    result_document_links: [],
  })
  const [resultSaved, setResultSaved] = useState(false)
  const [savingFactId, setSavingFactId] = useState('')
  const fileRef = useRef()

  const load = async () => {
    setError('')
    setProfile(null)
    setPersons([])
    setRelationships([])
    setFactsByPerson({})
    setHistory([])
    setDocs([])
    setProfileError('')
    setProfileLoading(true)
    try {
      const r = await api.getRequest(requestId)
      setReq(r)
      setResultForm({
        processing_comment: r.processing_comment ?? '',
        result_summary: r.result_summary ?? '',
        found_information: r.found_information ?? '',
        result_sources: r.result_sources ?? '',
        result_recommendations: r.result_recommendations ?? '',
        result_status: r.result_status ?? '',
        result_persons: r.result_persons ?? [],
        result_facts: r.result_facts ?? [],
        result_relationships: r.result_relationships ?? [],
        result_document_links: r.result_document_links ?? [],
      })
      const linkedProfileId = r.profile_id || profileId

      api.getHistory(requestId).then(setHistory).catch(err => setError(err.message))
      api.listDocsByRequest(requestId).then(setDocs).catch(err => setError(err.message))
      if (user?.role === 'GENEALOGIST') {
        api.listGeneratedDocuments(requestId).then(setGeneratedDocs).catch(err => setError(err.message))
        api.activeArchiveTemplates().then(setActiveTemplates).catch(err => setError(err.message))
      }

      try {
        const profileData = await api.getProfile(linkedProfileId)
        setProfile(profileData)

        const personData = await api.listPersons(linkedProfileId)
        setPersons(personData)
        api.listRelationships(linkedProfileId).then(setRelationships).catch(err => setError(err.message))

        const factsEntries = await Promise.all(
          personData.map(async person => [person.id, await api.listFacts(person.id)])
        )
        setFactsByPerson(Object.fromEntries(factsEntries))
      } catch (err) {
        setProfileError(err.message)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => { load() }, [requestId])

  const applyStatusAction = async (e) => {
    e.preventDefault()
    const action = STATUS_ACTIONS[req.current_status]
    if (!action) return

    setError('')
    setStatusBusy(true)
    try {
      if (action.next === 'COMPLETED') {
        const readyToComplete = Boolean(
          resultForm.result_status
          && (resultForm.result_summary.trim() || resultForm.found_information.trim())
          && (genealogistDocs.length > 0 || resultForm.result_sources.trim() || resultForm.processing_comment.trim())
        )
        if (!readyToComplete) {
          throw new Error('Перед завершением заполните результат обработки и источники.')
        }
        await api.updateRequest(requestId, {
          processing_comment: resultForm.processing_comment || null,
          result_summary: resultForm.result_summary || null,
          found_information: resultForm.found_information || null,
          result_sources: resultForm.result_sources || null,
          result_recommendations: resultForm.result_recommendations || null,
          result_status: resultForm.result_status || null,
          result_persons: resultForm.result_persons,
          result_facts: resultForm.result_facts,
          result_relationships: resultForm.result_relationships,
          result_document_links: resultForm.result_document_links,
        })
      }
      const updated = await api.changeStatus(requestId, {
        new_status: action.next,
        comment: comment || action.title,
      })
      setReq(updated)
      setComment('')
      api.getHistory(requestId).then(setHistory)
    } catch (err) {
      setError(err.message)
    } finally {
      setStatusBusy(false)
    }
  }

  const requestClarification = async (e) => {
    e.preventDefault()
    setError('')
    setClarificationBusy(true)
    try {
      const updated = await api.requestClarification(requestId, {
        comment: clarificationComment,
      })
      setReq(updated)
      setClarificationComment('')
      api.getHistory(requestId).then(setHistory)
    } catch (err) {
      setError(err.message)
    } finally {
      setClarificationBusy(false)
    }
  }

  const provideClarification = async (e) => {
    e.preventDefault()
    setError('')
    setClarificationBusy(true)
    try {
      const updated = await api.provideClarification(requestId, {
        comment: clarificationResponse || null,
      })
      setReq(updated)
      setClarificationResponse('')
      api.getHistory(requestId).then(setHistory)
    } catch (err) {
      setError(err.message)
    } finally {
      setClarificationBusy(false)
    }
  }

  const startEditReq = () => {
    setEditReqForm({
      title: req.title,
      request_goal: req.request_goal ?? '',
    })
    setEditingReq(true)
  }

  const saveEditReq = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const updated = await api.updateRequest(requestId, {
        title: editReqForm.title || null,
        request_goal: editReqForm.request_goal || null,
      })
      setReq(updated)
      setEditingReq(false)
    } catch (err) { setError(err.message) }
  }

  const erf = (k) => (e) => setEditReqForm(f => ({ ...f, [k]: e.target.value }))

  const deleteDoc = async (id) => {
    if (!confirm('Удалить документ?')) return
    try {
      await api.deleteDoc(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (err) { setError(err.message) }
  }

  const uploadDoc = async (e) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_kind', user?.role === 'GENEALOGIST' ? 'ARCHIVE_SCAN' : 'ATTACHMENT')
    fd.append('archive_request_id', requestId)
    try {
      const doc = await api.uploadDoc(fd)
      setDocs(prev => [doc, ...prev])
      fileRef.current.value = ''
      setFileName('')
    } catch (err) { setError(err.message) }
  }

  const fullName = (p) =>
    [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || '—'

  const formatDateTime = (value) =>
    value ? new Date(value).toLocaleString('ru-RU') : '—'

  const formatSize = (bytes) =>
    bytes ? `${(bytes / 1024).toFixed(1)} KB` : '—'
  const fileTypeLabel = (doc) => {
    const ext = doc.file_name?.split('.').pop()?.toUpperCase()
    if (ext && ext !== doc.file_name?.toUpperCase()) return ext
    const byMime = {
      'application/pdf': 'PDF',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'image/gif': 'GIF',
      'image/webp': 'WEBP',
      'text/plain': 'TXT',
      'application/msword': 'DOC',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    }
    return byMime[doc.mime_type] || doc.mime_type || '—'
  }

  const personNameById = (personId) => {
    const person = persons.find(item => item.id === personId)
    return person ? fullName(person) : '—'
  }

  const updateConfidence = async (fact, confidence) => {
    setSavingFactId(fact.id)
    setError('')
    try {
      const updated = await api.updateFact(fact.id, { confidence })
      setFactsByPerson(prev => ({
        ...prev,
        [updated.person_id]: (prev[updated.person_id] ?? []).map(item =>
          item.id === updated.id ? updated : item
        ),
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingFactId('')
    }
  }

  const rf = (key) => (e) => {
    setResultSaved(false)
    setResultForm(prev => ({ ...prev, [key]: e.target.value }))
  }
  const updateResultCollection = (collection, index, patch) => {
    setResultSaved(false)
    setResultForm(prev => ({
      ...prev,
      [collection]: prev[collection].map((item, idx) => idx === index ? { ...item, ...patch } : item),
    }))
  }
  const addResultItem = (collection, item) => {
    setResultSaved(false)
    setResultForm(prev => ({ ...prev, [collection]: [...prev[collection], item] }))
  }
  const removeResultItem = (collection, index) => {
    setResultSaved(false)
    setResultForm(prev => ({
      ...prev,
      [collection]: prev[collection].filter((_, idx) => idx !== index),
    }))
  }
  const toggleResultDocument = (collection, index, docId) => {
    const item = resultForm[collection][index]
    const selected = new Set(item.document_ids ?? [])
    if (selected.has(docId)) selected.delete(docId)
    else selected.add(docId)
    updateResultCollection(collection, index, { document_ids: [...selected] })
  }

  const loadGeneratedDocs = async () => {
    if (user?.role !== 'GENEALOGIST') return
    const items = await api.listGeneratedDocuments(requestId)
    setGeneratedDocs(items)
  }

  const openGenerated = async (id, step = 'FIELDS') => {
    setError('')
    setWizardMessage('')
    setWizardBusy(true)
    try {
      const item = await api.getGeneratedDocument(id)
      setCurrentGenerated(item)
      setWizardStep(step)
      setWizardOpen(true)
      if (step === 'ATTACHMENTS') {
        const attachments = await api.availableGeneratedAttachments(id)
        setAvailableAttachments(attachments)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const startGeneratedWizard = () => {
    setCurrentGenerated(null)
    setAvailableAttachments([])
    setEditingFinalText(false)
    setWizardMessage('')
    setWizardStep('SELECT')
    setWizardOpen(true)
    setActiveSection('GENERATED')
  }

  const selectTemplate = async (templateId) => {
    setWizardBusy(true)
    setError('')
    try {
      const started = await api.startGeneratedDocument(requestId, { template_id: templateId })
      await loadGeneratedDocs()
      await openGenerated(started.id, 'FIELDS')
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const updateGeneratedField = (code, value) => {
    setCurrentGenerated(prev => ({
      ...prev,
      field_values: {
        ...prev.field_values,
        [code]: {
          ...(prev.field_values?.[code] ?? {}),
          value,
          autofilled: prev.field_values?.[code]?.autofilled ?? false,
          missing_autofill: false,
        },
      },
    }))
  }

  const saveGeneratedFields = async (nextStep = null) => {
    if (!currentGenerated) return
    setWizardBusy(true)
    setWizardMessage('')
    setError('')
    try {
      const updated = await api.updateGeneratedFields(currentGenerated.id, {
        field_values: currentGenerated.field_values,
      })
      const detailed = await api.getGeneratedDocument(updated.id)
      setCurrentGenerated(detailed)
      await loadGeneratedDocs()
      setWizardMessage('Черновик сохранён.')
      if (nextStep) setWizardStep(nextStep)
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const saveGeneratedDraft = async () => {
    if (!currentGenerated) return
    setWizardBusy(true)
    setError('')
    try {
      await api.saveGeneratedDraft(currentGenerated.id)
      await saveGeneratedFields()
      await loadGeneratedDocs()
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const previewGenerated = async () => {
    await saveGeneratedFields()
    if (!currentGenerated) return
    setWizardBusy(true)
    setError('')
    try {
      const preview = await api.previewGeneratedDocument(currentGenerated.id)
      setCurrentGenerated(prev => ({
        ...prev,
        generated_blocks: preview.generated_blocks,
        final_document_text: prev.final_document_text || preview.final_document_text,
      }))
      setWizardStep('PREVIEW')
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const saveFinalText = async () => {
    if (!currentGenerated) return
    setWizardBusy(true)
    setError('')
    try {
      const updated = await api.updateGeneratedFinalText(currentGenerated.id, {
        final_document_text: currentGenerated.final_document_text || '',
      })
      setCurrentGenerated(prev => ({ ...prev, ...updated }))
      setEditingFinalText(false)
      setWizardMessage('Итоговый текст сохранён.')
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const loadAvailableAttachments = async () => {
    if (!currentGenerated) return
    const items = await api.availableGeneratedAttachments(currentGenerated.id)
    setAvailableAttachments(items)
    setWizardStep('ATTACHMENTS')
  }

  const toggleGeneratedAttachment = (docId) => {
    setCurrentGenerated(prev => {
      const selected = new Set(prev.attached_document_ids ?? [])
      const titles = { ...(prev.attached_document_titles ?? {}) }
      if (selected.has(docId)) {
        selected.delete(docId)
        delete titles[docId]
      } else {
        selected.add(docId)
        const doc = availableAttachments.find(item => item.id === docId)
        titles[docId] = titles[docId] || doc?.file_name || ''
      }
      return { ...prev, attached_document_ids: [...selected], attached_document_titles: titles }
    })
  }

  const updateGeneratedAttachmentTitle = (docId, title) => {
    setCurrentGenerated(prev => ({
      ...prev,
      attached_document_titles: {
        ...(prev.attached_document_titles ?? {}),
        [docId]: title,
      },
    }))
  }

  const persistGeneratedAttachments = async () => {
    if (!currentGenerated) return
    const updated = await api.updateGeneratedAttachments(currentGenerated.id, {
      attached_document_ids: currentGenerated.attached_document_ids ?? [],
      attached_document_titles: currentGenerated.attached_document_titles ?? {},
    })
    setCurrentGenerated(prev => ({ ...prev, ...updated }))
    return updated
  }

  const saveGeneratedAttachments = async () => {
    if (!currentGenerated) return
    setWizardBusy(true)
    setError('')
    try {
      await persistGeneratedAttachments()
      setWizardMessage('Приложения сохранены.')
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const downloadGeneratedDocx = async (id = currentGenerated?.id) => {
    if (!id) return
    setError('')
    try {
      const { blob, filename } = await api.downloadGeneratedDocx(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  const exportGenerated = async () => {
    if (!currentGenerated) return
    setWizardBusy(true)
    setError('')
    try {
      if (currentGenerated.status === 'DRAFT') {
        await persistGeneratedAttachments()
      }
      const updated = await api.exportGeneratedDocument(currentGenerated.id)
      const detailed = await api.getGeneratedDocument(updated.id)
      setCurrentGenerated(detailed)
      await loadGeneratedDocs()
      setWizardMessage('Обращение сохранено как подготовленный документ.')
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const changeGeneratedStatus = async (status, generatedId = null) => {
    const targetId = generatedId || currentGenerated?.id
    if (!targetId) return
    setWizardBusy(true)
    setError('')
    try {
      const updated = await api.updateGeneratedStatus(targetId, { status })
      const detailed = await api.getGeneratedDocument(updated.id)
      if (!currentGenerated || currentGenerated.id === detailed.id) {
        setCurrentGenerated(detailed)
      }
      await loadGeneratedDocs()
    } catch (err) {
      setError(err.message)
    } finally {
      setWizardBusy(false)
    }
  }

  const saveProcessingResult = async (e) => {
    e.preventDefault()
    setError('')
    setResultSaved(false)
    try {
      const updated = await api.updateRequest(requestId, {
        processing_comment: resultForm.processing_comment || null,
        result_summary: resultForm.result_summary || null,
        found_information: resultForm.found_information || null,
        result_sources: resultForm.result_sources || null,
        result_recommendations: resultForm.result_recommendations || null,
        result_status: resultForm.result_status || null,
        result_persons: resultForm.result_persons,
        result_facts: resultForm.result_facts,
        result_relationships: resultForm.result_relationships,
        result_document_links: resultForm.result_document_links,
      })
      setReq(updated)
      setResultSaved(true)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!req) {
    return (
      <div className="page">
        {error ? <p className="error">{error}</p> : <p className="muted">Загрузка...</p>}
      </div>
    )
  }

  const isGenealogist = user?.role === 'GENEALOGIST'
  const isAdmin = user?.role === 'ADMIN'
  const isOwner = user?.id === req.created_by_user_id
  const isTerminal = ['COMPLETED', 'CANCELLED'].includes(req.current_status)
  const statusAction = STATUS_ACTIONS[req.current_status]
  const canRequestClarification = isGenealogist && !['NEEDS_CLARIFICATION', 'COMPLETED', 'CANCELLED'].includes(req.current_status)
  const canProvideClarification = isOwner && req.current_status === 'NEEDS_CLARIFICATION'
  const latestClarificationRequest = [...history]
    .reverse()
    .find(item => item.to_status === 'NEEDS_CLARIFICATION')
  const showClarificationResponse = isOwner && latestClarificationRequest
  const backPath = isGenealogist ? '/genealogist' : isAdmin ? '/admin' : `/profiles/${req.profile_id || profileId}`
  const backLabel = isGenealogist ? '← Рабочий стол' : isAdmin ? '← Панель администратора' : '← Профиль'
  const isGenealogistResultDoc = (doc) =>
    doc.archive_request_relation_type === 'GENEALOGIST_RESULT'
    || doc.source_type === 'GENEALOGIST_UPLOAD'
    || doc.document_kind === 'ARCHIVE_SCAN'
  const userDocs = docs.filter(doc => !isGenealogistResultDoc(doc))
  const genealogistDocs = docs.filter(isGenealogistResultDoc)
  const profileCreatedAt = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ru-RU') : '—'
  const profileIdForLinks = req.profile_id || profileId
  const analysisReturnTo = `${location.pathname}${location.search}`
  const canDeleteDoc = (doc) =>
    !isTerminal
    && (
      isAdmin
      || (user?.role === 'USER' && doc.uploaded_by_user_id === user.id && doc.source_type === 'USER_UPLOAD')
      || (
        isGenealogist
        && doc.uploaded_by_user_id === user.id
        && (doc.source_type === 'GENEALOGIST_UPLOAD' || doc.document_kind === 'ARCHIVE_SCAN')
      )
    )
  const documentSourceLabel = (doc) =>
    REQUEST_DOC_RELATION_LABEL[doc.archive_request_relation_type]
    || DOC_SOURCE_LABEL[doc.source_type]
    || doc.source_type
  const eventTitle = (item) => {
    if (!item.from_status) return 'Запрос подготовлен'
    if (item.to_status === 'NEEDS_CLARIFICATION') return 'Генеалог запросил дополнительные сведения'
    if (item.from_status === 'NEEDS_CLARIFICATION' && item.to_status === 'IN_PROGRESS') {
      return 'Пользователь передал сведения'
    }
    if (item.to_status === 'SENT') return 'Запрос направлен'
    if (item.to_status === 'IN_PROGRESS') return 'Запрос принят в работу'
    if (item.to_status === 'RESPONSE_RECEIVED') return 'Получен ответ'
    if (item.to_status === 'COMPLETED') return 'Запрос завершён'
    if (item.to_status === 'CANCELLED') return 'Запрос отменён'
    return `Статус изменён: ${STATUS_LABEL[item.to_status] ?? item.to_status}`
  }
  const eventMeta = (item) => {
    const from = item.from_status ? STATUS_LABEL[item.from_status] : '—'
    const to = STATUS_LABEL[item.to_status] ?? item.to_status
    return `${from} → ${to} · ${formatDateTime(item.created_at)}`
  }
  const resultReady = Boolean(
    resultForm.result_status
    && (
      resultForm.result_summary.trim()
      || resultForm.found_information.trim()
      || resultForm.result_persons.length
      || resultForm.result_facts.length
      || resultForm.result_relationships.length
    )
    && (genealogistDocs.length > 0 || resultForm.result_sources.trim() || resultForm.processing_comment.trim())
  )
  const generatedReady = generatedDocs.some(item =>
    ['PREPARED', 'EXPORTED', 'SENT_OUTSIDE_SYSTEM', 'RESPONSE_RECEIVED'].includes(item.status)
  )
  const preparedGeneratedCount = generatedDocs.filter(item => item.status !== 'DRAFT').length
  const profileFactsCount = Object.values(factsByPerson).reduce((sum, facts) => sum + facts.length, 0)
  const resultItemsCount = (
    resultForm.result_persons.length
    + resultForm.result_facts.length
    + resultForm.result_relationships.length
    + resultForm.result_document_links.length
  )
  const hasStructuredResult = Boolean(
    (req.result_persons?.length ?? 0)
    || (req.result_facts?.length ?? 0)
    || (req.result_relationships?.length ?? 0)
    || (req.result_document_links?.length ?? 0)
  )
  const nextStep = (() => {
    if (req.current_status === 'NEEDS_CLARIFICATION') {
      return {
        title: 'Ожидается ответ пользователя',
        description: 'Пользователь должен передать дополнительные сведения или загрузить документы. После ответа запрос вернётся в обработку.',
        section: 'CLARIFICATION',
      }
    }
    if (isTerminal) {
      return {
        title: 'Работа по запросу завершена',
        description: 'Запрос больше нельзя редактировать. Проверьте итог, документы и историю при необходимости.',
        section: 'RESULT',
      }
    }
    if (!profileError && persons.length === 0) {
      return {
        title: 'Проверьте связанный профиль',
        description: 'В профиле нет персон или сведения ещё загружаются. Начните с анализа профиля и материалов пользователя.',
        section: 'PROFILE',
      }
    }
    if (generatedDocs.length === 0) {
      return {
        title: 'Сформируйте архивное обращение',
        description: 'Выберите активный шаблон, заполните поля, проверьте текст и сохраните обращение как подготовленный документ.',
        section: 'GENERATED',
      }
    }
    if (!generatedReady) {
      return {
        title: 'Продолжите подготовку архивного обращения',
        description: 'Есть черновик обращения. Завершите заполнение, предпросмотр и выбор приложений.',
        section: 'GENERATED',
      }
    }
    if (!resultReady) {
      return {
        title: 'Зафиксируйте результат обработки',
        description: 'Заполните итог, найденные сведения, источники и загрузите найденные документы или поясните их отсутствие.',
        section: 'RESULT',
      }
    }
    return {
      title: 'Завершите обработку запроса',
      description: 'Результат заполнен. Можно перевести запрос на следующий этап или завершить обработку.',
      section: 'RESULT',
    }
  })()
  const showUserResultSummary = isOwner && ['RESPONSE_RECEIVED', 'COMPLETED'].includes(req.current_status)
  const canUploadDoc = !isTerminal
  const canEditRequest = !isTerminal && !editingReq
  const sectionVisible = (section) => !isGenealogist || activeSection === section
  const genealogistSections = [
    ['OVERVIEW', 'Обзор'],
    ['PROFILE', 'Профиль'],
    ['DOCS', 'Документы'],
    ['CLARIFICATION', 'Доп. сведения'],
    ['GENERATED', 'Архивные обращения'],
    ['RESULT', 'Результат'],
    ['HISTORY', 'История'],
  ]

  return (
    <div className="page wide">
      <div style={{ marginBottom: 16 }}>
        <span className="link" onClick={() => nav(backPath)}>{backLabel}</span>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22 }}>{req.title}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Создан: {formatDateTime(req.created_at)}
            {req.updated_at ? ` · Обновлен: ${formatDateTime(req.updated_at)}` : ''}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${req.current_status.toLowerCase()}`}>
            {STATUS_LABEL[req.current_status]}
          </span>
          {canEditRequest && (
            <button className="outline sm" onClick={startEditReq}>Редактировать</button>
          )}
        </div>
      </div>

      {showUserResultSummary && (
        <section
          className="card"
          style={{
            marginBottom: 16,
            borderColor: '#c9d8c2',
            background: '#f5fbef',
          }}
        >
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div className="label">Результат архивного запроса</div>
              <h2 style={{ marginTop: 2 }}>
                {RESULT_STATUS_LABEL[req.result_status] || 'Результат готовится'}
              </h2>
            </div>
            <span className={`badge ${req.current_status.toLowerCase()}`}>
              {STATUS_LABEL[req.current_status]}
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="label">Краткий вывод</div>
            <p>{req.result_summary || req.found_information || 'Генеалог пока не заполнил итоговый вывод.'}</p>
          </div>

          {hasStructuredResult && (
            <>
              <StructuredResultRead request={req} documents={genealogistDocs} persons={persons} embedded />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
                Найденные персоны, факты и связи показаны как результат исследования. Профиль не изменяется автоматически.
              </p>
            </>
          )}

          {genealogistDocs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="label">Полученные документы</div>
              <p>{genealogistDocs.length} файл(ов) доступно в блоке документов ниже.</p>
            </div>
          )}

          {req.result_recommendations && (
            <div>
              <div className="label">Что дальше</div>
              <p>{req.result_recommendations}</p>
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 170, flex: '1 1 170px' }}>
            <div className="label">Статус результата</div>
            <strong>{RESULT_STATUS_LABEL[req.result_status] || 'Не указан'}</strong>
          </div>
          <div style={{ minWidth: 170, flex: '1 1 170px' }}>
            <div className="label">Материалы пользователя</div>
            <strong>{userDocs.length}</strong>
          </div>
          <div style={{ minWidth: 170, flex: '1 1 170px' }}>
            <div className="label">Документы результата</div>
            <strong>{genealogistDocs.length}</strong>
          </div>
        </div>
        {req.request_goal && (
          <div style={{ marginTop: 12 }}>
            <div className="label">Цель запроса</div>
            <p>{req.request_goal}</p>
          </div>
        )}
      </section>

      {editingReq && !isTerminal && (
        <form onSubmit={saveEditReq} className="card col" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Редактирование запроса</h3>
          <div className="col">
            <label className="label">Название</label>
            <input value={editReqForm.title} onChange={erf('title')} required />
          </div>
          <div className="col">
            <label className="label">Цель запроса</label>
            <textarea value={editReqForm.request_goal} onChange={erf('request_goal')} rows={2} />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">Сохранить</button>
            <button type="button" className="outline" onClick={() => setEditingReq(false)}>Отмена</button>
          </div>
        </form>
      )}

      {isGenealogist && (
        <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {genealogistSections.map(([value, label]) => (
            <button
              key={value}
              className={activeSection === value ? 'sm' : 'outline sm'}
              onClick={() => setActiveSection(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: sectionVisible('OVERVIEW') ? undefined : 'none' }}>
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="label">Следующий шаг</div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 4 }}>
            <div>
              <h2>{nextStep.title}</h2>
              <p className="muted" style={{ marginTop: 4 }}>{nextStep.description}</p>
            </div>
            <button className="sm" onClick={() => setActiveSection(nextStep.section)}>
              Перейти
            </button>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="label">Текущий статус запроса</div>
              <h2 style={{ marginTop: 2 }}>{STATUS_LABEL[req.current_status] || req.current_status}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                {latestClarificationRequest && req.current_status === 'NEEDS_CLARIFICATION'
                  ? 'Ожидается ответ пользователя на запрос дополнительных сведений.'
                  : nextStep.description}
              </p>
            </div>
            <span className={`badge ${req.current_status.toLowerCase()}`}>
              {STATUS_LABEL[req.current_status] || req.current_status}
            </span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="outline sm" onClick={() => setActiveSection(nextStep.section)}>
              Перейти к следующему шагу
            </button>
            {req.current_status !== 'NEEDS_CLARIFICATION' && !isTerminal && (
              <button className="outline sm" onClick={() => setActiveSection('CLARIFICATION')}>
                Запросить доп. сведения
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 12 }}>Краткая сводка</h2>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <OverviewMetric label="Персоны профиля" value={persons.length} />
            <OverviewMetric label="Факты профиля" value={profileFactsCount} />
            <OverviewMetric label="Материалы пользователя" value={userDocs.length} />
            <OverviewMetric label="Архивные обращения" value={generatedDocs.length} />
            <OverviewMetric label="Подготовленные обращения" value={preparedGeneratedCount} />
            <OverviewMetric label="Документы результата" value={genealogistDocs.length} />
            <OverviewMetric label="Элементы результата" value={resultItemsCount} />
          </div>
        </section>
      </div>

      <div style={{ display: sectionVisible('PROFILE') ? undefined : 'none' }}>
      <h2 style={{ margin: '16px 0 10px' }}>Связанный профиль</h2>
      <section className="card" style={{ marginBottom: 16 }}>
        {profile ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, alignItems: 'flex-start' }}>
              <div>
                <h3>{profile.title}</h3>
                {profile.description && (
                  <p className="muted" style={{ marginTop: 4 }}>{profile.description}</p>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="outline sm"
                  onClick={() => nav(`/profiles/${profileIdForLinks}`, {
                    state: { returnTo: analysisReturnTo },
                  })}
                >
                  Профиль
                </button>
                <button
                  className="outline sm"
                  onClick={() => nav(`/profiles/${profileIdForLinks}/tree`, {
                    state: {
                      returnTo: analysisReturnTo,
                      treeBackTo: analysisReturnTo,
                    },
                  })}
                >
                  Древо
                </button>
              </div>
            </div>

            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 150, flex: '1 1 150px', border: '1px solid #ddd4c0', borderRadius: 8, padding: 12, background: '#fdfaf4' }}>
                <div className="label">Персоны</div>
                <strong style={{ fontSize: 22 }}>{persons.length}</strong>
              </div>
              <div style={{ minWidth: 150, flex: '1 1 150px', border: '1px solid #ddd4c0', borderRadius: 8, padding: 12, background: '#fdfaf4' }}>
                <div className="label">Связи</div>
                <strong style={{ fontSize: 22 }}>{relationships.length}</strong>
              </div>
              <div style={{ minWidth: 150, flex: '1 1 150px', border: '1px solid #ddd4c0', borderRadius: 8, padding: 12, background: '#fdfaf4' }}>
                <div className="label">Факты</div>
                <strong style={{ fontSize: 22 }}>
                  {Object.values(factsByPerson).reduce((sum, facts) => sum + facts.length, 0)}
                </strong>
              </div>
              <div style={{ minWidth: 150, flex: '1 1 150px', border: '1px solid #ddd4c0', borderRadius: 8, padding: 12, background: '#fdfaf4' }}>
                <div className="label">Документы запроса</div>
                <strong style={{ fontSize: 22 }}>{docs.length}</strong>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="label">Сведения профиля</div>
              <p className="muted">
                Создан: {profileCreatedAt}.
              </p>
            </div>
          </>
        ) : profileLoading ? (
          <p className="muted">Загрузка профиля...</p>
        ) : profileError ? (
          <p className="error">{profileError}</p>
        ) : (
          <p className="muted">Профиль не загружен.</p>
        )}
      </section>
      </div>

      <div style={{ display: sectionVisible('RESULT') ? undefined : 'none' }}>
      <hr />

      <h2 style={{ margin: '16px 0 10px' }}>Результат обработки</h2>
      {isGenealogist ? (
        <form onSubmit={saveProcessingResult} className="card col" style={{ marginBottom: 16 }}>
          <div className="col">
            <label className="label">Итог обработки</label>
            <select value={resultForm.result_status} onChange={rf('result_status')} disabled={isTerminal}>
              <option value="">Не указан</option>
              {Object.entries(RESULT_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col">
            <label className="label">Краткий вывод</label>
            <textarea
              value={resultForm.result_summary}
              onChange={rf('result_summary')}
              disabled={isTerminal}
              rows={2}
              placeholder="Короткий итог для пользователя"
            />
          </div>
          <div className="col">
            <label className="label">Комментарий генеалога</label>
            <textarea
              value={resultForm.processing_comment}
              onChange={rf('processing_comment')}
              disabled={isTerminal}
              rows={3}
              placeholder="Рабочий комментарий по обработке запроса"
            />
          </div>
          <div className="col">
            <label className="label">Найденные сведения</label>
            <textarea
              value={resultForm.found_information}
              onChange={rf('found_information')}
              disabled={isTerminal}
              rows={4}
              placeholder="Итоговые сведения, найденные в архивных источниках"
            />
          </div>
          <StructuredResultEditor
            resultForm={resultForm}
            persons={persons}
            documents={genealogistDocs}
            disabled={isTerminal}
            updateItem={updateResultCollection}
            addItem={addResultItem}
            removeItem={removeResultItem}
            toggleDocument={toggleResultDocument}
          />
          <div className="col">
            <label className="label">Источники</label>
            <textarea
              value={resultForm.result_sources}
              onChange={rf('result_sources')}
              disabled={isTerminal}
              rows={3}
              placeholder="Архивные шифры, фонды, описи, дела или пояснение, почему документы не приложены"
            />
          </div>
          <div className="col">
            <label className="label">Рекомендации по дальнейшему поиску</label>
            <textarea
              value={resultForm.result_recommendations}
              onChange={rf('result_recommendations')}
              disabled={isTerminal}
              rows={3}
              placeholder="Что можно проверить дальше"
            />
          </div>
          {!resultReady && (
            <p className="muted">
              Для завершения запроса укажите итог обработки, краткий вывод или найденные сведения, а также загрузите документ результата или заполните источники/комментарий.
            </p>
          )}
          {resultSaved && <p style={{ color: '#16a34a' }}>Результат сохранён.</p>}
          <div>
            <button type="submit" disabled={isTerminal}>
              {isTerminal ? 'Результат зафиксирован' : 'Сохранить результат'}
            </button>
          </div>
        </form>
      ) : (
        <section className="card">
          <div style={{ marginBottom: 12 }}>
            <div className="label">Итог обработки</div>
            <p>{RESULT_STATUS_LABEL[req.result_status] || '—'}</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Краткий вывод</div>
            <p>{req.result_summary || '—'}</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Комментарий генеалога</div>
            <p>{req.processing_comment || '—'}</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Найденные сведения</div>
            <p>{req.found_information || '—'}</p>
          </div>
          <StructuredResultRead request={req} documents={genealogistDocs} persons={persons} />
          <div style={{ marginBottom: 12 }}>
            <div className="label">Источники</div>
            <p>{req.result_sources || '—'}</p>
          </div>
          <div>
            <div className="label">Рекомендации</div>
            <p>{req.result_recommendations || '—'}</p>
          </div>
        </section>
      )}
      </div>

      <div style={{ display: sectionVisible('CLARIFICATION') ? undefined : 'none' }}>
      <hr />
      <h2 style={{ margin: '16px 0 10px' }}>Дополнительные сведения</h2>

      {canRequestClarification && (
        <div style={{ margin: '16px 0' }}>
          <form onSubmit={requestClarification} className="card col" style={{ maxWidth: 520 }}>
            <div>
              <strong>Запросить доп. сведения</strong>
              <p className="muted" style={{ marginTop: 4 }}>
                Пользователь увидит запрос, сможет загрузить материалы и передать сведения обратно в работу.
              </p>
            </div>
            <textarea
              placeholder="Что именно нужно уточнить?"
              value={clarificationComment}
              onChange={e => setClarificationComment(e.target.value)}
              rows={3}
              required
            />
            {error && <p className="error">{error}</p>}
            <div>
              <button type="submit" disabled={clarificationBusy}>
                {clarificationBusy ? 'Отправка...' : 'Запросить доп. сведения'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isGenealogist && req.current_status === 'NEEDS_CLARIFICATION' && (
        <section className="card" style={{ marginBottom: 16 }}>
          <strong>Ожидается ответ пользователя</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Запрос дополнительных сведений уже отправлен. После ответа пользователя статус вернётся в обработку.
          </p>
          {latestClarificationRequest && (
            <div style={{ marginTop: 10 }}>
              <div className="label">Что запрошено</div>
              <p>{latestClarificationRequest.comment || 'Дополнительные сведения по запросу.'}</p>
            </div>
          )}
        </section>
      )}

      {isGenealogist && !canRequestClarification && req.current_status !== 'NEEDS_CLARIFICATION' && (
        <section className="card" style={{ marginBottom: 16 }}>
          <p className="muted">
            Для текущего статуса запрос дополнительных сведений недоступен.
          </p>
        </section>
      )}

      {showClarificationResponse && (
        <div style={{ margin: '16px 0' }}>
          <h2 style={{ marginBottom: 10 }}>Ответ на запрос сведений</h2>
          <form onSubmit={provideClarification} className="card col" style={{ maxWidth: 520 }}>
            <div>
              <strong>Передать сведения генеалогу</strong>
              <p className="muted" style={{ marginTop: 4 }}>
                При необходимости загрузите документы ниже, затем отправьте комментарий генеалогу.
              </p>
            </div>
            <div>
              <div className="label">Запрос генеалога</div>
              <p>{latestClarificationRequest.comment || 'Генеалог запросил дополнительные сведения.'}</p>
            </div>
            <textarea
              placeholder="Комментарий для генеалога"
              value={clarificationResponse}
              onChange={e => setClarificationResponse(e.target.value)}
              rows={3}
              disabled={!canProvideClarification}
            />
            {error && <p className="error">{error}</p>}
            <div>
              <button type="submit" disabled={clarificationBusy || !canProvideClarification}>
                {canProvideClarification
                  ? (clarificationBusy ? 'Отправка...' : 'Передать сведения')
                  : 'Сведения переданы'}
              </button>
            </div>
          </form>
        </div>
      )}

      {(canRequestClarification || showClarificationResponse) && <hr />}
      </div>

      <div style={{ display: sectionVisible('RESULT') ? undefined : 'none' }}>
      {isGenealogist && statusAction && (
        <div style={{ margin: '16px 0' }}>
          <h2 style={{ marginBottom: 10 }}>Действие по запросу</h2>
          <form onSubmit={applyStatusAction} className="card col" style={{ maxWidth: 520 }}>
            <div>
              <strong>{statusAction.title}</strong>
              <p className="muted" style={{ marginTop: 4 }}>
                {statusAction.description} Новый статус: {STATUS_LABEL[statusAction.next]}.
              </p>
            </div>
            <input
              placeholder="Комментарий (необязательно)"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div>
              <button type="submit" disabled={statusBusy}>
                {statusBusy ? 'Сохранение...' : statusAction.title}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>

      {isGenealogist && (
        <div style={{ display: sectionVisible('GENERATED') ? undefined : 'none' }}>
          <hr />
          <GeneratedRequestsSection
            request={req}
            templates={activeTemplates}
            generatedDocs={generatedDocs}
            wizardOpen={wizardOpen}
            wizardStep={wizardStep}
            currentGenerated={currentGenerated}
            availableAttachments={availableAttachments}
            wizardBusy={wizardBusy}
            wizardMessage={wizardMessage}
            editingFinalText={editingFinalText}
            formatDateTime={formatDateTime}
            startGeneratedWizard={startGeneratedWizard}
            selectTemplate={selectTemplate}
            openGenerated={openGenerated}
            updateGeneratedField={updateGeneratedField}
            saveGeneratedFields={saveGeneratedFields}
            saveGeneratedDraft={saveGeneratedDraft}
            previewGenerated={previewGenerated}
            setCurrentGenerated={setCurrentGenerated}
            setEditingFinalText={setEditingFinalText}
            saveFinalText={saveFinalText}
            loadAvailableAttachments={loadAvailableAttachments}
            toggleGeneratedAttachment={toggleGeneratedAttachment}
            updateGeneratedAttachmentTitle={updateGeneratedAttachmentTitle}
            saveGeneratedAttachments={saveGeneratedAttachments}
            exportGenerated={exportGenerated}
            downloadGeneratedDocx={downloadGeneratedDocx}
            changeGeneratedStatus={changeGeneratedStatus}
            setWizardOpen={setWizardOpen}
            setWizardStep={setWizardStep}
          />
        </div>
      )}

      <div style={{ display: sectionVisible('HISTORY') ? undefined : 'none' }}>
      <hr />

      <h2 style={{ margin: '16px 0 10px' }}>История запроса</h2>
      {history.length === 0 ? (
        <p className="muted">Нет истории.</p>
      ) : (
        <section className="card col" style={{ gap: 12 }}>
          {history.map(h => (
            <div key={h.id} style={{ borderLeft: '3px solid #d0c4b0', paddingLeft: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{eventTitle(h)}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{eventMeta(h)}</div>
                </div>
                <span className={`badge ${h.to_status.toLowerCase()}`}>
                  {STATUS_LABEL[h.to_status] ?? h.to_status}
                </span>
              </div>
              {h.comment && (
                <p style={{ marginTop: 6 }}>{h.comment}</p>
              )}
            </div>
          ))}
        </section>
      )}
      </div>

      <div style={{ display: sectionVisible('DOCS') ? undefined : 'none' }}>
      <hr />

      {/* Documents */}
      <h2 style={{ margin: '16px 0 10px' }}>Документы</h2>
      {canUploadDoc ? (
        <form onSubmit={uploadDoc} className="row" style={{ marginBottom: 12 }}>
          <input type="file" ref={fileRef} style={{ flex: 1 }} required />
          <button type="submit">
            {isGenealogist ? 'Загрузить результат' : 'Загрузить документ'}
          </button>
        </form>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>
          Запрос завершён или отменён, загрузка и удаление документов недоступны.
        </p>
      )}

      {[
        ['Исходные и дополнительные материалы', userDocs],
        [isOwner ? 'Полученные документы' : 'Найденные документы и результаты', genealogistDocs],
      ].map(([title, items]) => (
        <section key={title} className="card" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3>{title}</h3>
            <span className="badge">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <p className="muted">Нет документов.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Файл</th><th>Тип</th><th>Источник</th><th>Дата</th><th>Размер</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(d => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.file_name}</strong>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{fileTypeLabel(d)}</div>
                    </td>
                    <td className="muted">{DOC_KIND_LABEL[d.document_kind] ?? d.document_kind}</td>
                    <td>{documentSourceLabel(d)}</td>
                    <td className="muted">{formatDateTime(d.created_at)}</td>
                    <td className="muted">{formatSize(d.file_size_bytes)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <a
                        href="#"
                        style={{ marginRight: 12 }}
                        onClick={e => {
                          e.preventDefault()
                          const token = localStorage.getItem('token')
                          fetch(`/api/v1/documents/${d.id}/download`, {
                            headers: { Authorization: `Bearer ${token}` }
                          }).then(r => r.blob()).then(blob => {
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url; a.download = d.file_name; a.click()
                            URL.revokeObjectURL(url)
                          })
                        }}
                      >Скачать</a>
                      {canDeleteDoc(d) && (
                        <button className="danger sm" onClick={() => deleteDoc(d.id)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      </div>
    </div>
  )
}

function OverviewMetric({ label, value }) {
  return (
    <div style={{
      minWidth: 160,
      flex: '1 1 160px',
      border: '1px solid #ddd4c0',
      borderRadius: 7,
      padding: 12,
      background: '#fdfaf4',
    }}>
      <div className="label">{label}</div>
      <strong>{value}</strong>
    </div>
  )
}

function newResultId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function docName(documents, docId) {
  return documents.find(doc => doc.id === docId)?.file_name || 'Документ'
}

function personName(person) {
  return [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(' ') || 'Без имени'
}

function resultDateRange(item) {
  const parts = []
  if (item.birth_date) parts.push(`род. ${item.birth_date}`)
  if (item.birth_place) parts.push(item.birth_place)
  if (item.death_date) parts.push(`ум. ${item.death_date}`)
  if (item.death_place) parts.push(item.death_place)
  return parts.join(' · ')
}

function evidenceNames(documents, ids = []) {
  return ids.map(id => docName(documents, id)).filter(Boolean).join(', ')
}

function ResultSectionHeader({ title, count, action }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <h3>{title}</h3>
        <span className="badge">{count}</span>
      </div>
      {action}
    </div>
  )
}

function ResultReadBlock({ title, count, children }) {
  if (!count) return null
  return (
    <div style={{ borderTop: '1px solid #ddd4c0', paddingTop: 10 }}>
      <div className="label" style={{ marginBottom: 6 }}>{title}</div>
      <div className="col" style={{ gap: 8 }}>{children}</div>
    </div>
  )
}

function ResultReadItem({ title, meta, text, evidence }) {
  return (
    <div style={{ border: '1px solid #ddd4c0', borderRadius: 7, padding: 10, background: '#fdfaf4' }}>
      <strong>{title}</strong>
      {meta && <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{meta}</p>}
      {text && <p style={{ marginTop: 4 }}>{text}</p>}
      {evidence && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Основания: {evidence}</p>}
    </div>
  )
}

function DocumentEvidencePicker({ documents, selected = [], disabled, onToggle }) {
  if (documents.length === 0) {
    return <p className="muted" style={{ fontSize: 12 }}>Документы результата пока не загружены.</p>
  }
  const selectedSet = new Set(selected)
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="label">Документы-основания</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {documents.map(doc => (
          <label key={doc.id} className="row" style={{ gap: 4 }}>
            <input
              type="checkbox"
              checked={selectedSet.has(doc.id)}
              disabled={disabled}
              onChange={() => onToggle(doc.id)}
            />
            <span style={{ fontSize: 12 }}>{doc.file_name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function StructuredResultEditor({
  resultForm,
  persons,
  documents,
  disabled,
  updateItem,
  addItem,
  removeItem,
  toggleDocument,
}) {
  const personOptions = [
    ...persons.map(person => ({
      value: `profile:${person.id}`,
      label: `Персона профиля: ${personName(person)}`,
    })),
    ...resultForm.result_persons.map(person => ({
      value: `result:${person.id}`,
      label: `Найденная персона: ${person.full_name || 'Без имени'}`,
    })),
  ]

  return (
    <section className="card col" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3>Структурированные находки</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            Эти данные не изменяют профиль. Пользователь сможет перенести их в профиль самостоятельно.
          </p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="badge">Персоны: {resultForm.result_persons.length}</span>
          <span className="badge">Факты: {resultForm.result_facts.length}</span>
          <span className="badge">Связи: {resultForm.result_relationships.length}</span>
          <span className="badge">Основания: {resultForm.result_document_links.length}</span>
        </div>
      </div>

      <div className="col">
        <ResultSectionHeader
          title="Найденные персоны"
          count={resultForm.result_persons.length}
          action={(
            <button
              type="button"
              className="outline sm"
              disabled={disabled}
              onClick={() => addItem('result_persons', {
                id: newResultId(),
                full_name: '',
                sex: 'UNKNOWN',
                birth_date: '',
                birth_place: '',
                death_date: '',
                death_place: '',
                comment: '',
                document_ids: [],
              })}
            >
              Добавить персону
            </button>
          )}
        />
        {resultForm.result_persons.length === 0 ? (
          <p className="muted">Найденные персоны не добавлены.</p>
        ) : resultForm.result_persons.map((person, index) => (
          <div key={person.id} className="col" style={{ border: '1px solid #ddd4c0', borderRadius: 7, padding: 12 }}>
            <div className="row">
              <input
                value={person.full_name || ''}
                disabled={disabled}
                onChange={e => updateItem('result_persons', index, { full_name: e.target.value })}
                placeholder="ФИО найденной персоны"
                style={{ flex: 1 }}
              />
              <select
                value={person.sex || 'UNKNOWN'}
                disabled={disabled}
                onChange={e => updateItem('result_persons', index, { sex: e.target.value })}
              >
                {Object.entries(SEX_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" className="danger sm" disabled={disabled} onClick={() => removeItem('result_persons', index)}>Удалить</button>
            </div>
            <div className="row">
              <input type="date" value={person.birth_date || ''} disabled={disabled} onChange={e => updateItem('result_persons', index, { birth_date: e.target.value })} />
              <input value={person.birth_place || ''} disabled={disabled} onChange={e => updateItem('result_persons', index, { birth_place: e.target.value })} placeholder="Место рождения" style={{ flex: 1 }} />
            </div>
            <div className="row">
              <input type="date" value={person.death_date || ''} disabled={disabled} onChange={e => updateItem('result_persons', index, { death_date: e.target.value })} />
              <input value={person.death_place || ''} disabled={disabled} onChange={e => updateItem('result_persons', index, { death_place: e.target.value })} placeholder="Место смерти" style={{ flex: 1 }} />
            </div>
            <textarea value={person.comment || ''} disabled={disabled} onChange={e => updateItem('result_persons', index, { comment: e.target.value })} placeholder="Комментарий и пояснение находки" rows={2} />
            <DocumentEvidencePicker documents={documents} selected={person.document_ids} disabled={disabled} onToggle={docId => toggleDocument('result_persons', index, docId)} />
          </div>
        ))}
      </div>

      <div className="col">
        <ResultSectionHeader
          title="Найденные факты"
          count={resultForm.result_facts.length}
          action={(
            <button
              type="button"
              className="outline sm"
              disabled={disabled}
              onClick={() => addItem('result_facts', {
                id: newResultId(),
                person_ref: '',
                fact_type: 'BIRTH',
                fact_date: '',
                place: '',
                value_text: '',
                confidence: 'PROBABLE',
                comment: '',
                document_ids: [],
              })}
            >
              Добавить факт
            </button>
          )}
        />
        {resultForm.result_facts.length === 0 ? (
          <p className="muted">Найденные факты не добавлены.</p>
        ) : resultForm.result_facts.map((fact, index) => (
          <div key={fact.id} className="col" style={{ border: '1px solid #ddd4c0', borderRadius: 7, padding: 12 }}>
            <div className="row">
              <select value={fact.person_ref || ''} disabled={disabled} onChange={e => updateItem('result_facts', index, { person_ref: e.target.value })} style={{ flex: 1 }}>
                <option value="">Персона не выбрана</option>
                {personOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={fact.fact_type || 'BIRTH'} disabled={disabled} onChange={e => updateItem('result_facts', index, { fact_type: e.target.value })}>
                {Object.entries(FACT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" className="danger sm" disabled={disabled} onClick={() => removeItem('result_facts', index)}>Удалить</button>
            </div>
            <div className="row">
              <input type="date" value={fact.fact_date || ''} disabled={disabled} onChange={e => updateItem('result_facts', index, { fact_date: e.target.value })} />
              <input value={fact.place || ''} disabled={disabled} onChange={e => updateItem('result_facts', index, { place: e.target.value })} placeholder="Место" style={{ flex: 1 }} />
              <select value={fact.confidence || 'PROBABLE'} disabled={disabled} onChange={e => updateItem('result_facts', index, { confidence: e.target.value })}>
                {CONF_OPTIONS.map(value => <option key={value} value={value}>{CONF_LABEL[value]}</option>)}
              </select>
            </div>
            <textarea value={fact.value_text || ''} disabled={disabled} onChange={e => updateItem('result_facts', index, { value_text: e.target.value })} placeholder="Содержание факта" rows={2} />
            <textarea value={fact.comment || ''} disabled={disabled} onChange={e => updateItem('result_facts', index, { comment: e.target.value })} placeholder="Комментарий" rows={2} />
            <DocumentEvidencePicker documents={documents} selected={fact.document_ids} disabled={disabled} onToggle={docId => toggleDocument('result_facts', index, docId)} />
          </div>
        ))}
      </div>

      <div className="col">
        <ResultSectionHeader
          title="Найденные связи"
          count={resultForm.result_relationships.length}
          action={(
            <button
              type="button"
              className="outline sm"
              disabled={disabled}
              onClick={() => addItem('result_relationships', {
                id: newResultId(),
                source_ref: '',
                target_ref: '',
                relationship_type: 'PARENT_CHILD',
                confidence: 'PROBABLE',
                comment: '',
                document_ids: [],
              })}
            >
              Добавить связь
            </button>
          )}
        />
        {resultForm.result_relationships.length === 0 ? (
          <p className="muted">Найденные связи не добавлены.</p>
        ) : resultForm.result_relationships.map((rel, index) => (
          <div key={rel.id} className="col" style={{ border: '1px solid #ddd4c0', borderRadius: 7, padding: 12 }}>
            <div className="row">
              <select value={rel.source_ref || ''} disabled={disabled} onChange={e => updateItem('result_relationships', index, { source_ref: e.target.value })} style={{ flex: 1 }}>
                <option value="">Первая персона</option>
                {personOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={rel.target_ref || ''} disabled={disabled} onChange={e => updateItem('result_relationships', index, { target_ref: e.target.value })} style={{ flex: 1 }}>
                <option value="">Вторая персона</option>
                {personOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="row">
              <select value={rel.relationship_type || 'PARENT_CHILD'} disabled={disabled} onChange={e => updateItem('result_relationships', index, { relationship_type: e.target.value })}>
                {Object.entries(REL_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={rel.confidence || 'PROBABLE'} disabled={disabled} onChange={e => updateItem('result_relationships', index, { confidence: e.target.value })}>
                {CONF_OPTIONS.map(value => <option key={value} value={value}>{CONF_LABEL[value]}</option>)}
              </select>
              <button type="button" className="danger sm" disabled={disabled} onClick={() => removeItem('result_relationships', index)}>Удалить</button>
            </div>
            <textarea value={rel.comment || ''} disabled={disabled} onChange={e => updateItem('result_relationships', index, { comment: e.target.value })} placeholder="Комментарий к связи" rows={2} />
            <DocumentEvidencePicker documents={documents} selected={rel.document_ids} disabled={disabled} onToggle={docId => toggleDocument('result_relationships', index, docId)} />
          </div>
        ))}
      </div>

      <div className="col">
        <ResultSectionHeader
          title="Документы-основания"
          count={resultForm.result_document_links.length}
          action={(
            <button
              type="button"
              className="outline sm"
              disabled={disabled || documents.length === 0}
              onClick={() => addItem('result_document_links', {
                id: newResultId(),
                document_id: documents[0]?.id || '',
                comment: '',
              })}
            >
              Добавить ссылку
            </button>
          )}
        />
        {resultForm.result_document_links.length === 0 ? (
          <p className="muted">Общие ссылки на документы не добавлены.</p>
        ) : resultForm.result_document_links.map((link, index) => (
          <div key={link.id} className="row">
            <select value={link.document_id || ''} disabled={disabled} onChange={e => updateItem('result_document_links', index, { document_id: e.target.value })} style={{ flex: 1 }}>
              {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.file_name}</option>)}
            </select>
            <input value={link.comment || ''} disabled={disabled} onChange={e => updateItem('result_document_links', index, { comment: e.target.value })} placeholder="Что подтверждает документ" style={{ flex: 1 }} />
            <button type="button" className="danger sm" disabled={disabled} onClick={() => removeItem('result_document_links', index)}>Удалить</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function StructuredResultRead({ request, documents, persons: profilePersons = [], embedded = false }) {
  const resultPersons = request.result_persons ?? []
  const facts = request.result_facts ?? []
  const relationships = request.result_relationships ?? []
  const links = request.result_document_links ?? []
  const refLabel = ref => {
    if (!ref) return '—'
    const [scope, id] = ref.split(':')
    if (scope === 'profile') return personName(profilePersons.find(person => person.id === id) ?? {})
    if (scope === 'result') return request.result_persons?.find(person => person.id === id)?.full_name || 'Найденная персона'
    return ref
  }
  if (!resultPersons.length && !facts.length && !relationships.length && !links.length) return null
  const Wrapper = embedded ? 'div' : 'section'
  return (
    <Wrapper className={embedded ? 'col' : 'card col'} style={{ gap: 10, marginBottom: embedded ? 12 : 12 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="badge">Персоны: {resultPersons.length}</span>
        <span className="badge">Факты: {facts.length}</span>
        <span className="badge">Связи: {relationships.length}</span>
        <span className="badge">Основания: {links.length}</span>
      </div>

      <ResultReadBlock title="Найденные персоны" count={resultPersons.length}>
        {resultPersons.map(person => (
          <ResultReadItem
            key={person.id}
            title={person.full_name || 'Без имени'}
            meta={[SEX_LABEL[person.sex], resultDateRange(person)].filter(Boolean).join(' · ')}
            text={person.comment}
            evidence={evidenceNames(documents, person.document_ids)}
          />
        ))}
      </ResultReadBlock>

      <ResultReadBlock title="Найденные факты" count={facts.length}>
        {facts.map(fact => (
          <ResultReadItem
            key={fact.id}
            title={FACT_LABEL[fact.fact_type] || fact.fact_type || 'Факт'}
            meta={[
              refLabel(fact.person_ref),
              fact.fact_date,
              fact.place,
              CONF_LABEL[fact.confidence],
            ].filter(Boolean).join(' · ')}
            text={[fact.value_text, fact.comment].filter(Boolean).join(' — ')}
            evidence={evidenceNames(documents, fact.document_ids)}
          />
        ))}
      </ResultReadBlock>

      <ResultReadBlock title="Найденные связи" count={relationships.length}>
        {relationships.map(rel => (
          <ResultReadItem
            key={rel.id}
            title={REL_LABEL[rel.relationship_type] || rel.relationship_type || 'Связь'}
            meta={`${refLabel(rel.source_ref)} → ${refLabel(rel.target_ref)}${rel.confidence ? ` · ${CONF_LABEL[rel.confidence]}` : ''}`}
            text={rel.comment}
            evidence={evidenceNames(documents, rel.document_ids)}
          />
        ))}
      </ResultReadBlock>

      <ResultReadBlock title="Документы-основания" count={links.length}>
        {links.map(link => (
          <ResultReadItem
            key={link.id}
            title={docName(documents, link.document_id)}
            text={link.comment}
          />
        ))}
      </ResultReadBlock>
    </Wrapper>
  )
}

function GeneratedRequestsSection({
  request,
  templates,
  generatedDocs,
  wizardOpen,
  wizardStep,
  currentGenerated,
  availableAttachments,
  wizardBusy,
  wizardMessage,
  editingFinalText,
  formatDateTime,
  startGeneratedWizard,
  selectTemplate,
  openGenerated,
  updateGeneratedField,
  saveGeneratedFields,
  saveGeneratedDraft,
  previewGenerated,
  setCurrentGenerated,
  setEditingFinalText,
  saveFinalText,
  loadAvailableAttachments,
  toggleGeneratedAttachment,
  updateGeneratedAttachmentTitle,
  saveGeneratedAttachments,
  exportGenerated,
  downloadGeneratedDocx,
  changeGeneratedStatus,
  setWizardOpen,
  setWizardStep,
}) {
  const selectedTemplate = currentGenerated?.template
  const requiredAttachments = selectedTemplate?.attachments?.filter(item => item.is_required) ?? []
  const selectedAttachmentIds = new Set(currentGenerated?.attached_document_ids ?? [])
  const draftDocs = generatedDocs.filter(item => item.status === 'DRAFT')
  const readyDocs = generatedDocs.filter(item => item.status !== 'DRAFT')
  const missingRequiredFields = selectedTemplate?.fields?.filter(item => {
    const value = currentGenerated?.field_values?.[item.field.code]?.value
    return item.is_required && (value === undefined || value === null || value === '')
  }) ?? []
  const currentGeneratedHint = currentGenerated ? generatedRequestHint(currentGenerated) : ''
  const readOnlyGenerated = Boolean(currentGenerated && currentGenerated.status !== 'DRAFT')
  const statusAction = currentGenerated?.status === 'DRAFT'
    ? { label: 'Зафиксировать как подготовленное', status: 'PREPARED' }
    : currentGenerated?.status === 'EXPORTED'
      ? { label: 'Отметить направленным', status: 'SENT_OUTSIDE_SYSTEM' }
      : currentGenerated?.status === 'SENT_OUTSIDE_SYSTEM'
        ? { label: 'Ответ получен', status: 'RESPONSE_RECEIVED' }
        : null

  return (
    <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h2>Архивные обращения</h2>
        <button className="sm" onClick={startGeneratedWizard}>Сформировать архивное обращение</button>
      </div>

      {generatedDocs.length === 0 ? (
        <p className="muted" style={{ marginBottom: 12, order: 2 }}>По этому архивному запросу обращения ещё не сформированы.</p>
      ) : (
        <div className="col" style={{ marginBottom: 16, order: 2 }}>
          {draftDocs.length > 0 && (
            <GeneratedDocumentsTable
              title="Черновики"
              items={draftDocs}
              formatDateTime={formatDateTime}
              openGenerated={openGenerated}
              downloadGeneratedDocx={downloadGeneratedDocx}
              changeGeneratedStatus={changeGeneratedStatus}
            />
          )}
          {readyDocs.length > 0 && (
            <GeneratedDocumentsTable
              title="Подготовленные и направленные"
              items={readyDocs}
              formatDateTime={formatDateTime}
              openGenerated={openGenerated}
              downloadGeneratedDocx={downloadGeneratedDocx}
              changeGeneratedStatus={changeGeneratedStatus}
            />
          )}
        </div>
      )}

      {wizardOpen && (
        <section className="card col" style={{ marginBottom: 16, order: 1 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>Мастер формирования обращения</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Исходная формулировка: {request.request_goal || 'Не указана'}
              </p>
            </div>
            <button className="outline sm" onClick={() => setWizardOpen(false)}>Закрыть</button>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
            {WIZARD_STEPS.map(([value, label], index) => (
              <button
                key={value}
                className={wizardStep === value ? 'sm' : 'outline sm'}
                onClick={() => {
                  if (value === 'ATTACHMENTS' && currentGenerated) {
                    loadAvailableAttachments()
                    return
                  }
                  if (value === 'SELECT' || currentGenerated) setWizardStep(value)
                }}
                disabled={value !== 'SELECT' && !currentGenerated}
                title={WIZARD_STEP_HINT[value]}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          <section style={{ border: '1px solid #ddd4c0', borderRadius: 7, padding: 12, background: '#fdfaf4' }}>
            <strong>{WIZARD_STEP_TITLE[wizardStep]}</strong>
            <p className="muted" style={{ marginTop: 4 }}>{WIZARD_STEP_HINT[wizardStep]}</p>
            {currentGeneratedHint && <p className="muted" style={{ marginTop: 6 }}>{currentGeneratedHint}</p>}
          </section>

          {wizardMessage && <p style={{ color: '#16a34a' }}>{wizardMessage}</p>}

          {currentGenerated && (
            <section style={{ border: '1px solid #d8c7ad', borderRadius: 7, padding: 12, background: '#fffaf0' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Статус обращения</strong>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span className={`badge ${String(currentGenerated.status).toLowerCase()}`}>
                      {GENERATED_STATUS_LABEL[currentGenerated.status] ?? currentGenerated.status}
                    </span>
                    {currentGenerated.exported_at && <span className="badge">Экспорт: {formatDateTime(currentGenerated.exported_at)}</span>}
                    {currentGenerated.sent_at && <span className="badge">Направлено: {formatDateTime(currentGenerated.sent_at)}</span>}
                  </div>
                </div>
                {statusAction ? (
                  <button className="outline sm" onClick={() => changeGeneratedStatus(statusAction.status)} disabled={wizardBusy}>
                    {statusAction.label}
                  </button>
                ) : currentGenerated.status === 'PREPARED' ? (
                  <span className="muted">После экспорта обращение можно будет отметить направленным.</span>
                ) : null}
                {currentGenerated.exported_docx_url && (
                  <button className="sm" onClick={() => downloadGeneratedDocx(currentGenerated.id)} disabled={wizardBusy}>
                    Скачать DOCX
                  </button>
                )}
              </div>
            </section>
          )}

          {wizardStep === 'SELECT' && (
            <div className="col">
              <h3>Выбор активного шаблона</h3>
              {templates.length === 0 ? (
                <p className="muted">Активные шаблоны не найдены.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  {templates.map(template => {
                    const selected = currentGenerated?.template_id === template.id || selectedTemplate?.id === template.id
                    return (
                      <div
                        key={template.id}
                        style={{
                          border: selected ? '2px solid #8a623d' : '1px solid #ddd4c0',
                          borderRadius: 6,
                          padding: 12,
                          background: selected ? '#fff7e8' : '#fffdf8',
                        }}
                      >
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h3>{template.name}</h3>
                          {selected && <span className="badge active">Выбран</span>}
                        </div>
                        <p className="muted" style={{ marginTop: 4 }}>{TEMPLATE_TYPE_LABEL[template.template_type]}</p>
                        {template.description && <p style={{ marginTop: 8 }}>{template.description}</p>}
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <span className="badge">Поля: {template.fields_count}</span>
                          <span className="badge">Блоки: {template.blocks_count}</span>
                          <span className={`badge ${template.has_required_attachments ? 'needs_clarification' : ''}`}>
                            {template.has_required_attachments ? 'Есть обязательные приложения' : 'Без обязательных приложений'}
                          </span>
                        </div>
                        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                          Изменён: {formatDateTime(template.updated_at)}
                        </p>
                        <button
                          className={selected ? 'outline sm' : 'sm'}
                          style={{ marginTop: 10 }}
                          disabled={wizardBusy || Boolean(currentGenerated)}
                          onClick={() => selectTemplate(template.id)}
                        >
                          {selected ? 'Выбран' : 'Выбрать шаблон'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {wizardStep === 'FIELDS' && currentGenerated && selectedTemplate && (
            <div className="col">
              <div>
                <h3>{selectedTemplate.name}</h3>
                {selectedTemplate.description && <p className="muted">{selectedTemplate.description}</p>}
                <p className="muted" style={{ marginTop: 4 }}>
                  Выбранный шаблон: {TEMPLATE_TYPE_LABEL[selectedTemplate.template_type] ?? selectedTemplate.template_type}
                </p>
              </div>
              <label className="col">
                <span className="label">Комментарий генеалога</span>
                <textarea
                  rows={2}
                  disabled={readOnlyGenerated}
                  value={currentGenerated.context_comment || ''}
                  onChange={e => setCurrentGenerated(prev => ({ ...prev, context_comment: e.target.value }))}
                  onBlur={() => {
                    if (!readOnlyGenerated) {
                      api.updateGeneratedComment(currentGenerated.id, {
                        context_comment: currentGenerated.context_comment || null,
                      }).catch(() => {})
                    }
                  }}
                />
              </label>
              {selectedTemplate.fields.map(item => {
                const field = item.field
                const valueData = currentGenerated.field_values?.[field.code] ?? {}
                const value = valueData.value ?? ''
                const emptyRequired = item.is_required && !value
                const disabled = valueData.autofilled && !item.editable_after_autofill
                return (
                  <label key={field.code} className="col" style={{
                    border: emptyRequired ? '1px solid #e8cfa0' : '1px solid #ddd4c0',
                    borderRadius: 6,
                    padding: 10,
                    background: emptyRequired ? '#fff7ed' : '#fdfaf4',
                  }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong>{field.title}</strong>
                        {item.hint && <div className="muted" style={{ fontSize: 12 }}>{item.hint}</div>}
                      </div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {item.is_required && <span className="badge needs_clarification">Обязательное</span>}
                        {valueData.autofilled && <span className="badge active">Заполнено автоматически</span>}
                        {valueData.missing_autofill && <span className="badge needs_clarification">Требуется заполнить вручную</span>}
                      </div>
                    </div>
                    <GeneratedFieldInput
                      field={field}
                      value={value}
                      disabled={readOnlyGenerated || disabled}
                      onChange={next => updateGeneratedField(field.code, next)}
                    />
                  </label>
                )
              })}
              {missingRequiredFields.length > 0 && (
                <p className="muted">
                  Обязательные поля без значения: {missingRequiredFields.map(item => item.field.title).join(', ')}.
                </p>
              )}
              <div className="row">
                {!readOnlyGenerated && <button type="button" onClick={saveGeneratedDraft} disabled={wizardBusy}>Сохранить черновик</button>}
                {!readOnlyGenerated && <button type="button" className="outline" onClick={previewGenerated} disabled={wizardBusy}>Сформировать предпросмотр</button>}
              </div>
            </div>
          )}

          {wizardStep === 'PREVIEW' && currentGenerated && (
            <div className="col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Предпросмотр документа</h3>
                {!readOnlyGenerated && (
                  <button className="outline sm" onClick={() => setEditingFinalText(prev => !prev)}>
                    {editingFinalText ? 'Показать предпросмотр' : 'Редактировать итоговый текст'}
                  </button>
                )}
              </div>

              {editingFinalText ? (
                <>
                  <textarea
                    rows={14}
                    value={currentGenerated.final_document_text || ''}
                    onChange={e => setCurrentGenerated(prev => ({
                      ...prev,
                      final_document_text: e.target.value,
                    }))}
                  />
                  <div><button onClick={saveFinalText} disabled={wizardBusy}>Сохранить текст</button></div>
                </>
              ) : (
                <div style={{ border: '1px solid #d0c4b0', padding: 20, background: '#fffdf8' }}>
                  {(currentGenerated.generated_blocks ?? []).map((block, index) => (
                    <div key={index} style={previewBlockStyle(block.block_type)}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{block.content}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="row">
                {!readOnlyGenerated && <button onClick={saveGeneratedDraft} disabled={wizardBusy}>Сохранить черновик</button>}
                {['DRAFT', 'PREPARED'].includes(currentGenerated.status) && (
                  <button className="outline" onClick={exportGenerated} disabled={wizardBusy}>
                    Экспортировать обращение
                  </button>
                )}
                {currentGenerated.exported_docx_url && (
                  <button className="outline" onClick={() => downloadGeneratedDocx(currentGenerated.id)} disabled={wizardBusy}>
                    Скачать DOCX
                  </button>
                )}
              </div>
            </div>
          )}

          {wizardStep === 'ATTACHMENTS' && currentGenerated && selectedTemplate && (
            <div className="col">
              <h3>Приложения и экспорт</h3>
              {selectedTemplate.attachments.length > 0 && (
                <div style={{ border: '1px solid #ddd4c0', borderRadius: 6, padding: 12 }}>
                  <strong>Требуемые приложения по шаблону</strong>
                  <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                    {selectedTemplate.attachments.map(item => (
                      <li key={item.id}>
                        {item.title} {item.is_required ? '(обязательное)' : '(необязательное)'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {requiredAttachments.length > 0 && selectedAttachmentIds.size === 0 && (
                <p className="muted">
                  В шаблоне есть обязательные приложения. Экспорт не блокируется: документ можно приложить вне системы.
                </p>
              )}
              {availableAttachments.length === 0 ? (
                <p className="muted">Доступных документов для приложения нет.</p>
              ) : (
                <table>
                  <thead>
                    <tr><th></th><th>Документ</th><th>Источник</th><th>Название в обращении</th><th>Дата загрузки</th><th>Привязка</th></tr>
                  </thead>
                  <tbody>
                    {availableAttachments.map(doc => (
                      <tr key={doc.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedAttachmentIds.has(doc.id)}
                            onChange={() => toggleGeneratedAttachment(doc.id)}
                            disabled={readOnlyGenerated}
                          />
                        </td>
                        <td><strong>{doc.file_name}</strong></td>
                        <td className="muted">{ATTACHMENT_PURPOSE_LABEL[doc.comment] || doc.comment || '—'}</td>
                        <td>
                          {selectedAttachmentIds.has(doc.id) ? (
                            <input
                              value={currentGenerated.attached_document_titles?.[doc.id] ?? doc.file_name}
                              onChange={e => updateGeneratedAttachmentTitle(doc.id, e.target.value)}
                              disabled={readOnlyGenerated}
                              placeholder="Название документа в обращении"
                            />
                          ) : (
                            <span className="muted">Выберите документ</span>
                          )}
                        </td>
                        <td className="muted">{formatDateTime(doc.created_at)}</td>
                        <td>{doc.bound_to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="row">
                {!readOnlyGenerated && <button onClick={saveGeneratedAttachments} disabled={wizardBusy}>Сохранить приложения</button>}
                {['DRAFT', 'PREPARED'].includes(currentGenerated.status) && <button className="outline" onClick={exportGenerated} disabled={wizardBusy}>Экспортировать обращение</button>}
                {currentGenerated.exported_docx_url && <button className="outline" onClick={() => downloadGeneratedDocx(currentGenerated.id)} disabled={wizardBusy}>Скачать DOCX</button>}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

const WIZARD_STEPS = [
  ['SELECT', 'Шаблон'],
  ['FIELDS', 'Поля'],
  ['PREVIEW', 'Предпросмотр'],
  ['ATTACHMENTS', 'Приложения'],
]

const WIZARD_STEP_TITLE = {
  SELECT: 'Выберите шаблон обращения',
  FIELDS: 'Заполните данные обращения',
  PREVIEW: 'Проверьте текст документа',
  ATTACHMENTS: 'Выберите приложения и зафиксируйте обращение',
}

const WIZARD_STEP_HINT = {
  SELECT: 'Генеалог выбирает только активный шаблон. Настройки шаблона здесь не редактируются.',
  FIELDS: 'Поля сформированы по выбранному шаблону. Автозаполненные значения можно проверить и при необходимости исправить.',
  PREVIEW: 'Документ собран из блоков шаблона. Итоговый текст можно отредактировать без изменения самого шаблона.',
  ATTACHMENTS: 'Выберите документы из профиля или запроса. Экспорт фиксирует обращение в системе, но отправка в архив выполняется вне системы.',
}

function generatedRequestHint(item) {
  if (item.status === 'DRAFT') return 'Сейчас это черновик. Заполните поля, проверьте текст и сохраните обращение как подготовленный документ.'
  if (item.status === 'PREPARED') return 'Обращение подготовлено. Отправьте его в архив вне системы и отметьте как направленное.'
  if (item.status === 'EXPORTED') return 'Обращение экспортировано. После фактической отправки отметьте его как направленное вне системы.'
  if (item.status === 'SENT_OUTSIDE_SYSTEM') return 'Обращение направлено вне системы. После получения ответа зафиксируйте результат обработки запроса.'
  if (item.status === 'RESPONSE_RECEIVED') return 'Ответ по обращению получен. Перенесите важные сведения в результат обработки запроса.'
  if (item.status === 'CANCELLED') return 'Обращение отменено.'
  return ''
}

function GeneratedDocumentsTable({
  title,
  items,
  formatDateTime,
  openGenerated,
  downloadGeneratedDocx,
  changeGeneratedStatus,
}) {
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3>{title}</h3>
        <span className="badge">{items.length}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Шаблон</th>
            <th>Статус</th>
            <th>Создано</th>
            <th>Изменено</th>
            <th>Экспорт</th>
            <th>Направлено</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const secondaryAction = item.status === 'EXPORTED'
              ? { label: 'Отметить направленным', status: 'SENT_OUTSIDE_SYSTEM' }
              : item.status === 'SENT_OUTSIDE_SYSTEM'
                ? { label: 'Ответ получен', status: 'RESPONSE_RECEIVED' }
                : null
            return (
              <tr key={item.id}>
                <td>
                  <strong>{item.template_title_snapshot}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {TEMPLATE_TYPE_LABEL[item.template_type_snapshot] ?? item.template_type_snapshot}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{generatedRequestHint(item)}</div>
                </td>
                <td>
                  <span className={`badge ${String(item.status).toLowerCase()}`}>
                    {GENERATED_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
                <td className="muted">{formatDateTime(item.created_at)}</td>
                <td className="muted">{formatDateTime(item.updated_at)}</td>
                <td className="muted">{formatDateTime(item.exported_at)}</td>
                <td className="muted">{formatDateTime(item.sent_at)}</td>
                <td>
                  <div className="col" style={{ gap: 6, minWidth: 150 }}>
                    <button
                      className="outline sm"
                      style={{ width: '100%', paddingInline: 6 }}
                      onClick={() => openGenerated(item.id, item.status === 'DRAFT' ? 'FIELDS' : 'PREVIEW')}
                    >
                      {item.status === 'DRAFT' ? 'Продолжить черновик' : 'Открыть'}
                    </button>
                    {item.exported_docx_url && (
                      <button
                        className="outline sm"
                        style={{ width: '100%', paddingInline: 6 }}
                        onClick={() => downloadGeneratedDocx(item.id)}
                      >
                        Скачать DOCX
                      </button>
                    )}
                    {secondaryAction && (
                      <button
                        className="outline sm"
                        style={{
                          width: '100%',
                          minHeight: 44,
                          padding: '8px 8px',
                          whiteSpace: 'normal',
                          lineHeight: 1.25,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                        }}
                        onClick={() => changeGeneratedStatus(secondaryAction.status, item.id)}
                      >
                        {secondaryAction.label}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function GeneratedFieldInput({ field, value, disabled, onChange }) {
  if (field.data_type === 'textarea') {
    return <textarea rows={3} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
  }
  if (field.data_type === 'checkbox') {
    return (
      <label className="row">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(e.target.checked)} />
        <span>Да</span>
      </label>
    )
  }
  const type = field.data_type === 'date'
    ? 'date'
    : field.data_type === 'number' || field.data_type === 'year'
      ? 'number'
      : 'text'
  return <input type={type} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
}

function previewBlockStyle(blockType) {
  const base = { marginBottom: 16 }
  if (blockType === 'HEADER_RIGHT') return { ...base, textAlign: 'right' }
  if (blockType === 'HEADER_LEFT') return { ...base, textAlign: 'left' }
  if (blockType === 'TITLE') return { ...base, textAlign: 'center', fontWeight: 700, fontSize: 18 }
  if (blockType === 'FOOTER') return { ...base, marginTop: 24 }
  return base
}
