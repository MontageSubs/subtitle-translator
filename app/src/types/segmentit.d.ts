declare module "segmentit" {
  export interface SegmentToken {
    w: string;
    p?: number;
  }

  export class Segment {
    doSegment(text: string): SegmentToken[];
    loadDict(dict: string | string[], type?: string, convertToLower?: boolean): Segment;
    getDict(type: string): Record<string, unknown>;
    use(module: unknown): Segment;
    readonly POSTAG: Record<string, number>;
  }

  export function useDefault(segment: Segment): Segment;
}
