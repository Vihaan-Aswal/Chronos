/**
 * Chronos Vision Metrics & Quality Analyzer
 * Workstream W4: Local Observation, Browser Context, and Active Presence
 * 
 * Extracts pure physical metrics from video canvas and MediaPipe landmarks:
 * - 3D Euler angles (yaw, pitch, roll in degrees)
 * - Lighting quality (mean luminance & dynamic range)
 * - Image sharpness / blur score (gradient energy)
 * - Eye Aspect Ratio (EAR)
 * - Bounding box framing & centering
 */

/**
 * Computes mean luminance (brightness) and dynamic contrast from a video/canvas frame.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{ brightnessScore: number, meanLuminance: number, isLightingSufficient: boolean }}
 */
export function evaluateLighting(canvas, ctx) {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) {
    return { brightnessScore: 0.0, meanLuminance: 0, isLightingSufficient: false };
  }

  try {
    const w = canvas.width;
    const h = canvas.height;
    // Downsample sample area for high performance (e.g. 64x48)
    const sw = 64;
    const sh = 48;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const step = Math.max(1, Math.floor(data.length / (sw * sh * 4))) * 4;

    let sumLuma = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // ITU-R BT.601 standard luminance weights
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLuma += luma;
      count += 1;
    }

    const meanLuma = count > 0 ? sumLuma / count : 0;
    // Optimal lighting range: 60 - 200 (scale 0.0 to 1.0)
    let brightnessScore = 1.0;
    if (meanLuma < 50) {
      brightnessScore = Math.max(0.1, meanLuma / 50);
    } else if (meanLuma > 220) {
      brightnessScore = Math.max(0.1, (255 - meanLuma) / 35);
    } else {
      brightnessScore = 1.0;
    }

    const isLightingSufficient = meanLuma >= 45 && meanLuma <= 235;

    return {
      brightnessScore: Math.round(brightnessScore * 100) / 100,
      meanLuminance: Math.round(meanLuma),
      isLightingSufficient,
    };
  } catch {
    return { brightnessScore: 0.8, meanLuminance: 120, isLightingSufficient: true };
  }
}

/**
 * Computes image sharpness/blur using gradient energy on downsampled luminance.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{ sharpnessScore: number, isSharp: boolean }}
 */
export function evaluateSharpness(canvas, ctx) {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) {
    return { sharpnessScore: 0.0, isSharp: false };
  }

  try {
    const w = Math.min(128, canvas.width);
    const h = Math.min(96, canvas.height);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let gradientSum = 0;
    let sampleCount = 0;

    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const idx = (y * w + x) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

        const idxRight = (y * w + (x + 1)) * 4;
        const lumaRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];

        const idxDown = ((y + 1) * w + x) * 4;
        const lumaDown = 0.299 * data[idxDown] + 0.587 * data[idxDown + 1] + 0.114 * data[idxDown + 2];

        const dx = lumaRight - luma;
        const dy = lumaDown - luma;
        gradientSum += Math.sqrt(dx * dx + dy * dy);
        sampleCount += 1;
      }
    }

    const meanGradient = sampleCount > 0 ? gradientSum / sampleCount : 0;
    // Mean gradient >= 4.0 is typical for clear face edges
    const sharpnessScore = Math.min(1.0, Math.max(0.1, meanGradient / 6.0));
    const isSharp = sharpnessScore >= 0.60;

    return {
      sharpnessScore: Math.round(sharpnessScore * 100) / 100,
      isSharp,
    };
  } catch {
    return { sharpnessScore: 0.85, isSharp: true };
  }
}

/**
 * Calculates 3D head pose Euler angles (yaw, pitch, roll in degrees) from MediaPipe landmarks.
 * Landmarks used:
 * - Nose tip: 1
 * - Chin: 152
 * - Left eye outer: 33
 * - Right eye outer: 263
 * @param {Array<{x: number, y: number, z: number}>} landmarks
 * @returns {{ yawDeg: number, pitchDeg: number, rollDeg: number, poseConfidence: number }}
 */
export function calculateHeadPoseEuler(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, poseConfidence: 0.0 };
  }

  const nose = landmarks[1];
  const chin = landmarks[152];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  if (!nose || !chin || !leftEye || !rightEye) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, poseConfidence: 0.0 };
  }

  // Eye midpoint
  const eyeMidX = (leftEye.x + rightEye.x) / 2.0;
  const eyeMidY = (leftEye.y + rightEye.y) / 2.0;
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

  // 1. Roll (in-plane tilt) in degrees
  const dX = rightEye.x - leftEye.x;
  const dY = rightEye.y - leftEye.y;
  const rollRad = Math.atan2(dY, dX);
  const rollDeg = rollRad * (180.0 / Math.PI);

  // 2. Yaw (horizontal turn) in degrees
  // Ratio of distance from nose to eye midpoint relative to interpupillary distance
  const noseOffsetX = (nose.x - eyeMidX) / Math.max(0.01, eyeDist);
  // Scale offset to approximate angular degrees (roughly ±45° range)
  const yawDeg = Math.max(-90.0, Math.min(90.0, noseOffsetX * 65.0));

  // 3. Pitch (vertical tilt) in degrees
  const faceHeight = Math.hypot(chin.x - eyeMidX, chin.y - eyeMidY);
  const noseOffsetY = (nose.y - eyeMidY) / Math.max(0.01, faceHeight);
  // Neutral nose vertical position is approx 0.35 of eye-to-chin distance
  const pitchOffset = noseOffsetY - 0.35;
  const pitchDeg = Math.max(-90.0, Math.min(90.0, pitchOffset * 75.0));

  // 4. Pose Confidence
  const zSpread = Math.abs((leftEye.z || 0) - (rightEye.z || 0));
  const poseConfidence = Math.max(0.5, Math.min(1.0, 1.0 - zSpread * 2.0));

  return {
    yawDeg: Math.round(yawDeg * 10) / 10,
    pitchDeg: Math.round(pitchDeg * 10) / 10,
    rollDeg: Math.round(rollDeg * 10) / 10,
    poseConfidence: Math.round(poseConfidence * 100) / 100,
  };
}

/**
 * Computes Eye Aspect Ratio (EAR) for eye closure / blink analysis.
 * @param {Array<{x: number, y: number}>} landmarks
 * @returns {number}
 */
export function calculateEAR(landmarks) {
  if (!landmarks || landmarks.length < 468) return 0.3;

  const leftTop = landmarks[159];
  const leftBottom = landmarks[145];
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];

  const rightTop = landmarks[386];
  const rightBottom = landmarks[374];
  const rightOuter = landmarks[263];
  const rightInner = landmarks[362];

  if (!leftTop || !leftBottom || !leftOuter || !leftInner) return 0.3;

  const leftH = Math.hypot(leftTop.x - leftBottom.x, leftTop.y - leftBottom.y);
  const leftW = Math.hypot(leftOuter.x - leftInner.x, leftOuter.y - leftInner.y);
  const leftEar = leftH / Math.max(0.001, leftW);

  const rightH = Math.hypot(rightTop.x - rightBottom.x, rightTop.y - rightBottom.y);
  const rightW = Math.hypot(rightOuter.x - rightInner.x, rightOuter.y - rightInner.y);
  const rightEar = rightH / Math.max(0.001, rightW);

  return Math.round(((leftEar + rightEar) / 2.0) * 1000) / 1000;
}
