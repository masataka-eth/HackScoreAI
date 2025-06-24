/**
 * 汎用ユーティリティ関数
 * 
 * アプリケーション全体で使用される共通的なユーティリティ関数を定義。
 * 主にshadcn/uiライブラリとの統合で使用されるCSSクラス管理機能を提供。
 * 
 * 使用箇所：
 * - 全コンポーネントでのCSSクラス結合（特にshadcn/uiコンポーネント）
 * - 条件付きスタイリング
 * - Tailwind CSSクラスの動的結合
 * 
 * 依存関係：
 * - clsx: 条件付きクラス名結合ライブラリ
 * - tailwind-merge: Tailwind CSSクラス競合解決ライブラリ
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * CSSクラス名を結合・最適化する関数
 * 
 * 複数のクラス名を結合し、Tailwind CSSの競合するクラスを自動で解決する。
 * 条件付きクラス名の適用にも対応。
 * 
 * 使用例：
 * ```typescript
 * cn("base-class", condition && "conditional-class", "bg-red-500 bg-blue-500") 
 * // => "base-class conditional-class bg-blue-500" (最後のbg-*が優先)
 * ```
 * 
 * @param {...ClassValue[]} inputs - 結合するクラス名（文字列、オブジェクト、配列など）
 * @returns {string} 最適化されたクラス名文字列
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}