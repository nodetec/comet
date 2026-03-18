const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\S+$/;

export function isYouTubeUrl(text: string): boolean {
  return YOUTUBE_URL_RE.test(text);
}

export function extractYouTubeVideoId(text: string): string | null {
  const match =
    /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(text);
  return match?.[2] && match[2].length === 11 ? match[2] : null;
}
