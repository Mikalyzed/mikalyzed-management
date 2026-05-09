/**
 * Microsoft Graph wrapper using app-level (client_credentials) auth.
 * Caches access tokens in-process for their lifetime to avoid re-auth on every call.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'

let cachedToken: { token: string; expiresAt: number } | null = null

export function isGraphConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_SECRET)
}

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token

  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) throw new Error('Azure env vars missing')

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph token request failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }
  return data.access_token
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${GRAPH}${path}`, { ...init, headers })
}

export type GraphSendMailInput = {
  fromUserEmail: string
  to: string[]
  cc?: string[]
  subject: string
  bodyHtml: string
  saveToSentItems?: boolean
}

/**
 * Send an email AS a specific user (their actual Outlook address).
 * Throws on failure with a useful error message.
 */
export async function sendMail(input: GraphSendMailInput): Promise<void> {
  const message = {
    subject: input.subject,
    body: { contentType: 'HTML', content: input.bodyHtml },
    toRecipients: input.to.map(addr => ({ emailAddress: { address: addr } })),
    ...(input.cc?.length ? { ccRecipients: input.cc.map(addr => ({ emailAddress: { address: addr } })) } : {}),
  }
  const res = await graphFetch(`/users/${encodeURIComponent(input.fromUserEmail)}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({ message, saveToSentItems: input.saveToSentItems !== false }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `sendMail failed: ${res.status}`)
  }
}

/**
 * Try to access a user's inbox metadata. Returns true if access is granted,
 * false if the policy denies (403 / ApplicationAccessPolicy_Restricted).
 */
export async function canAccessMailbox(userEmail: string): Promise<{ granted: boolean; status: number; error?: string }> {
  const res = await graphFetch(`/users/${encodeURIComponent(userEmail)}/messages?$top=1&$select=id`)
  if (res.ok) return { granted: true, status: res.status }
  const err = await res.json().catch(() => ({}))
  return { granted: false, status: res.status, error: err?.error?.message || 'Access denied' }
}

/**
 * List recent messages in a user's inbox. Caller decides what to do with them.
 */
export type GraphMessage = {
  id: string
  subject: string
  bodyPreview: string
  body?: { contentType: string; content: string }
  from?: { emailAddress: { address: string; name: string } }
  toRecipients: { emailAddress: { address: string; name?: string } }[]
  ccRecipients: { emailAddress: { address: string; name?: string } }[]
  receivedDateTime: string
  conversationId: string
  internetMessageId: string
}

export async function getMessage(userEmail: string, messageId: string): Promise<GraphMessage | null> {
  const path = `/users/${encodeURIComponent(userEmail)}/messages/${encodeURIComponent(messageId)}?$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,conversationId,internetMessageId`
  const res = await graphFetch(path)
  if (!res.ok) {
    if (res.status === 404) return null
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `getMessage failed: ${res.status}`)
  }
  return res.json()
}

// ── Webhook subscriptions ──

export type GraphSubscription = {
  id: string
  resource: string
  changeType: string
  clientState?: string
  notificationUrl: string
  expirationDateTime: string
}

/** Maximum subscription lifetime for /messages resource is ~4230 minutes (~70.5 hours). */
const MAX_MESSAGE_SUBSCRIPTION_MINUTES = 4230

export async function createMessageSubscription(opts: {
  userEmail: string
  notificationUrl: string
  clientState: string
  expiresInMinutes?: number
}): Promise<GraphSubscription> {
  const minutes = Math.min(opts.expiresInMinutes ?? MAX_MESSAGE_SUBSCRIPTION_MINUTES, MAX_MESSAGE_SUBSCRIPTION_MINUTES)
  const resource = `users/${opts.userEmail}/messages`
  const expirationDateTime = new Date(Date.now() + minutes * 60 * 1000).toISOString()
  const res = await graphFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      changeType: 'created,updated',
      notificationUrl: opts.notificationUrl,
      resource,
      expirationDateTime,
      clientState: opts.clientState,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `createSubscription failed: ${res.status}`)
  }
  return res.json()
}

export async function renewSubscription(subscriptionId: string, expiresInMinutes = MAX_MESSAGE_SUBSCRIPTION_MINUTES): Promise<GraphSubscription> {
  const minutes = Math.min(expiresInMinutes, MAX_MESSAGE_SUBSCRIPTION_MINUTES)
  const expirationDateTime = new Date(Date.now() + minutes * 60 * 1000).toISOString()
  const res = await graphFetch(`/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ expirationDateTime }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `renewSubscription failed: ${res.status}`)
  }
  return res.json()
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const res = await graphFetch(`/subscriptions/${subscriptionId}`, { method: 'DELETE' })
  // 404 is fine — already gone
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `deleteSubscription failed: ${res.status}`)
  }
}

export async function listInboxMessages(userEmail: string, options: { sinceIso?: string; top?: number } = {}): Promise<GraphMessage[]> {
  const top = options.top ?? 50
  const filter = options.sinceIso ? `&$filter=receivedDateTime gt ${options.sinceIso}` : ''
  const select = '&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,conversationId,internetMessageId'
  const path = `/users/${encodeURIComponent(userEmail)}/messages?$top=${top}&$orderby=receivedDateTime desc${filter}${select}`
  const res = await graphFetch(path)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `listInboxMessages failed: ${res.status}`)
  }
  const data = await res.json()
  return data.value || []
}
