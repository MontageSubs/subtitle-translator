import { SubtitleFormat } from '../types';
import { msToAssTime, msToSrtTime, msToVttTime } from './clock';

const FORMATTERS: Record<SubtitleFormat, (ms: number) => string> = {
  srt: msToSrtTime,
  vtt: msToVttTime,
  ass: msToAssTime,
};

export function formatSubtitleTime(ms: number, format: SubtitleFormat = 'srt'): string {
  return FORMATTERS[format](ms);
}
