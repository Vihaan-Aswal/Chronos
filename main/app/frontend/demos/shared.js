/* Shared behaviour only: scrolled header + below-fold reveal.
   Page-specific interactions live in each demo. */
(() => {
  const header = document.querySelector("[data-header]");
  if (header) {
    const setScrolled = () => header.classList.toggle("is-scrolled", window.scrollY > 16);
    setScrolled();
    window.addEventListener("scroll", setScrolled, { passive: true });
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = Array.from(document.querySelectorAll("[data-reveal]"));
  if (reduce || !("IntersectionObserver" in window) || !items.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = Number(el.dataset.revealDelay || 0);
        el.animate(
          [
            { opacity: 0, transform: "translateY(18px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: 620,
            delay,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
        el.style.opacity = "";
        observer.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -36px" },
  );

  items.forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
      el.style.opacity = "0";
      observer.observe(el);
    }
  });

  // Never leave content hidden if the observer cannot fire.
  window.setTimeout(() => {
    items.forEach((el) => {
      if (el.style.opacity === "0") el.style.opacity = "";
    });
  }, 4000);
})();
