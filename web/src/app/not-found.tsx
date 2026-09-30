import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container">
      <header className="page-head">
        <p>
          <Link href="/">← Dean Cabanes</Link>
        </p>
        <h1>Page not found</h1>
        <p>
          That page does not exist. Try the <Link href="/">home page</Link> or one of the tools:{" "}
          <Link href="/beta">Nonlinear Beta Tracker</Link>, <Link href="/deanos">DeanOS</Link>,{" "}
          <Link href="/options">Options Pricing</Link> or <Link href="/transactions">Transaction ML</Link>.
        </p>
      </header>
    </main>
  );
}
