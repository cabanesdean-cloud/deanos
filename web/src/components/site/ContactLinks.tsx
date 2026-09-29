import { contactLinks } from "@/lib/site";

/** Verified contact and profile links; renders nothing when none are set. */
export function ContactLinks({ className, github = true }: { className?: string; github?: boolean }) {
  const links = contactLinks({ github });
  if (!links.length) return null;
  return (
    <ul className={`contact-links${className ? ` ${className}` : ""}`} aria-label="Contact and profiles">
      {links.map((l) => (
        <li key={l.id}>
          <a href={l.href} {...(l.id === "email" ? {} : { rel: "me noopener" })}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
