export function setPageMeta({
  title,
  description,
  ogTitle,
  ogDescription,
}: {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
}) {
  document.title = title;
  setMeta("description", description);
  setMeta("og:title", ogTitle ?? title);
  setMeta("og:description", ogDescription ?? description);
  setMeta("twitter:title", ogTitle ?? title);
  setMeta("twitter:description", ogDescription ?? description);
  setMeta("twitter:card", "summary_large_image");
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    if (name.startsWith("og:")) el.setAttribute("property", name);
    else el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
