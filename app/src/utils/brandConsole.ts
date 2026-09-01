const ASCII_ART = String.raw`
 __  __             _                   ____        _         
|  \/  | ___  _ __ | |_ __ _  __ _  ___/ ___| _   _| |__  ___ 
| |\/| |/ _ \| '_ \| __/ _\` |/ _\` |/ _ \___ \| | | | '_ \/ __|
| |  | | (_) | | | | || (_| | (_| |  __/___) | |_| | |_) \__ \
|_|  |_|\___/|_| |_|\__\__,_|\__, |\___|____/ \__,_|_.__/|___/
                             |___/ 
`;

let hasPrinted = false;

export function printBrandBanner(): void {
  if (typeof window === 'undefined' || hasPrinted) {
    return;
  }
  
  hasPrinted = true;

  const print = () => {
    const banner = [
      `\n%c${ASCII_ART.replace(/\\`/g, '`').replace(/^\n/, '')}\n`,
      `%cPowered by Love ❤️ MontageSubs\n\n`,
      `%cA bridge of understanding, linking every heart.\n`,
      `Let's craft this together.\n\n`,
      `%cBuild with us: %chttps://github.com/MontageSubs/subtitle-translator\n\n`
    ].join('');

    console.log(
      banner,
      'font-family: monospace; font-weight: 700; color: #f59e0b; line-height: 1.2;',
      'font-family: system-ui, sans-serif; font-size: 13px; font-weight: 700;',
      'font-family: system-ui, sans-serif; font-size: 12px; font-weight: 400; font-style: italic;',
      'font-family: system-ui, sans-serif; font-size: 12px; font-weight: 400;',
      'font-family: system-ui, sans-serif; font-size: 12px; color: #3b82f6; text-decoration: underline;'
    );
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(print);
  } else {
    setTimeout(print, 1000);
  }
}
