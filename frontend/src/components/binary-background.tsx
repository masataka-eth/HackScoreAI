"use client"

import { useEffect, useState } from "react"

export function BinaryBackground() {
  const [numbers, setNumbers] = useState<Array<{
    id: number
    x: number
    y: number
    value: string
    speed: number
    opacity: number
  }>>([])

  useEffect(() => {
    // 初期数字を生成
    const initialNumbers = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      value: Math.random() > 0.5 ? '1' : '0',
      speed: Math.random() * 0.5 + 0.1,
      opacity: Math.random() * 0.3 + 0.1
    }))
    
    setNumbers(initialNumbers)

    // 定期的に数字を更新
    const interval = setInterval(() => {
      setNumbers(prev => prev.map(num => {
        let newY = num.y + num.speed
        if (newY > 100) {
          newY = -5
        }
        return {
          ...num,
          y: newY,
          value: Math.random() > 0.8 ? (Math.random() > 0.5 ? '1' : '0') : num.value
        }
      }))
    }, 50)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {numbers.map((num) => (
        <div
          key={num.id}
          className="absolute font-mono text-primary transition-all duration-75"
          style={{
            left: `${num.x}%`,
            top: `${num.y}%`,
            opacity: num.opacity,
            fontSize: `${Math.random() * 10 + 8}px`
          }}
        >
          {num.value}
        </div>
      ))}
    </div>
  )
}