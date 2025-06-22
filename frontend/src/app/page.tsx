"use client"

import { useAuth } from "@/app/providers"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { OctocatCharacter } from "@/components/octocat-character"

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return // まだロード中

    if (user) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [user, loading, router])

  // ローディング中の画面
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <OctocatCharacter />
        <div className="text-muted-foreground">
          HackScore AI を起動中...
        </div>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    </div>
  )
}
