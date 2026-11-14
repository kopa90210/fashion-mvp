'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import { appOrigin, EMAIL_RATE_LIMIT_MESSAGE, isEmailRateLimit } from '@/src/lib/auth/signup'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    console.error('Login error:', error)
    redirect('/login?error=Could not authenticate user')
  }

  revalidatePath('/', 'layout')
  redirect('/quiz')
}

export async function signup(formData: FormData) {
  let origin: string
  try {
    origin = appOrigin()
  } catch {
    redirect('/signup?error=' + encodeURIComponent('Signup is temporarily unavailable. Please try again later.'))
  }
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  }

  const { data: authData, error } = await supabase.auth.signUp(data)

  if (error) {
    const message = isEmailRateLimit(error)
      ? EMAIL_RATE_LIMIT_MESSAGE
      : 'We could not create your account. Please check your details and try again.'
    redirect('/signup?error=' + encodeURIComponent(message))
  }

  if (!authData.session) redirect('/signup?status=check-email')

  revalidatePath('/', 'layout')
  redirect('/quiz')
}
