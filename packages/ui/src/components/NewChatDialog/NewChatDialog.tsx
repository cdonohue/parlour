import { useState } from 'react'
import { Button, Dialog, TextInput } from '../../primitives'
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
        <TextInput
          value={llmCommand}
          onChange={setLlmCommand}
          placeholder={defaultLlm}
          autoFocus
          fullWidth
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
