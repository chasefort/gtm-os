"use client";

import { useEffect } from "react";
import gsap from "gsap";
import Lenis from "lenis";

/**
 * Landing-page motion. Isolated leaf component, no props, no state.
 *
 * GSAP runs the tweens. An IntersectionObserver decides when, rather than
 * ScrollTrigger: anchor jumps, restored scroll positions and find-in-page all
 * move the page without a normal scroll sequence, and a missed trigger here
 * would leave a section stuck at opacity 0.
 *
 *   data-reveal   staggered rise on entry
 *   data-draw     hairline rule draws left to right
 *   data-sweep    the cobalt marker band sweeps across a line of source text
 *   data-count    counts a number up on entry
 */
export function Choreography() {
  useEffect(() => {
    const root = document.documentElement;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("no-motion");
      return;
    }

    const lenis = new Lenis({ duration: 1.05, wheelMultiplier: 0.9, anchors: true });
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const play = (node: HTMLElement) => {
      if (node.dataset.reveal !== undefined) {
        const group = node.closest("section, .counts") || document.body;
        const order = [...group.querySelectorAll<HTMLElement>("[data-reveal]")].indexOf(node);
        gsap.to(node, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          delay: Math.max(0, order) * 0.06,
          ease: "power3.out",
        });
      }

      if (node.dataset.draw !== undefined) {
        gsap.fromTo(node, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power2.inOut" });
      }

      if (node.dataset.sweep !== undefined) {
        gsap.fromTo(node, { "--sweep": 0 }, { "--sweep": 1, duration: 0.6, delay: 0.3, ease: "power2.out" });
      }

      if (node.dataset.count !== undefined) {
        const target = Number(node.dataset.count || "0");
        const counter = { value: 0 };
        gsap.to(counter, {
          value: target,
          duration: 1.3,
          ease: "power2.out",
          onUpdate: () => {
            node.textContent = String(Math.round(counter.value));
          },
        });
      }
    };

    const reveals = document.querySelectorAll<HTMLElement>("[data-reveal]");
    gsap.set(reveals, { opacity: 0, y: 14 });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          play(entry.target as HTMLElement);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );

    const targets = document.querySelectorAll<HTMLElement>("[data-reveal], [data-draw], [data-sweep], [data-count]");
    targets.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
