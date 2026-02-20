/**
 * Consistent product color mapping for all charts.
 * These colors are used across ErrorTrendChart, ActiveUsersChart, etc.
 */
export const PRODUCT_COLORS: Record<string, string> = {
  'bedrock-chat': '#00D9FF', // cyan
  echosafe: '#10B981',       // emerald
  quoteflow: '#F59E0B',      // amber
}

/** Fallback color for unknown products */
export const FALLBACK_COLORS = ['#8B5CF6', '#F43F5E', '#6366F1', '#EC4899']

export function getProductColor(productId: string, index = 0): string {
  return PRODUCT_COLORS[productId] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}
