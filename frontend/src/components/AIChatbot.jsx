// src/components/AIChatbot.jsx

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../utils/useAuth'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export default function AIChatbot({ isOpen, onClose }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I\'m JOM AI, your personal assistant for discovering places and getting around Tampines. How can I help you today?',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      const data = await response.json()

      if (response.ok) {
        const aiMessage = {
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          action: data.action
        }
        setMessages(prev => [...prev, aiMessage])
      } else {
        const errorMessage = {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${data.error || 'Unknown error'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble connecting right now. Please try again later.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div className="ai-chatbot-overlay" onClick={onClose}>
      <div className="ai-chatbot-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-chatbot-header">
          <div className="ai-chatbot-title">
            <span className="ai-chatbot-icon">🤖</span>
            <span>JOM AI Assistant</span>
          </div>
          <button className="ai-chatbot-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="ai-chatbot-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`ai-message ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="ai-message-content">
                {message.content}
              </div>
              <div className="ai-message-time">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="ai-message assistant">
              <div className="ai-message-content typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="ai-chatbot-input">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about Tampines..."
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="ai-send-btn"
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  )
}