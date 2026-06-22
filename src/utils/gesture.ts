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

  // Calculate palm direction
  const palmDir = normalize({
    x: middle.mcp.x - wrist.x,
    y: middle.mcp.y - wrist.y,
  });

  // Get direction of each finger (MCP to TIP)
  const thumbDir = normalize({
    x: thumb.tip.x - thumb.mcp.x,
    y: thumb.tip.y - thumb.mcp.y,
  });
  const indexDir = normalize({
    x: index.tip.x - index.mcp.x,
    y: index.tip.y - index.mcp.y,
  });
  const middleDir = normalize({
    x: middle.tip.x - middle.mcp.x,
    y: middle.tip.y - middle.mcp.y,
  });
  const ringDir = normalize({
    x: ring.tip.x - ring.mcp.x,
    y: ring.tip.y - ring.mcp.y,
  });
  const pinkyDir = normalize({
    x: pinky.tip.x - pinky.mcp.x,
    y: pinky.tip.y - pinky.mcp.y,
  });

  // How aligned are they with the palm?
  // ~1.0 = straight up, < 0 = folded down/curled
  const indexAlign = dot(indexDir, palmDir);
  const middleAlign = dot(middleDir, palmDir);
  const ringAlign = dot(ringDir, palmDir);
  const pinkyAlign = dot(pinkyDir, palmDir);

  const indexUp = indexAlign > 0.6;
  const middleUp = middleAlign > 0.6;
  const ringUp = ringAlign > 0.6;
  const pinkyUp = pinkyAlign > 0.6;

  const indexDown = indexAlign < 0.2;
  const middleDown = middleAlign < 0.2;
  const ringDown = ringAlign < 0.2;
  const pinkyDown = pinkyAlign < 0.2;

  // Thumb check: does it point somewhat away from the palm?
  const thumbExtendDist =
    distance(thumb.tip, pinky.mcp) > distance(thumb.ip, pinky.mcp) * 1.2;

  const indexMiddleDist = distance(index.tip, middle.tip);
  const indexMiddleBaseDist = distance(index.mcp, middle.mcp);
  const thumbIndexDist = distance(thumb.tip, index.tip);

  // M and W
  if (!thumbExtendDist && indexUp && middleUp && ringUp && !pinkyUp) return "W";

  // For M, the fingers index, middle, ring are pointing "forward" or "down" (not aligned with palm)
  // while the hand is usually positioned such that the palm faces the camera.
  // Actually, M in Libras is fingers 2,3,4 pointing down.
  // The pinky is folded tight (very low alignment or very close to mcp).
  // M definition: Index, Middle, Ring are 'down', Pinky is 'down' tighter.
  // Wait, if all are down it can be a fist.
  // Let's use distances for 'curled' vs 'tightly folded'
  const isIndexFolded = distance(index.tip, wrist) < distance(index.pip, wrist);
  const isMiddleFolded =
    distance(middle.tip, wrist) < distance(middle.pip, wrist);
  const isRingFolded = distance(ring.tip, wrist) < distance(ring.pip, wrist);
  const isPinkyFolded = distance(pinky.tip, wrist) < distance(pinky.pip, wrist);

  // 5 (Open Palm)
  if (thumbExtendDist && indexUp && middleUp && ringUp && pinkyUp) return "5";

  // B (All 4 up, thumb folded)
  if (!thumbExtendDist && indexUp && middleUp && ringUp && pinkyUp) return "B";

  // F: Index pointing down/curled (tip touching thumb), others up
  if (middleUp && ringUp && pinkyUp && !indexUp) {
    if (thumbIndexDist < indexMiddleBaseDist * 1.5) return "F";
  }

  // Y: Thumb extended, pinky extended UP
  if (thumbExtendDist && !indexUp && !middleUp && !ringUp && pinkyUp)
    return "Y";

  // L: Thumb extended, index extended vertically
  if (thumbExtendDist && indexUp && !middleUp && !ringUp && !pinkyUp)
    return "L";

  // V & U & R: Index and middle extended and up
  if (!thumbExtendDist && indexUp && middleUp && !ringUp && !pinkyUp) {
    if (indexMiddleDist > indexMiddleBaseDist * 1.3) return "V";

    // Crossed (R)
    const perpDir = normalize({ x: -palmDir.y, y: palmDir.x });
    // evaluate side-to-side position of tips based on perpendicular vector
    const indexSide = dot(
      { x: index.tip.x - wrist.x, y: index.tip.y - wrist.y },
      perpDir,
    );
    const middleSide = dot(
      { x: middle.tip.x - wrist.x, y: middle.tip.y - wrist.y },
      perpDir,
    );
    const indexBaseSide = dot(
      { x: index.mcp.x - wrist.x, y: index.mcp.y - wrist.y },
      perpDir,
    );
    const middleBaseSide = dot(
      { x: middle.mcp.x - wrist.x, y: middle.mcp.y - wrist.y },
      perpDir,
    );

    // If their relative positions are inverted at the tips compared to the bases, they are crossed
    if (
      (indexSide > middleSide && indexBaseSide < middleBaseSide) ||
      (indexSide < middleSide && indexBaseSide > middleBaseSide)
    ) {
      return "R";
    }

    return "U";
  }

  // I: Only pinky extended
  if (!thumbExtendDist && !indexUp && !middleUp && !ringUp && pinkyUp)
    return "I";

  // D: Index extended up, others closed
  if (!thumbExtendDist && indexUp && !middleUp && !ringUp && !pinkyUp) {
    // Prevent confusing D with O
    if (distance(thumb.tip, middle.tip) < indexMiddleBaseDist) return "D"; // (thumb touching middle finger)
    return "D";
  }

  // M: Index, middle, ring are 'down' (not up) and NOT folded tight to palm, while pinky IS folded tight.
  // Let's distinguish M and N by checking if ring finger is tight folded or just pointing down.
  // Actually, M has 3 fingers pointing down, N has 2 fingers pointing down.
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    // A / S: all fingers tightly folded
    if (isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded) {
      if (thumbExtendDist) return "A";
      return "S";
    }

    // Distinguish M and N:
    // M has index, middle, ring hanging over thumb. Pinky is tight folded.
    // N has index, middle hanging over thumb. Ring & pinky tight folded.
    if (!isIndexFolded && !isMiddleFolded && !isRingFolded && isPinkyFolded)
      return "M";
    if (!isIndexFolded && !isMiddleFolded && isRingFolded && isPinkyFolded)
      return "N";
  }

  // O: Tips touching thumb forming O shape
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    if (
      thumbIndexDist < indexMiddleBaseDist * 1.5 &&
      distance(thumb.tip, middle.tip) < indexMiddleBaseDist * 1.5 &&
      distance(thumb.tip, pinky.tip) > indexMiddleBaseDist // pinky not tightly touching
    ) {
      return "O";
    }
  }

  // E: Tightly clawed, tips of fingers clustered near the thumb tip or palm but not O
  if (!indexUp && !middleUp && !pinkyUp && !ringUp) {
    // If they form a claw, tips are relatively close to each other
    const clawDist = distance(index.tip, pinky.tip);
    if (clawDist < indexMiddleBaseDist * 2.5 && isIndexFolded && isMiddleFolded) {
       // if thumb is also somewhat tucked
       if (!thumbExtendDist) {
          // It's very hard to perfectly separate A, S, E with basic 2D keypoints
          // We'll let E be distinguished if it's tightly curled but not a full fist.
          // Since we might not have a perfect classifier, let's just return E if fingers are curled
          // and thumb is also tucked, and not O.
          // Let's refine A vs S vs E
       }
    }
  }

  // Let's simplify and make robust rules for the closed hand states:
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    
    // Distinguish M and N:
    // M has index, middle, ring hanging over thumb. Pinky is tight folded.
    // N has index, middle hanging over thumb. Ring & pinky tight folded.
    if (!isIndexFolded && !isMiddleFolded && !isRingFolded && isPinkyFolded) return "M";
    if (!isIndexFolded && !isMiddleFolded && isRingFolded && isPinkyFolded) return "N";

    // If completely folded:
    if (isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded) {
      if (thumbExtendDist) return "A";
      
      // S vs E:
      // In S, the thumb crosses over the fingers (thumb tip is closer to ring/pinky).
      // In E, the thumb is tucked or tips are together.
      // Let's just use proximity of thumb tip to index/middle vs ring.
      if (distance(thumb.tip, index.pip) < indexMiddleBaseDist * 1.5) {
         return "E"; 
      }
      return "S";
    }
  }
  
  return null;
};
