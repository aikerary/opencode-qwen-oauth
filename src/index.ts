import type { Hooks, PluginInput } from "@opencode-ai/plugin"

interface QwenOAuth {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  resourceUrl?: string
}

const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

const CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56"
const SCOPE = "openid profile email model.completion"
const DEVICE_CODE_URL = "https://chat.qwen.ai/api/v1/oauth2/device/code"
const TOKEN_URL = "https://chat.qwen.ai/api/v1/oauth2/token"
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

interface PkceCodes {
  verifier: string
  challenge: string
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("")
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

interface QwenTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  resource_url?: string
}

async function refreshQwenToken(refreshToken: string): Promise<QwenTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    if (response.status === 400) {
      throw new Error(`Qwen refresh token expired or invalid. Please re-authenticate. ${errorText}`)
    }
    throw new Error(`Qwen token refresh failed: ${response.status} ${errorText}`)
  }

  return response.json() as Promise<QwenTokenResponse>
}

function normalizeEndpoint(resourceUrl: string | undefined): string {
  if (!resourceUrl) return DEFAULT_BASE_URL

  let url = resourceUrl.startsWith("http") ? resourceUrl : `https://${resourceUrl}`

  if (!url.endsWith("/v1")) {
    url = url.endsWith("/") ? `${url}v1` : `${url}/v1`
  }

  return url
}

function extractApiSuffix(pathname: string): string {
  const v1Index = pathname.lastIndexOf("/v1")
  if (v1Index === -1) return pathname
  return pathname.slice(v1Index + 3)
}

function stripAuthorizationHeaders(init?: RequestInit): void {
  if (!init?.headers) return
  if (init.headers instanceof Headers) {
    init.headers.delete("authorization")
    init.headers.delete("Authorization")
  } else if (Array.isArray(init.headers)) {
    init.headers = init.headers.filter(([key]) => key.toLowerCase() !== "authorization")
  } else {
    delete (init.headers as Record<string, string>)["authorization"]
    delete (init.headers as Record<string, string>)["Authorization"]
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const QwenAuthPlugin = async (input: PluginInput): Promise<Hooks> => {
  let cachedResourceUrl: string | undefined

  return {
    auth: {
      provider: "alibaba-oauth",
      // @ts-expect-error name field supported by opencode >=0.3.x but not yet in published plugin types
      name: "Alibaba (OAuth)",
      async loader(getAuth, _provider) {
        const auth = (await getAuth()) as QwenOAuth | null
        if (!auth || auth.type !== "oauth") return {}
        if (auth.resourceUrl) {
          cachedResourceUrl = auth.resourceUrl
        }

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: string | URL | Request, init?: RequestInit) {
            stripAuthorizationHeaders(init)

            const currentAuth = (await getAuth()) as QwenOAuth
            if (currentAuth.type !== "oauth") return fetch(requestInput, init)

            const missingResourceUrl = !currentAuth.resourceUrl && !cachedResourceUrl
            if (!currentAuth.access || currentAuth.expires < Date.now() || missingResourceUrl) {
              const tokens = await refreshQwenToken(currentAuth.refresh)
              const newRefresh = tokens.refresh_token || currentAuth.refresh
              const newAccess = tokens.access_token
              const newExpires = Date.now() + (tokens.expires_in ?? 3600) * 1000
              const newResourceUrl = tokens.resource_url || currentAuth.resourceUrl || cachedResourceUrl

              cachedResourceUrl = newResourceUrl

              await input.client.auth.set({
                path: { id: "alibaba-oauth" },
                body: {
                  type: "oauth",
                  refresh: newRefresh,
                  access: newAccess,
                  expires: newExpires,
                  resourceUrl: newResourceUrl,
                } as any,
              })

              currentAuth.access = newAccess
              currentAuth.resourceUrl = newResourceUrl
            }

            const headers = new Headers()
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.forEach((value, key) => headers.set(key, value))
              } else if (Array.isArray(init.headers)) {
                for (const [key, value] of init.headers) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              } else {
                for (const [key, value] of Object.entries(init.headers)) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              }
            }

            headers.set("Authorization", `Bearer ${currentAuth.access}`)
            headers.set("User-Agent", `QwenCode/opencode (${process.platform}; ${process.arch})`)
            headers.set("X-DashScope-CacheControl", "enable")
            headers.set("X-DashScope-UserAgent", `QwenCode/opencode (${process.platform}; ${process.arch})`)
            headers.set("X-DashScope-AuthType", "qwen-oauth")

            const endpoint = normalizeEndpoint(cachedResourceUrl || currentAuth.resourceUrl)
            const parsed =
              requestInput instanceof URL
                ? requestInput
                : new URL(typeof requestInput === "string" ? requestInput : (requestInput as Request).url)

            const apiSuffix = extractApiSuffix(parsed.pathname)
            const rewrittenUrl = new URL(endpoint + apiSuffix + parsed.search)

            return fetch(rewrittenUrl, {
              ...init,
              headers,
            })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with Qwen (Alibaba Cloud)",
          async authorize() {
            const pkce = await generatePKCE()

            const deviceResponse = await fetch(DEVICE_CODE_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
              },
              body: new URLSearchParams({
                client_id: CLIENT_ID,
                scope: SCOPE,
                code_challenge: pkce.challenge,
                code_challenge_method: "S256",
              }).toString(),
            })

            if (!deviceResponse.ok) {
              throw new Error("Failed to initiate Qwen device authorization")
            }

            const deviceData = (await deviceResponse.json()) as {
              device_code: string
              user_code: string
              verification_uri: string
              verification_uri_complete: string
              expires_in: number
            }

            return {
              url: deviceData.verification_uri_complete,
              instructions: `Enter code: ${deviceData.user_code}`,
              method: "auto" as const,
              async callback() {
                let pollInterval = 2000

                while (true) {
                  const response = await fetch(TOKEN_URL, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                      Accept: "application/json",
                    },
                    body: new URLSearchParams({
                      grant_type: DEVICE_GRANT_TYPE,
                      client_id: CLIENT_ID,
                      device_code: deviceData.device_code,
                      code_verifier: pkce.verifier,
                    }).toString(),
                  })

                  if (response.ok) {
                    const data = (await response.json()) as QwenTokenResponse
                    if (data.access_token) {
                      cachedResourceUrl = data.resource_url
                      return {
                        type: "success" as const,
                        refresh: data.refresh_token || "",
                        access: data.access_token,
                        expires: Date.now() + (data.expires_in ?? 3600) * 1000,
                        resourceUrl: data.resource_url,
                      }
                    }
                  } else {
                    const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>

                    if (response.status === 400 && errorBody.error === "authorization_pending") {
                      await sleep(pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                      continue
                    }

                    if (response.status === 429 || errorBody.error === "slow_down") {
                      pollInterval = Math.min(Math.round(pollInterval * 1.5), 10000)
                      await sleep(pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                      continue
                    }

                    if (errorBody.error) return { type: "failed" as const }
                  }

                  await sleep(pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                }
              },
            }
          },
        },
      ],
    },
  }
}
