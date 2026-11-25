const retained = new Map<string, HTMLImageElement>();

export function retainAvatars(root: ParentNode): void {
  for (const avatar of root.querySelectorAll<HTMLImageElement>(".avatar-stack img")) {
    const source = avatar.src;
    if (!source || retained.has(source)) continue;
    const image = new Image();
    image.src = source;
    retained.set(source, image);
  }
}
