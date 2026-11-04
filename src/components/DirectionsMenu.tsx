import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CornerUpRight, ChevronDown } from "lucide-react";
import type { Position } from "../lib/types";

export default function DirectionsMenu({
  destination,
}: {
  destination: Position;
}) {
  const [open, setOpen] = useState(false);
  const providersId = useId();
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => setOpen(false), [destination[0], destination[1]]);
  const coordinate = `${destination[1]},${destination[0]}`;
  const apple = new URL("https://maps.apple.com/directions");
  apple.searchParams.set("destination", coordinate);
  apple.searchParams.set("mode", "walking");
  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", coordinate);
  google.searchParams.set("travelmode", "walking");
  return (
    <div
      className="directions-menu"
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        className="primary directions-trigger"
        ref={trigger}
        aria-expanded={open}
        aria-controls={open ? providersId : undefined}
        onClick={() => setOpen(!open)}
      >
        <span>
          <CornerUpRight size={20} /> Directions
        </span>
        <span>
          Apple / Google <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <div
          className="directions-providers"
          id={providersId}
          aria-label="Directions providers"
        >
          <p>Walking route · provider calculates independently</p>
          <a href={apple.href} target="_blank" rel="noopener noreferrer">
            Apple Maps <ArrowUpRight size={14} />
          </a>
          <a href={google.href} target="_blank" rel="noopener noreferrer">
            Google Maps <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </div>
  );
}
