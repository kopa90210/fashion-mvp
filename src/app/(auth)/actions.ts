'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import {onboardingDestination} from '@/src/lib/auth/onboarding'
import { appOrigin, signupFailure } from '@/src/lib/auth/signup'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword(data)

  if (error || !authData?.user) {
    console.error('Login failed')
    redirect('/login?error=Could not authenticate user')
  }

  const destination=await onboardingDestination(supabase,authData.user.id)
  revalidatePath('/', 'layout')
  redirect(destination)
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
    const { message, diagnostic } = signupFailure(error)
    console.error('Signup failed:', diagnostic)
    redirect('/signup?error=' + encodeURIComponent(message))
  }

  if (!authData.session) redirect('/signup?status=check-email')

  revalidatePath('/', 'layout')
  redirect('/quiz')
}
