'use client'

import { useState, useEffect, useRef } from 'react'

interface ChatMessage {
  role: 'user' | 'bot'
  content: string
}

const GREETING = '¡Hola! Soy el asistente de Härissa Foods 🌿\n\n¿En qué te puedo ayudar hoy? Puedo tomarte un pedido, contarte sobre nuestro menú o gestionar una reserva.'

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('harissa_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('harissa_session_id', id)
  }
  return id
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function resetConversation() {
    localStorage.removeItem('harissa_session_id')
    setMessages([{ role: 'bot', content: GREETING }])
    setInput('')
    inputRef.current?.focus()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const sessionId = getSessionId()
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'bot', content: data.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: 'Hubo un error de conexión. Por favor intenta de nuevo 🙏' },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>🌿 Härissa Foods</span>
        <button style={styles.resetBtn} onClick={resetConversation}>
          Nueva conversación
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.bubble,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#2d2d2d' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#1a1a1a',
              borderBottomRightRadius: msg.role === 'user' ? 4 : 18,
              borderBottomLeftRadius: msg.role === 'bot' ? 4 : 18,
            }}
          >
            {msg.content.split('\n').map((line, j) => (
              <span key={j}>
                {line}
                {j < msg.content.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.bubble, alignSelf: 'flex-start', background: '#fff', color: '#999' }}>
            Escribiendo...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputBar}>
        <input
          ref={inputRef}
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu mensaje..."
          disabled={loading}
          autoFocus
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    maxWidth: 680,
    margin: '0 auto',
    background: '#f5f0eb',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    background: '#1a1a1a',
    color: '#fff',
    flexShrink: 0,
  },
  logo: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.3px',
  },
  headerSub: {
    fontSize: 13,
    color: '#aaa',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '20px 16px',
  },
  bubble: {
    maxWidth: '78%',
    padding: '10px 14px',
    borderRadius: 18,
    fontSize: 15,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  inputBar: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    background: '#fff',
    borderTop: '1px solid #e8e0d8',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 24,
    border: '1px solid #ddd',
    fontSize: 15,
    outline: 'none',
    background: '#fafafa',
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: 24,
    border: 'none',
    background: '#c84b2f',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  resetBtn: {
    fontSize: 12,
    color: '#aaa',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  },
}
