import type { AnchorHTMLAttributes } from "react";
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      onClick={(event) => {
        if (props.href?.startsWith("/admin")) {
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent("agency-preview-navigate", { detail: props.href }),
          );
        } else props.onClick?.(event);
      }}
    />
  );
}
