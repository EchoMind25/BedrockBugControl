import type { BugReport, BccProduct, PromptTemplate } from '@/types'

// Parse user agent into a human-readable string
function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown'
  // Simple extraction for common browsers/OS
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[0] ?? ''
  const os = ua.match(/\(([^)]+)\)/)?.[1]?.split(';')[0] ?? ''
  return [browser, os].filter(Boolean).join(' / ') || ua.slice(0, 60)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function generatePrompt(
  bug: BugReport,
  product: BccProduct,
  template: PromptTemplate
): string {
  const productName = product.display_name
  const severity = bug.severity.charAt(0).toUpperCase() + bug.severity.slice(1)
  const route = bug.current_route ?? 'Unknown'
  const uaParsed = parseUserAgent(bug.user_agent)
  const createdAt = formatDate(bug.created_at)
  const hasScreenshot = Boolean(bug.screenshot_url)
  // Exclude user_id from prompts — irrelevant for debugging, contains PII
  const stackTrace = null // Phase 1: no stack trace field

  if (template === 'quick-fix') {
    return [
      '## Bug Fix Request',
      '',
      `**Product:** ${productName}`,
      `**Severity:** ${severity}`,
      `**Route:** ${route}`,
      `**Reported:** ${createdAt}`,
      '',
      '### What the user reported:',
      bug.description,
      '',
      '### Steps to reproduce:',
      bug.steps_to_reproduce,
      ...(stackTrace
        ? ['', '### Error / Stack Trace:', '```', stackTrace, '```']
        : []),
      '',
      '### Instructions:',
      `1. Locate the code responsible for the route \`${route}\` in this project.`,
      '2. Reproduce the issue based on the steps above.',
      '3. Identify the root cause and implement a fix.',
      "4. Verify the fix doesn't break adjacent functionality.",
      '5. Briefly explain what caused the bug and what you changed.',
    ].join('\n')
  }

  if (template === 'root-cause') {
    return [
      '## Root Cause Analysis Request',
      '',
      `**Product:** ${productName}`,
      `**Severity:** ${severity}`,
      `**Route:** ${route}`,
      `**Browser/Device:** ${uaParsed}`,
      `**Viewport:** ${bug.viewport ?? 'Unknown'}`,
      `**App Version:** ${bug.app_version ?? 'Unknown'}`,
      '',
      '### Bug Report:',
      bug.description,
      '',
      '### Steps to reproduce:',
      bug.steps_to_reproduce,
      ...(hasScreenshot
        ? ['', '### Screenshot:', 'A screenshot is attached showing the bug state.']
        : []),
      '',
      '### Instructions:',
      'I need you to investigate this bug deeply before fixing it:',
      '',
      `1. **Trace the data flow** for the route \`${route}\` — from the user action through component state, API calls, server logic, and database queries.`,
      '2. **Identify all possible causes** — list them, then narrow down to the most likely.',
      '3. **Check for related vulnerabilities** — could this same root cause affect other routes or features?',
      '4. **Implement the fix** with an explanation of why this specific approach is correct.',
      '5. **Add defensive checks** to prevent this class of bug from recurring (input validation, error boundaries, type guards, etc.)',
    ].join('\n')
  }

  // security
  return [
    '## Security-Focused Bug Review',
    '',
    `**Product:** ${productName}`,
    `**Severity:** ${severity}`,
    `**Route:** ${route}`,
    '',
    '### Reported Issue:',
    bug.description,
    '',
    '### Steps to reproduce:',
    bug.steps_to_reproduce,
    '',
    '### Instructions:',
    'This bug may have security or privacy implications. Before fixing:',
    '',
    '1. **Assess the security impact:**',
    '   - Can this be exploited by a malicious user?',
    '   - Does this expose user data, bypass auth, or break data isolation?',
    '   - Does this affect RLS policies or Supabase security?',
    '2. **Check for similar patterns** across the codebase — if this vulnerability exists in one place, it likely exists in others.',
    '3. **Implement the fix** with security as the priority (correctness > performance > UX).',
    '4. **Review RLS policies** for the affected tables.',
    '5. **Document** what was vulnerable and what was changed.',
  ].join('\n')
}
