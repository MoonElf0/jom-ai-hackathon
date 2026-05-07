import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabaseClient'
import '../styles/GroupChat.css'

export default function GroupChat({ chatId, chatName, memberIds, userId }) {
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const isLocalDemo = chatId?.startsWith('local-chat-')

  // Load initial messages
  useEffect(() => {
    if (!chatId) return
    if (isLocalDemo) {
      setMessages([
        {
          id: `${chatId}-intro`,
          sender_id: userId,
          message: 'This is a demo match chat. Messages are stored locally in this session.',
          created_at: new Date().toISOString(),
        },
      ])
      setLoading(false)
      return
    }

    loadMessages()
  }, [chatId])

  async function loadMessages() {
    try {
      setLoading(true)
      const { data } = await supabase
        .from('group_chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })

      if (data) {
        setMessages(data)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    } finally {
      setLoading(false)
    }
  }

  // Subscribe to real-time message updates
  useEffect(() => {
    if (!chatId || isLocalDemo) return

    const subscription = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new])
          scrollToBottom()
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [chatId, isLocalDemo])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function sendMessage(e) {
    e.preventDefault()
    if (!messageText.trim() || !chatId) return

    setSending(true)
    try {
      if (isLocalDemo) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-msg-${Date.now()}`,
            sender_id: userId,
            message: messageText.trim(),
            created_at: new Date().toISOString(),
          },
        ])
        setMessageText('')
        return
      }

      const { error } = await supabase.from('group_chat_messages').insert({
        chat_id: chatId,
        sender_id: userId,
        message: messageText.trim(),
        created_at: new Date().toISOString(),
      })

      if (!error) {
        setMessageText('')
      }
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="group-chat-container">Loading messages...</div>
  }

  return (
    <div className="group-chat-container">
      <div className="chat-header">
        <h3>{chatName}</h3>
        <span className="member-count">👥 {memberIds?.length || 0} members</span>
      </div>

      {isLocalDemo && (
        <div className="demo-chat-banner">
          Demo match chat — messages are stored locally in this session.
        </div>
      )}

      {/* Messages area */}
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.sender_id === userId ? 'sent' : 'received'}`}
            >
              <div className="message-content">{msg.message}</div>
              <div className="message-time">
                {formatTime(new Date(msg.created_at))}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form className="message-input-form" onSubmit={sendMessage}>
        <input
          type="text"
          className="message-input"
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="send-btn" disabled={sending || !messageText.trim()}>
          {sending ? '...' : '📤'}
        </button>
      </form>
    </div>
  )
}

function formatTime(date) {
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString()
}
