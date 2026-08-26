"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/draft", label: "War Room" },
  { href: "/week", label: "This Week" },
];

export default function Nav() {
  const path = usePathname();
  // The live draft board is shared with people outside this tool; it stands alone.
  if (path?.startsWith("/draftboard")) return null;
  return (
    <nav className="nav">
      <div className="wrap nav-in">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
