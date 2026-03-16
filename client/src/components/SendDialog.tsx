import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import Dialog from './Dialog'
import * as api from '../api/client'
import { EmailAddress } from '../types'
import { useToast } from '../App'

interface SendDialogProps {
  bookId: number
  bookTitle?: string | null
  emailAddresses: EmailAddress[]
  onClose: () => void
}

export default function SendDialog({ bookId, bookTitle, emailAddresses, onClose }: SendDialogProps) {
  const [customEmail, setCustomEmail] = useState('')
  const { addToast } = useToast()

  const sendMutation = useMutation({
    mutationFn: (recipient: string) => api.sendBook(bookId, recipient),
    onSuccess: () => { addToast('success', 'Book sent!'); onClose() },
    onError: (e: Error) => addToast('error', e.message),
  })

  function sendToCustom() {
    const email = customEmail.trim()
    if (!email) return
    sendMutation.mutate(email)
  }

  return (
    <Dialog open onClose={onClose} title="Send Book">
      <div className="p-4 space-y-4">
        {bookTitle && (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">{bookTitle}</span>
          </p>
        )}

        {/* Saved addresses */}
        {emailAddresses.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Send to</p>
            {emailAddresses.map(addr => (
              <button
                key={addr.id}
                type="button"
                onClick={() => sendMutation.mutate(addr.email)}
                disabled={sendMutation.isPending}
                className="flex items-center justify-between w-full px-4 py-3 text-left rounded-lg bg-surface-raised hover:bg-surface-high border border-line hover:border-line-strong transition-colors disabled:opacity-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{addr.label || addr.email}</p>
                  {addr.label && <p className="text-xs text-ink-muted truncate">{addr.email}</p>}
                </div>
                {sendMutation.isPending
                  ? <Loader2 size={15} className="text-ink-muted animate-spin shrink-0 ml-3" />
                  : <Send size={15} className="text-ink-muted shrink-0 ml-3" />}
              </button>
            ))}
          </div>
        )}

        {/* Custom one-time email */}
        <div className={emailAddresses.length > 0 ? 'border-t border-line pt-4' : ''}>
          <p className="text-xs font-medium text-ink-muted mb-2">
            {emailAddresses.length > 0 ? 'Or use a one-time address' : 'Email address'}
          </p>
          <input
            type="email"
            value={customEmail}
            onChange={e => setCustomEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendToCustom()}
            placeholder="recipient@example.com"
            className="field w-full mb-2"
            autoFocus={emailAddresses.length === 0}
          />
          <button
            type="button"
            onClick={sendToCustom}
            disabled={!customEmail.trim() || sendMutation.isPending}
            className="btn-primary w-full"
          >
            {sendMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />}
            Send
          </button>
        </div>
      </div>
    </Dialog>
  )
}
