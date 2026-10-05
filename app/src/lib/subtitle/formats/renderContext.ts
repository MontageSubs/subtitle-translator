import { Cue, OutputMode, BilingualStacking, CueLayout } from '../../../utils/types';
import { AnCornerOrDefault } from './topAlign';

export interface CueRenderContext {
  originalById: Map<number, Cue>;
  mode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign: boolean;
  topAlignOverrides?: Map<number, AnCornerOrDefault>;
  cueLayout: CueLayout;
  targetLang: string;
}
