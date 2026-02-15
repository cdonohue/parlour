import { useState } from 'react'
import { Button, Dialog } from '../../primitives'
import styles from './NewChatDialog.module.css'

export interface NewChatConfig {
  llmCommand?: string
}

interface NewChatDialogProps {
  defaultLlmCommand?: string
  onConfirm: (config: NewChatConfig) => void
  onCancel: () => void
}

export function NewChatDialog({
  defaultLlmCommand,
  onConfirm,
  onCancel,
}: NewChatDialogProps): React.ReactElement {
  const defaultLlm = defaultLlmCommand || 'claude'
  const [llmCommand, setLlmCommand] = useState(defaultLlm)

  const llmOverride = llmCommand !== defaultLlm ? llmCommand : undefined

  return (
    <Dialog open onClose={onCancel} title="New Chat" width={400}>
      <div className={styles.body}>
        <label className={styles.label}>Agent</label>
        <input
          className={styles.input}
          value={llmCommand}
          onChange={(e) => setLlmCommand(e.target.value)}
          placeholder={defaultLlm}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm({ llmCommand: llmOverride }) }}
        />

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm({ llmCommand: llmOverride })}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
