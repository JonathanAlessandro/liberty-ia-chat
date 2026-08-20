export function latestScrollOffset(scrollHeight: number, clientHeight: number) {
  return Math.max(0, scrollHeight - clientHeight);
}
