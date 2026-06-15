import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'

async function getCroppedBlob(imageSrc, croppedArea) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const x = Math.round(croppedArea.x / 100 * image.naturalWidth)
  const y = Math.round(croppedArea.y / 100 * image.naturalHeight)
  const width = Math.round(croppedArea.width / 100 * image.naturalWidth)
  const height = Math.round(croppedArea.height / 100 * image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

export default function PhotoCropModal({ imageSrc, onSave, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((area) => setCroppedArea(area), [])

  async function handleSave() {
    if (!croppedArea) return
    setSaving(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea)
      await onSave(blob)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        width: 420, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'relative', height: 360, background: '#111' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div style={{ padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>
            Масштаб
            <input
              type="range" min={1} max={3} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{
              padding: '7px 18px', borderRadius: 6, border: '1px solid #d1d5db',
              background: '#fff', cursor: 'pointer', fontSize: 13,
            }}>
              Отмена
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '7px 18px', borderRadius: 6, border: 'none',
              background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13,
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
