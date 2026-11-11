import fs from "node:fs";
for (const f of ["home","signin","signup"]) {
  const j = JSON.parse(fs.readFileSync(`.impeccable/redesign/lighthouse-baseline/${f}.json`, "utf8"));
  const c = j.categories;
  console.log(f, Object.entries(c).map(([k,v]) => `${k}:${Math.round(v.score*100)}`).join(" "), "LCP:", j.audits["largest-contentful-paint"].displayValue, "TBT:", j.audits["total-blocking-time"].displayValue);
}
