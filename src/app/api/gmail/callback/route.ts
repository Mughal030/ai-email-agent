/**
 * GET /api/gmail/callback?code=xxx&state=xxx
 * OAuth2 callback — exchanges the auth code for tokens and persists them.
 *
 * Note: requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in env, and the
 * redirect URI registered in the Google Cloud Console.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  exchangeCodeForTokens,
  fetchGoogleEmail,
  upsertGmailAccount,
} from '@/lib/gmail/gmail'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') || ''
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/?gmail_error=${encodeURIComponent(error)}`, req.url)
    )
  }
  if (!code) {
    return NextResponse.redirect(new URL('/?gmail_error=no_code', req.url))
  }

  const userId = state.split(':')[0]
  if (!userId) {
    return NextResponse.redirect(new URL('/?gmail_error=bad_state', req.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    const email = await fetchGoogleEmail(tokens.access_token)
    await upsertGmailAccount({
      userId,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    })
    return NextResponse.redirect(
      new URL('/?gmail_connected=1', req.url)
    )
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/?gmail_error=${encodeURIComponent((e as Error).message)}`,
        req.url
      )
    )
  }
}
