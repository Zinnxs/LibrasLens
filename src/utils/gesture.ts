export type Point = { x: number; y: number; z?: number };
export type Keypoint = { x: number; y: number; z?: number; name?: string };

const distance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const normalize = (v: Point) => {
  const m = Math.sqrt(v.x * v.x + v.y * v.y);
  return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
};

const dot = (v1: Point, v2: Point) => {
  return v1.x * v2.x + v1.y * v2.y;
};

export const guessGesture = (keypoints: Keypoint[]): string | null => {
  if (!keypoints || keypoints.length < 21) return null;

  const wrist = keypoints[0];
  const thumb = { mcp: keypoints[2], ip: keypoints[3], tip: keypoints[4] };
  const index = { mcp: keypoints[5], pip: keypoints[6], tip: keypoints[8] };
  const middle = { mcp: keypoints[9], pip: keypoints[10], tip: keypoints[12] };
  const ring = { mcp: keypoints[13], pip: keypoints[14], tip: keypoints[16] };
  const pinky = { mcp: keypoints[17], pip: keypoints[18], tip: keypoints[20] };

  const palmDir = normalize({ x: middle.mcp.x - wrist.x, y: middle.mcp.y - wrist.y });
  const indexDir = normalize({ x: index.tip.x - index.mcp.x, y: index.tip.y - index.mcp.y });
  const middleDir = normalize({ x: middle.tip.x - middle.mcp.x, y: middle.tip.y - middle.mcp.y });
  const ringDir = normalize({ x: ring.tip.x - ring.mcp.x, y: ring.tip.y - ring.mcp.y });
  const pinkyDir = normalize({ x: pinky.tip.x - pinky.mcp.x, y: pinky.tip.y - pinky.mcp.y });

  const indexAlign = dot(indexDir, palmDir);
  const middleAlign = dot(middleDir, palmDir);
  const ringAlign = dot(ringDir, palmDir);
  const pinkyAlign = dot(pinkyDir, palmDir);

  // Consider "Up" if it is aligned with palm
  const indexUp = indexAlign > 0.4;
  const middleUp = middleAlign > 0.4;
  const ringUp = ringAlign > 0.4;
  const pinkyUp = pinkyAlign > 0.4;

  const indexFolded = distance(index.tip, wrist) < distance(index.pip, wrist);
  const middleFolded = distance(middle.tip, wrist) < distance(middle.pip, wrist);
  const ringFolded = distance(ring.tip, wrist) < distance(ring.pip, wrist);
  const pinkyFolded = distance(pinky.tip, wrist) < distance(pinky.pip, wrist);

  // Is thumb extended away from the palm?
  const thumbExtendDist = distance(thumb.tip, pinky.mcp) > distance(thumb.ip, pinky.mcp) * 1.1;
  const thumbIndexDist = distance(thumb.tip, index.tip);
  const indexMiddleBaseDist = distance(index.mcp, middle.mcp);
  const indexMiddleDist = distance(index.tip, middle.tip);

  const nUp = (indexUp ? 1 : 0) + (middleUp ? 1 : 0) + (ringUp ? 1 : 0) + (pinkyUp ? 1 : 0);

  // 5 (Open Palm) / B
  if (nUp === 4) {
    if (thumbExtendDist) return "5";
    return "B";
  }

  // W
  if (!thumbExtendDist && indexUp && middleUp && ringUp && !pinkyUp) return "W";

  // K, P, H (Index and Middle extended, thumb extended/between)
  if (thumbExtendDist && !ringUp && !pinkyUp) {
    if (indexUp && middleUp) {
      // H is usually fingers pointing forward/horizontal, K is up. We approximate
      if (Math.abs(palmDir.x) > Math.abs(palmDir.y)) return "H";
      return "K";
    }
    // P is K but pointing down
    if (palmDir.y > 0.5) return "P";
  }

  // V, U, R
  if (!thumbExtendDist && indexUp && middleUp && !ringUp && !pinkyUp) {
    if (indexMiddleDist > indexMiddleBaseDist * 1.3) return "V";
    
    const perpDir = normalize({ x: -palmDir.y, y: palmDir.x });
    const indexSide = dot({ x: index.tip.x - wrist.x, y: index.tip.y - wrist.y }, perpDir);
    const middleSide = dot({ x: middle.tip.x - wrist.x, y: middle.tip.y - wrist.y }, perpDir);
    const indexBaseSide = dot({ x: index.mcp.x - wrist.x, y: index.mcp.y - wrist.y }, perpDir);
    const middleBaseSide = dot({ x: middle.mcp.x - wrist.x, y: middle.mcp.y - wrist.y }, perpDir);

    if ((indexSide > middleSide && indexBaseSide < middleBaseSide) || 
        (indexSide < middleSide && indexBaseSide > middleBaseSide)) {
      return "R";
    }
    return "U";
  }

  // L, G, Q (Thumb and Index extended)
  if (thumbExtendDist && indexUp && !middleUp && !ringUp && !pinkyUp) {
    // If palm points horizontally or down, it's G or Q
    if (palmDir.y > 0.5) return "Q";
    if (Math.abs(palmDir.x) > Math.abs(palmDir.y)) return "G";
    return "L";
  }

  // I, Y, J
  if (!indexUp && !middleUp && !ringUp && pinkyUp) {
    if (thumbExtendDist) return "Y";
    
    // Distinguish J by palm orientation if possible, but they are similar statically.
    // J often has the hand tilted or swooping. We'll return I/J as I for simplicity or use palm.
    if (Math.abs(palmDir.x) > 0.6) return "J"; // Rough proxy for J motion
    return "I";
  }

  // D, Z, X
  if (!thumbExtendDist && indexUp && !middleUp && !ringUp && !pinkyUp) {
    // X is index hooked
    if (distance(index.tip, index.mcp) < distance(index.pip, index.mcp)) return "X";
    
    // Z is D with motion, we proxy with palm horizontal
    if (Math.abs(palmDir.x) > 0.6) return "Z";
    return "D";
  }

  // F, T
  if (!indexUp && middleUp && ringUp && pinkyUp) {
    // In LIBRAS, F is thumb outside index, T is thumb inside index
    // We check if thumb tip is closer to index pip/mcp or further outside
    const thumbToPip = distance(thumb.tip, index.pip);
    const thumbToMcp = distance(thumb.tip, index.mcp);
    if (thumbToPip > thumbToMcp) {
      return "F"; // Thumb is outside/above
    }
    return "T"; // Thumb is tucked inside
  }
  
  // Alternative T and F (others folded)
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    if (!indexFolded && middleFolded && ringFolded && pinkyFolded && thumbIndexDist < indexMiddleBaseDist * 2) {
      const thumbToPip = distance(thumb.tip, index.pip);
      const thumbToMcp = distance(thumb.tip, index.mcp);
      if (thumbToPip > thumbToMcp) return "F";
      return "T";
    }
  }

  // M, N, A, S, E, O, C
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    // C: Fingers are curved, thumb is extended but curved.
    if (!indexFolded && !middleFolded && !ringFolded && !pinkyFolded && thumbExtendDist) {
      if (thumbIndexDist > indexMiddleBaseDist * 1.5 && thumbIndexDist < indexMiddleBaseDist * 5) {
        return "C";
      }
    }

    // O: Tips touching thumb
    if (thumbIndexDist < indexMiddleBaseDist * 1.8 && distance(thumb.tip, middle.tip) < indexMiddleBaseDist * 1.8) {
      return "O";
    }

    // Fully folded?
    if (indexFolded && middleFolded && ringFolded && pinkyFolded) {
      if (thumbExtendDist) return "A";
      
      // E vs S: In S, thumb wraps over fingers. In E, thumb is tucked under or tips touch palm.
      if (distance(thumb.tip, index.pip) < indexMiddleBaseDist * 1.5) {
        return "E"; 
      }
      return "S";
    }

    // M, N: Index, middle, (ring) pointing forward/down over thumb
    if (!indexFolded && !middleFolded && !ringFolded && pinkyFolded) return "M";
    if (!indexFolded && !middleFolded && ringFolded && pinkyFolded) return "N";
  }

  return null;
};

export interface CSVSample {
  label: string;
  points: Point[];
  landmarks?: Record<number, Point>;
}

export interface ColumnMapping {
  colIndex: number;
  header: string;
  targetLandmark: number; // -1 to ignore, or 0-20
  coordinate: "x" | "y" | "z" | "label";
}

export function normalizeLandmarks(points: Point[]): Point[] {
  if (points.length < 21) return points;
  const wrist = points[0];
  
  // Translate relative to wrist (point 0)
  const translated = points.map(p => ({
    x: p.x - wrist.x,
    y: p.y - wrist.y,
    z: p.z !== undefined ? p.z - (wrist.z || 0) : 0
  }));
  
  // Find maximum distance from wrist to any other joint for scaling
  let maxDist = 0.0001;
  for (const p of translated) {
    const d = Math.sqrt(p.x * p.x + p.y * p.y);
    if (d > maxDist) maxDist = d;
  }
  
  // Scale so all points are within [-1, 1] range
  return translated.map(p => ({
    x: p.x / maxDist,
    y: p.y / maxDist,
    z: p.z !== undefined ? p.z / maxDist : 0
  }));
}

export function normalizeCustomLandmarks(landmarks: Record<number, Point>): Record<number, Point> {
  const indices = Object.keys(landmarks).map(Number);
  if (indices.length === 0) return {};

  // Find origin: prefer wrist (0), then lowest index
  const originIndex = indices.includes(0) ? 0 : Math.min(...indices);
  const origin = landmarks[originIndex];

  // Translate relative to origin
  const translated: Record<number, Point> = {};
  for (const idx of indices) {
    const pt = landmarks[idx];
    translated[idx] = {
      x: pt.x - origin.x,
      y: pt.y - origin.y,
      z: pt.z !== undefined ? pt.z - (origin.z || 0) : 0
    };
  }

  // Find scale: max distance from origin
  let maxDist = 0.0001;
  for (const idx of indices) {
    const pt = translated[idx];
    const d = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
    if (d > maxDist) maxDist = d;
  }

  // Scale
  const scaled: Record<number, Point> = {};
  for (const idx of indices) {
    const pt = translated[idx];
    scaled[idx] = {
      x: pt.x / maxDist,
      y: pt.y / maxDist,
      z: pt.z !== undefined ? pt.z / maxDist : 0
    };
  }

  return scaled;
}

export function autoDetectMapping(headers: string[]): ColumnMapping[] {
  const mapping: ColumnMapping[] = [];
  const cleanHeaders = headers.map(h => h.trim().toLowerCase().replace(/['"']/g, ""));
  
  // Find label column index
  let labelIdx = cleanHeaders.findIndex(h => 
    h === "label" || h === "class" || h === "classe" || h === "gesture" || h === "target" || h === "char" || h === "letter" || h === "target_letter"
  );
  if (labelIdx === -1) {
    // Look for any string-like column or fallback to 0
    labelIdx = 0;
  }

  let numericColCount = 0;
  for (let i = 0; i < cleanHeaders.length; i++) {
    if (i !== labelIdx) numericColCount++;
  }

  for (let i = 0; i < headers.length; i++) {
    const header = cleanHeaders[i];
    
    if (i === labelIdx) {
      mapping.push({ colIndex: i, header: headers[i], targetLandmark: -1, coordinate: "label" });
      continue;
    }

    let coord: "x" | "y" | "z" = "x";
    if (header.endsWith("_y") || header.endsWith("y") || header.includes("col_y") || header.includes("_1") || header.includes(".1")) {
      coord = "y";
    } else if (header.endsWith("_z") || header.endsWith("z") || header.includes("col_z") || header.includes("_2") || header.includes(".2")) {
      coord = "z";
    } else {
      coord = "x";
    }

    // Scenario 1: Number in header (e.g. "x0", "y15")
    const numMatch = header.match(/\d+/);
    if (numMatch) {
      const idx = parseInt(numMatch[0], 10);
      if (idx >= 0 && idx <= 20) {
        mapping.push({ colIndex: i, header: headers[i], targetLandmark: idx, coordinate: coord });
        continue;
      }
    }

    // Scenario 2: Keyword mapping
    let landmarkIdx = -1;
    if (header.includes("wrist") || header.includes("pulso") || header.includes("mao") || header.includes("hand")) {
      landmarkIdx = 0;
    } else if (header.includes("polegar") || header.includes("thumb")) {
      landmarkIdx = 4;
    } else if (header.includes("indicador") || header.includes("index")) {
      landmarkIdx = 8;
    } else if (header.includes("medio") || header.includes("middle")) {
      landmarkIdx = 12;
    } else if (header.includes("anelar") || header.includes("ring")) {
      landmarkIdx = 16;
    } else if (header.includes("mindinho") || header.includes("pinky") || header.includes("minimo")) {
      landmarkIdx = 20;
    }

    if (landmarkIdx !== -1) {
      mapping.push({ colIndex: i, header: headers[i], targetLandmark: landmarkIdx, coordinate: coord });
    } else {
      // Scenario 3: Sequence fallback
      const numericSeqIndex = i < labelIdx ? i : i - 1;
      if (numericColCount >= 63) {
        const lIdx = Math.floor(numericSeqIndex / 3);
        const cType = numericSeqIndex % 3 === 0 ? "x" : numericSeqIndex % 3 === 1 ? "y" : "z";
        if (lIdx >= 0 && lIdx <= 20) {
          mapping.push({ colIndex: i, header: headers[i], targetLandmark: lIdx, coordinate: cType });
        }
      } else if (numericColCount >= 42) {
        const lIdx = Math.floor(numericSeqIndex / 2);
        const cType = numericSeqIndex % 2 === 0 ? "x" : "y";
        if (lIdx >= 0 && lIdx <= 20) {
          mapping.push({ colIndex: i, header: headers[i], targetLandmark: lIdx, coordinate: cType });
        }
      } else if (numericColCount === 15) {
        const fingerTips = [4, 8, 12, 16, 20];
        const fIdx = Math.floor(numericSeqIndex / 3);
        const cType = numericSeqIndex % 3 === 0 ? "x" : numericSeqIndex % 3 === 1 ? "y" : "z";
        if (fIdx < 5) {
          mapping.push({ colIndex: i, header: headers[i], targetLandmark: fingerTips[fIdx], coordinate: cType });
        }
      } else if (numericColCount === 10) {
        const fingerTips = [4, 8, 12, 16, 20];
        const fIdx = Math.floor(numericSeqIndex / 2);
        const cType = numericSeqIndex % 2 === 0 ? "x" : "y";
        if (fIdx < 5) {
          mapping.push({ colIndex: i, header: headers[i], targetLandmark: fingerTips[fIdx], coordinate: cType });
        }
      } else {
        mapping.push({ colIndex: i, header: headers[i], targetLandmark: -1, coordinate: "x" });
      }
    }
  }

  return mapping;
}

export function parseCSVWithMapping(csvText: string, mapping: ColumnMapping[]): CSVSample[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];

  const samples: CSVSample[] = [];
  const labelMap = mapping.find(m => m.coordinate === "label");
  const labelColIdx = labelMap ? labelMap.colIndex : 0;
  const activeMappings = mapping.filter(m => m.targetLandmark >= 0);

  const firstLine = lines[0].trim();
  const hasHeader = firstLine.toLowerCase().includes("label") || 
                    firstLine.toLowerCase().includes("class") || 
                    firstLine.toLowerCase().includes("gesture") || 
                    firstLine.toLowerCase().includes("target") || 
                    firstLine.toLowerCase().includes("x") ||
                    firstLine.includes("0,1,2") ||
                    isNaN(Number(firstLine.split(/[;,]/)[1]));
                    
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/[;,]/).map(p => p.trim());
    if (parts.length < Math.max(labelColIdx, ...activeMappings.map(m => m.colIndex)) + 1) {
      continue;
    }

    const label = parts[labelColIdx].toUpperCase().replace(/['"']/g, "").trim();
    if (!label) continue;

    const landmarks: Record<number, Point> = {};
    activeMappings.forEach((map) => {
      const val = parseFloat(parts[map.colIndex]);
      if (isNaN(val)) return;

      if (!landmarks[map.targetLandmark]) {
        landmarks[map.targetLandmark] = { x: 0, y: 0, z: 0 };
      }

      if (map.coordinate === "x") {
        landmarks[map.targetLandmark].x = val;
      } else if (map.coordinate === "y") {
        landmarks[map.targetLandmark].y = val;
      } else if (map.coordinate === "z") {
        landmarks[map.targetLandmark].z = val;
      }
    });

    if (Object.keys(landmarks).length > 0) {
      // Create back-compatible flat points array
      const flatPoints: Point[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
      Object.entries(landmarks).forEach(([idxStr, pt]) => {
        const idx = parseInt(idxStr, 10);
        if (idx >= 0 && idx < 21) {
          flatPoints[idx] = pt;
        }
      });

      samples.push({
        label,
        points: normalizeLandmarks(flatPoints),
        landmarks: normalizeCustomLandmarks(landmarks)
      });
    }
  }

  return samples;
}

export function parseCSV(csvText: string): CSVSample[] {
  // Backwards compatibility
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];
  const firstLine = lines[0].trim();
  const headers = firstLine.split(/[;,]/).map(h => h.trim());
  const mapping = autoDetectMapping(headers);
  return parseCSVWithMapping(csvText, mapping);
}

export function classifyWithKNN(livePoints: Keypoint[], samples: CSVSample[], k = 5): string | null {
  if (!livePoints || livePoints.length === 0 || samples.length === 0) return null;

  // Build live landmarks
  const liveLandmarks: Record<number, Point> = {};
  for (let i = 0; i < Math.min(livePoints.length, 21); i++) {
    liveLandmarks[i] = {
      x: livePoints[i].x,
      y: livePoints[i].y,
      z: livePoints[i].z || 0
    };
  }

  // Get index set from the first sample to compare consistently
  const firstSample = samples[0];
  const activeIndices = firstSample.landmarks 
    ? Object.keys(firstSample.landmarks).map(Number)
    : Array.from({ length: 21 }, (_, i) => i);

  // Normalize live landmarks under the exact same active index set
  const filteredLive: Record<number, Point> = {};
  activeIndices.forEach((idx) => {
    if (liveLandmarks[idx] !== undefined) {
      filteredLive[idx] = liveLandmarks[idx];
    } else {
      filteredLive[idx] = { x: 0, y: 0, z: 0 };
    }
  });

  const liveNorm = normalizeCustomLandmarks(filteredLive);

  const distances = samples.map(sample => {
    let sumSqDiff = 0;
    let count = 0;

    // Use landmarks map if exists, otherwise fallback to flat points array
    const sampleNorm = sample.landmarks 
      ? normalizeCustomLandmarks(sample.landmarks)
      : normalizeCustomLandmarks(
          sample.points.reduce<Record<number, Point>>((acc, pt, idx) => {
            acc[idx] = pt;
            return acc;
          }, {})
        );

    activeIndices.forEach((idx) => {
      const livePt = liveNorm[idx];
      const samplePt = sampleNorm[idx];
      if (livePt && samplePt) {
        const dx = livePt.x - samplePt.x;
        const dy = livePt.y - samplePt.y;
        const dz = (livePt.z || 0) - (samplePt.z || 0);
        sumSqDiff += dx * dx + dy * dy + dz * dz;
        count++;
      }
    });

    const dist = count > 0 ? Math.sqrt(sumSqDiff) : 9999;
    return { label: sample.label, dist };
  });

  // Sort by ascending distance
  distances.sort((a, b) => a.dist - b.dist);
  const topK = distances.slice(0, Math.min(k, distances.length));

  const votes: Record<string, number> = {};
  for (const item of topK) {
    votes[item.label] = (votes[item.label] || 0) + (1.0 / (item.dist + 0.001));
  }

  let bestLabel: string | null = null;
  let maxWeight = -1;
  for (const label of Object.keys(votes)) {
    if (votes[label] > maxWeight) {
      maxWeight = votes[label];
      bestLabel = label;
    }
  }

  return bestLabel;
}

