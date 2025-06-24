"use client";

import { useAuth } from "@/app/providers";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings, LogOut, DollarSign } from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import Image from "next/image";
import { hackathonOperations } from "@/lib/supabase";

export function CommonHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [totalCost, setTotalCost] = useState<number | null>(null);

  // APIコストを取得
  useEffect(() => {
    if (!user) return;

    const loadCost = async () => {
      const result = await hackathonOperations.getTotalApiCost(user.id);
      if (result.success && result.data !== undefined) {
        setTotalCost(result.data);
      }
    };

    loadCost();
  }, [user]);

  return (
    <header className="border-b border-border bg-card relative z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
          </div>

          {/* 中央のキャラクターとタイトル */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12">
              <OctocatCharacter size="48" />
            </div>
            <Image
              src="/logo.png"
              alt="HackScore AI"
              width={200}
              height={40}
              className="w-auto h-8"
              priority
            />
          </div>

          <div className="flex items-center gap-4">
            {/* APIコスト表示 */}
            {totalCost !== null && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <span>{totalCost.toFixed(2)} USD</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/settings")}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}