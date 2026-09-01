export function snsCardFilename(title: string, index: number, assetPath?: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "card-news";
  const extension = assetPath?.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() ?? "jpg";
  return `${safe}-${String(index).padStart(2, "0")}.${extension}`;
}
