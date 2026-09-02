import type { AnchorHTMLAttributes } from "react";
import { handleLinkClick } from "@/lib/router";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

/** An in-app link: a real anchor (right-click, middle-click and copy-link all
 *  work) that navigates through history on a plain click. */
export default function Link({ href, replace, onClick, ...rest }: Props) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        handleLinkClick(e, href, replace);
      }}
    />
  );
}
