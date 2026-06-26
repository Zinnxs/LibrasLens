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
