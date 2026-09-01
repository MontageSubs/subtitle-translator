const ASCII_ART = `
╭┬╮╭─╮╭╮╷╶┬╴╭─╮╭─╴╭─╴╭─╮╷ ╷╭╮ ╭─╮
││││ ││╰┤ │ ├─┤│╶╮├╴ ╰─╮│ │├┴╮╰─╮
╵ ╵╰─╯╵ ╵ ╵ ╵ ╵╰─╯╰─╴╰─╯╰─╯╰─╯╰─╯
`;

let hasPrinted = false;

export function printBrandBanner(): void {
  if (typeof window === 'undefined' || hasPrinted) {
    return;
  }
  
  hasPrinted = true;

  const print = () => {
    const banner = [
      `\n%c${ASCII_ART.replace(/^\n/, '')}\n`,
      `%cPowered by Love ❤️ MontageSubs\n`,
      `%cA bridge of understanding, linking every heart.\n`,
      `%cLet's craft this together.\n\n`,
      `%cBuild with us: %chttps://github.com/MontageSubs/subtitle-translator\n\n`
    ].join('');

    console.log(
      banner,
      'font-family: monospace; font-weight: 700; color: #6366f1; line-height: 1.25;',
      'font-family: system-ui, sans-serif; font-size: 13px; font-weight: 700; color: #1e293b;',
      'font-family: system-ui, sans-serif; font-size: 12px; color: #64748b;',
      'font-family: system-ui, sans-serif; font-size: 12px; font-weight: 600; color: #0284c7;',
      'font-family: system-ui, sans-serif; font-size: 12px; color: #64748b;',
      'font-family: system-ui, sans-serif; font-size: 12px; color: #4f46e5; text-decoration: underline; font-weight: 600;'
    );
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(print);
  } else {
    setTimeout(print, 1000);
  }
}
