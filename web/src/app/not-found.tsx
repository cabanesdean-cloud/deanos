import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Page not found</h1>
        <p>
          That page does not exist. Try the <Link href="/">home page</Link>, the <Link href="/explore">explorer</Link>{" "}
          or the <Link href="/methodology">methodology</Link>.
        </p>
      </header>
    </div>
  );
}
