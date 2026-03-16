import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export default function Dialog({ open, onClose, title, children, footer, wide = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const handleScrimClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleScrimClick}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={[
          'relative z-10 flex flex-col bg-surface-card border border-line',
          'w-full sm:rounded-xl rounded-t-2xl',
          'max-h-[95dvh] sm:max-h-[88vh]',
          'animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-2 fade-in duration-250',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        ].join(' ')}
        style={{ animationFillMode: 'both' }}
      >
        {/* Mobile drag handle */}
        <div className="flex sm:hidden justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-line-strong" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="text-ink font-semibold text-base leading-snug">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 px-5 py-4 border-t border-line bg-surface-card">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
