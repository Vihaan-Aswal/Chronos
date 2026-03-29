// utils/embedder.js
import * as faceapi from "@vladmandic/face-api";

let loaded = false;

export async function loadEmbedder() {
  if (loaded) return;

  await faceapi.nets.faceRecognitionNet.loadFromUri("https://vladmandic.github.io/face-api/model/");
  await faceapi.nets.faceLandmark68Net.loadFromUri("https://vladmandic.github.io/face-api/model/");
  await faceapi.nets.tinyFaceDetector.loadFromUri("https://vladmandic.github.io/face-api/model/");

  loaded = true;
}

export async function getEmbedding(canvas112) {
  if (!loaded) throw new Error("embedder not loaded");

  const desc = await faceapi.computeFaceDescriptor(canvas112);
  if (!desc || desc.length !== 128) return null;

  const arr = Array.from(desc).map(Number);

  // normalize twice (cosine-like)
  const norm = Math.sqrt(arr.reduce((s, v) => s + v*v, 0)) || 1;
  const emb = arr.map(v => v / norm);

  return emb;
}
