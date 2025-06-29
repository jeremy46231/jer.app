'use client'
import { signIn } from '@/auth'

export default function SignIn() {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await signIn()
      }}
    >
      <button type="submit">Sign in</button>
    </form>
  )
}
