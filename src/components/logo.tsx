import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The wiscourse mark: two chevrons that read as a W and as a fast-forward
 * control. The viewBox is trimmed to the exact ink bounds — stroke half-width
 * 3.25 is folded into the path — so the shape touches all four edges. That is
 * what lets `Logo` sit the mark on the text baseline instead of guessing at it.
 *
 * Size it by height; the width is fixed to the 50.5 : 32.5 aspect.
 */
export function LogoMark({ className }: { className?: string }) {
  // ids must be unique per instance; the mark can appear more than once a page
  const uid = useId().replace(/:/g, "");
  const W = "M3.25 3.25 L14.25 29.25 L25.25 3.25 L36.25 29.25 L47.25 3.25";

  return (
    <svg
      viewBox="0 0 50.5 32.5"
      fill="none"
      strokeWidth={6.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-6 w-auto", className)}
      aria-hidden="true"
    >
      {/* One continuous W drawn twice, each copy clipped to its own half. Two
          separate chevrons would put a round cap on each side of the shared
          apex, and whichever was painted second would bury the other's
          terminal — making that half look half a stroke shorter. Splitting at
          the apex gives each colour exactly half of the join. */}
      <defs>
        <clipPath id={`${uid}-l`}>
          <rect x="0" y="0" width="25.25" height="32.5" />
        </clipPath>
        <clipPath id={`${uid}-r`}>
          <rect x="25.25" y="0" width="25.25" height="32.5" />
        </clipPath>
      </defs>
      <path d={W} stroke="var(--brand)" clipPath={`url(#${uid}-l)`} />
      {/* --brand-ink is --foreground in light and a touch dimmer in dark, where
          pure white would bloom against the red. Falls back to currentColor so
          the mark still adapts if it is ever dropped somewhere unthemed. */}
      <path
        d={W}
        stroke="var(--brand-ink, currentColor)"
        clipPath={`url(#${uid}-r)`}
      />
    </svg>
  );
}

/**
 * The name, as outlines rather than live text. `system-ui` resolves to a
 * different typeface on every platform, which would change the shape of the
 * logo per visitor; these paths are Inter SemiBold at -3.5% tracking, frozen.
 * Generated from the font — do not hand-edit. Red holds `wisc`, the same stem
 * as wisc.edu, so the two halves share the `c` and the word reads as one.
 *
 * Sized in em, so it scales with font-size exactly as the live text did.
 *
 * The viewBox is tight to the ink, and the round letters overshoot 0.0112em
 * below the baseline, so the box bottom is not the baseline. The translate puts
 * it back. It has to be a transform, not a margin: an inline replaced element
 * takes its baseline from the bottom *margin* edge, but a flex item synthesizes
 * one from its *border* box, so a margin correction would apply in a sentence
 * and silently not apply inside `Logo`.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="21.5 -762.2 4648.7 773.4"
      className={cn(
        "h-[0.7734em] w-[4.6487em] translate-y-[0.0112em]",
        className,
      )}
      role="img"
      aria-label="wiscourse"
    >
      <path fill="var(--brand)" d="M184 0 21 -546H155L209 -332Q221 -279 236 -216Q250 -153 264 -76H248Q261 -151 276 -215Q291 -278 305 -332L360 -546H481L535 -332Q548 -279 563 -216Q578 -152 591 -76H575Q588 -152 602 -215Q616 -278 629 -332L683 -546H818L655 0H526L462 -223Q453 -256 443 -295Q434 -333 425 -374Q417 -414 408 -451H431Q422 -414 413 -374Q404 -333 395 -294Q386 -255 376 -223L312 0ZM872 0V-546H999V0ZM935 -623Q905 -623 883 -644Q861 -664 861 -692Q861 -722 883 -742Q905 -762 935 -762Q966 -762 988 -742Q1009 -722 1009 -693Q1009 -664 988 -644Q966 -623 935 -623ZM1305 11Q1242 11 1194 -7Q1145 -25 1114 -60Q1083 -94 1074 -144L1193 -166Q1204 -125 1232 -106Q1261 -86 1307 -86Q1354 -86 1382 -105Q1409 -124 1409 -151Q1409 -175 1391 -190Q1373 -206 1336 -214L1242 -234Q1165 -250 1127 -289Q1089 -327 1089 -387Q1089 -438 1117 -475Q1145 -512 1194 -532Q1244 -553 1309 -553Q1371 -553 1416 -535Q1461 -518 1488 -486Q1516 -455 1527 -412L1413 -390Q1404 -418 1380 -438Q1355 -458 1311 -458Q1270 -458 1243 -440Q1216 -422 1216 -395Q1216 -371 1234 -355Q1252 -339 1294 -331L1387 -311Q1464 -294 1502 -258Q1539 -221 1539 -164Q1539 -112 1510 -73Q1480 -33 1427 -11Q1374 11 1305 11ZM1850 11Q1770 11 1711 -24Q1653 -60 1621 -123Q1589 -186 1589 -270Q1589 -355 1621 -419Q1653 -482 1711 -518Q1770 -553 1850 -553Q1895 -553 1934 -541Q1973 -529 2004 -507Q2035 -485 2055 -453Q2076 -421 2085 -381L1966 -356Q1961 -377 1951 -395Q1941 -412 1926 -424Q1912 -437 1893 -443Q1874 -450 1851 -450Q1806 -450 1777 -426Q1748 -402 1733 -362Q1718 -322 1718 -271Q1718 -220 1733 -180Q1748 -139 1777 -115Q1806 -92 1851 -92Q1874 -92 1893 -99Q1913 -105 1927 -118Q1942 -131 1953 -149Q1963 -167 1968 -189L2086 -164Q2078 -123 2057 -91Q2036 -59 2005 -36Q1974 -13 1935 -1Q1895 11 1850 11Z" />
      <path fill="currentColor" d="M2397 11Q2318 11 2259 -24Q2200 -60 2168 -123Q2136 -186 2136 -270Q2136 -355 2168 -419Q2200 -482 2259 -518Q2318 -553 2397 -553Q2477 -553 2536 -518Q2594 -482 2626 -419Q2658 -355 2658 -270Q2658 -186 2626 -123Q2594 -60 2536 -24Q2477 11 2397 11ZM2397 -92Q2442 -92 2471 -116Q2501 -140 2515 -180Q2529 -221 2529 -271Q2529 -321 2515 -361Q2501 -402 2471 -426Q2442 -450 2397 -450Q2353 -450 2324 -426Q2295 -402 2280 -362Q2266 -321 2266 -271Q2266 -221 2280 -180Q2295 -140 2324 -116Q2353 -92 2397 -92ZM2921 7Q2865 7 2823 -17Q2781 -41 2757 -87Q2734 -133 2734 -199V-546H2861V-218Q2861 -164 2890 -132Q2918 -101 2968 -101Q3002 -101 3028 -116Q3054 -130 3069 -159Q3084 -187 3084 -226V-546H3212V0H3091L3090 -135H3099Q3076 -63 3032 -28Q2987 7 2921 7ZM3311 0V-546H3435V-455H3440Q3455 -502 3492 -528Q3528 -553 3575 -553Q3586 -553 3599 -552Q3612 -551 3622 -550V-433Q3614 -436 3596 -438Q3579 -439 3561 -439Q3526 -439 3498 -424Q3470 -409 3454 -383Q3438 -356 3438 -321V0ZM3880 11Q3817 11 3769 -7Q3720 -25 3689 -60Q3658 -94 3649 -144L3768 -166Q3779 -125 3807 -106Q3836 -86 3882 -86Q3929 -86 3957 -105Q3984 -124 3984 -151Q3984 -175 3966 -190Q3948 -206 3911 -214L3817 -234Q3740 -250 3702 -289Q3664 -327 3664 -387Q3664 -438 3692 -475Q3720 -512 3769 -532Q3819 -553 3884 -553Q3946 -553 3991 -535Q4036 -518 4063 -486Q4091 -455 4102 -412L3988 -390Q3979 -418 3955 -438Q3930 -458 3886 -458Q3845 -458 3818 -440Q3791 -422 3791 -395Q3791 -371 3809 -355Q3827 -339 3869 -331L3962 -311Q4039 -294 4077 -258Q4114 -221 4114 -164Q4114 -112 4085 -73Q4055 -33 4002 -11Q3949 11 3880 11ZM4429 11Q4346 11 4287 -23Q4228 -58 4196 -121Q4164 -184 4164 -270Q4164 -354 4195 -417Q4227 -481 4285 -517Q4343 -553 4421 -553Q4470 -553 4516 -537Q4561 -521 4596 -487Q4631 -453 4650 -401Q4670 -349 4670 -277V-237H4224V-324H4607L4548 -298Q4548 -344 4533 -379Q4519 -414 4491 -434Q4463 -453 4421 -453Q4379 -453 4350 -433Q4321 -414 4305 -381Q4290 -348 4290 -307V-248Q4290 -196 4307 -160Q4325 -125 4357 -106Q4388 -88 4430 -88Q4458 -88 4481 -96Q4504 -104 4520 -120Q4537 -136 4545 -159L4662 -135Q4649 -91 4617 -58Q4585 -25 4538 -7Q4490 11 4429 11Z" />
    </svg>
  );
}

/**
 * Mark plus name. Everything scales from the current font size: the mark is one
 * cap height tall (0.72em) and sits on the baseline of the name, so the lockup
 * holds at any size without retuning.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[0.34em] leading-none",
        className,
      )}
    >
      <LogoMark className="h-[0.72em] w-[1.119em]" />
      <Wordmark />
    </span>
  );
}
