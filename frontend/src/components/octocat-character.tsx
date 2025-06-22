"use client"

import { useEffect, useState } from "react"

export function OctocatCharacter() {
  const [eyeBlink, setEyeBlink] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setEyeBlink(true)
      setTimeout(() => setEyeBlink(false), 150)
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-32 h-32 mx-auto">
      {/* 8bit スタイル Octocat */}
      <div className="pixel-art">
        <svg
          width="128"
          height="128"
          viewBox="0 0 16 16"
          className="w-full h-full"
          style={{ imageRendering: "pixelated" }}
        >
          {/* 頭部 */}
          <rect x="4" y="2" width="8" height="6" fill="#00ffaa" />
          <rect x="3" y="3" width="10" height="4" fill="#00ffaa" />
          <rect x="2" y="4" width="12" height="2" fill="#00ffaa" />
          
          {/* 耳 */}
          <rect x="1" y="1" width="2" height="3" fill="#00ffaa" />
          <rect x="13" y="1" width="2" height="3" fill="#00ffaa" />
          
          {/* 目 */}
          <rect x="5" y="4" width="2" height={eyeBlink ? "1" : "2"} fill="#0a0a0a" />
          <rect x="9" y="4" width="2" height={eyeBlink ? "1" : "2"} fill="#0a0a0a" />
          
          {/* 口 */}
          <rect x="7" y="6" width="2" height="1" fill="#0a0a0a" />
          
          {/* 体 */}
          <rect x="5" y="8" width="6" height="4" fill="#00ffaa" />
          <rect x="4" y="9" width="8" height="2" fill="#00ffaa" />
          
          {/* 腕 */}
          <rect x="2" y="9" width="2" height="3" fill="#00ffaa" />
          <rect x="12" y="9" width="2" height="3" fill="#00ffaa" />
          
          {/* 足 */}
          <rect x="5" y="12" width="2" height="3" fill="#00ffaa" />
          <rect x="9" y="12" width="2" height="3" fill="#00ffaa" />
          
          {/* ヘッドバンド (ハッカー風) */}
          <rect x="3" y="2" width="10" height="1" fill="#262626" />
          <rect x="11" y="1" width="3" height="1" fill="#262626" />
        </svg>
      </div>
      
      {/* コード文字が流れるエフェクト */}
      <div className="absolute -inset-4 opacity-30 overflow-hidden pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-primary font-mono text-xs animate-pulse"
            style={{
              left: `${20 + i * 15}%`,
              top: `${10 + (i % 3) * 30}%`,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            {['01', '10', '11', '00'][i % 4]}
          </div>
        ))}
      </div>
      
      {/* アクティビティインジケーター */}
      <div className="absolute -top-2 -right-2 w-4 h-4 bg-primary rounded-full animate-ping opacity-75" />
      <div className="absolute -top-2 -right-2 w-4 h-4 bg-primary rounded-full" />
    </div>
  )
}