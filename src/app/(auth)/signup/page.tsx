import { signup } from '../actions'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default async function SignupPage(props: {
  searchParams: Promise<{ error?: string; status?: string }>
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {searchParams.status === 'check-email' ? 'Check your email' : 'Create an account'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {searchParams.status === 'check-email'
              ? 'Open the confirmation link in your inbox to finish signing up. Check your spam folder too.'
              : 'Enter your email below to create your account'}
          </p>
        </div>
        <div className="grid gap-6">
          {searchParams.status !== 'check-email' && <form action={signup}>
            <div className="grid gap-2">
              <div className="grid gap-1">
                <label className="sr-only" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  placeholder="name@example.com"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  required
                />
              </div>
              <div className="grid gap-1">
                <label className="sr-only" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Sign Up
              </Button>
            </div>
            {searchParams?.error && (
              <p role="alert" className="mt-4 p-4 bg-red-500/10 text-red-500 text-center text-sm rounded-md">
                {searchParams.error}
              </p>
            )}
          </form>}
          <div className="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
