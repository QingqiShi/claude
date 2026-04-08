import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>
      <nav>
        <ul>
          <li><Link href="/dashboard">Analytics Dashboard</Link></li>
          <li><Link href="/products">Product Catalog</Link></li>
          <li><Link href="/settings">Settings</Link></li>
        </ul>
      </nav>
    </main>
  );
}
