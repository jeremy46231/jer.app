import SignIn from '@/components/sign-in'
import styles from './page.module.css'

export default function Dashboard() {
  return (
    <div className={styles.page}>
      <main>
        <h1>jer.app</h1>
        <p>This is a simple Next.js application</p>
        <SignIn />
      </main>
    </div>
  )
}
