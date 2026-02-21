import React from 'react'
import { Folder, Atom, FileCode, Braces, FileText } from 'lucide-react'

type Props = {
  path: string
  type: 'file' | 'dir'
  className?: string
  size?: number
}

function extname(p: string): string {
  const b = p.split('/').pop() || p
  const i = b.lastIndexOf('.')
  if (i <= 0) return ''
  return b.slice(i + 1).toLowerCase()
}

export const FileTypeIcon: React.FC<Props> = ({ path, type, className, size = 16 }) => {
  if (type === 'dir') {
    return <Folder className={className} width={size} height={size} />
  }

  const ext = extname(path)

  // Special cases by extension
  if (ext === 'jsx' || ext === 'tsx') return <Atom className={className} width={size} height={size} />
  if (ext === 'js' || ext === 'ts' || ext === 'json' || ext === 'yaml' || ext === 'yml') return <Braces className={className} width={size} height={size} />
  if (ext === 'md') return <FileText className={className} width={size} height={size} />
  if (ext === 'html' || ext === 'css' || ext === 'scss' || ext === 'less') return <FileCode className={className} width={size} height={size} />

  // Code-like default
  return <FileCode className={className} width={size} height={size} />
}

export default FileTypeIcon
