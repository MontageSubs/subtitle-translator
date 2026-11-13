export interface DetectionResult {
  code: string;
  reliable: boolean;
}

export interface DetectionRequest {
  id: number;
  texts: string[];
}

export interface DetectionResponse {
  id: number;
  results: (DetectionResult | null)[];
}
