import { SubtitleFormat } from '../../utils/types';
import { msToSrtTime } from './srtRender';
import { msToVttTime } from './vttRender';
import { msToAssTime } from './assRender';

export function formatSubtitleTime(ms: number, format: SubtitleFormat = 'srt'): string {
  if (format === 'vtt') return msToVttTime(ms);
  if (format === 'ass') return msToAssTime(ms);
  return msToSrtTime(ms);
}
