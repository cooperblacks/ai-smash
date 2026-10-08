import * as THREE from 'three';
import { MMDLoader, MMDAnimationHelper } from 'three-stdlib';
import { Parser as MMDParser } from 'mmd-parser';
import { VRM } from '@pixiv/three-vrm';

// Ensure mmdparser is accessible globally for three-stdlib MMDLoader
if (typeof window !== 'undefined') {
  (window as any).mmdparser = { Parser: MMDParser };
}

// MMD standard bone name to VRM Humanoid bone mapping
export const MMD_TO_VRM_BONE_MAP: Record<string, string> = {
  '全ての親': 'hips',
  'センター': 'hips',
  'center': 'hips',
  '下半身': 'spine',
  '上半身': 'chest',
  '上半身2': 'upperChest',
  '首': 'neck',
  '頭': 'head',
  '左肩': 'leftShoulder',
  '左腕': 'leftUpperArm',
  '左ひじ': 'leftLowerArm',
  '左手首': 'leftHand',
  '右肩': 'rightShoulder',
  '右腕': 'rightUpperArm',
  '右ひじ': 'rightLowerArm',
  '右手首': 'rightHand',
  '左足': 'leftUpperLeg',
  '左ひざ': 'leftLowerLeg',
  '左足首': 'leftFoot',
  '右足': 'rightUpperLeg',
  '右ひざ': 'rightLowerLeg',
  '右足首': 'rightFoot',
  '左目': 'leftEye',
  '右目': 'rightEye',
};

// MMD Morph standard name to VRM expression preset mapping
export const MMD_TO_VRM_MORPH_MAP: Record<string, string> = {
  'まばたき': 'blink',
  '笑い': 'happy',
  'ウィンク': 'blinkLeft',
  'ウィンク右': 'blinkRight',
  'あ': 'aa',
  'い': 'ih',
  'う': 'ou',
  'え': 'ee',
  'お': 'oh',
  '怒り': 'angry',
  '困る': 'sad',
};

export interface VmdParseResult {
  clip: THREE.AnimationClip;
  boneTrackCount: number;
  morphTrackCount: number;
  durationSec: number;
  maxFrame: number;
}

/**
 * Parses raw VMD array buffer and retargets bone tracks to VRM humanoid bones.
 */
export function retargetVmdToVRM(buffer: ArrayBuffer, vrm: VRM): VmdParseResult {
  const parser = new MMDParser();
  const vmd = parser.parseVmd(buffer);

  const fps = 30.0;
  const tracks: THREE.KeyframeTrack[] = [];
  let maxFrame = 0;

  // 1. Process Bone Motions
  if (Array.isArray(vmd.motions) && vmd.motions.length > 0) {
    // Group motions by boneName
    const boneGroups = new Map<string, any[]>();
    for (const m of vmd.motions) {
      if (m.frameNum > maxFrame) maxFrame = m.frameNum;
      const list = boneGroups.get(m.boneName) || [];
      list.push(m);
      boneGroups.set(m.boneName, list);
    }

    // Retarget mapped bones to VRM
    boneGroups.forEach((frames, mmdBoneName) => {
      const vrmBoneName = MMD_TO_VRM_BONE_MAP[mmdBoneName];
      if (!vrmBoneName) return;

      const node = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any);
      if (!node) return;

      // Sort frames by frameNum ascending
      frames.sort((a, b) => a.frameNum - b.frameNum);

      const times: number[] = [];
      const quatValues: number[] = [];
      const posValues: number[] = [];
      let hasPosition = false;

      for (const f of frames) {
        const time = f.frameNum / fps;
        times.push(time);

        // MMD Quaternion: [x, y, z, w]. MMD uses left-handed coords -> invert y & z for right-handed three.js
        const rot = f.rotation || [0, 0, 0, 1];
        quatValues.push(rot[0], -rot[1], -rot[2], rot[3]);

        if (f.position) {
          hasPosition = true;
          // Scale down MMD units (typically ~0.08 - 0.1 scale to VRM meters)
          const scale = 0.085;
          posValues.push(f.position[0] * scale, f.position[1] * scale, -f.position[2] * scale);
        }
      }

      // Add rotation track
      if (times.length > 0) {
        const trackName = `${node.name}.quaternion`;
        tracks.push(new THREE.QuaternionKeyframeTrack(trackName, times, quatValues));

        // Hips position track for root motion
        if (hasPosition && (vrmBoneName === 'hips' || mmdBoneName === 'センター')) {
          const posTrackName = `${node.name}.position`;
          tracks.push(new THREE.VectorKeyframeTrack(posTrackName, times, posValues));
        }
      }
    });
  }

  // 2. Process Morph / Expression tracks
  let morphTrackCount = 0;
  if (Array.isArray(vmd.morphs) && vmd.morphs.length > 0 && vrm.expressionManager) {
    const morphGroups = new Map<string, any[]>();
    for (const m of vmd.morphs) {
      if (m.frameNum > maxFrame) maxFrame = m.frameNum;
      const list = morphGroups.get(m.morphName) || [];
      list.push(m);
      morphGroups.set(m.morphName, list);
    }

    morphGroups.forEach((frames, mmdMorphName) => {
      const vrmExpressionName = MMD_TO_VRM_MORPH_MAP[mmdMorphName];
      if (!vrmExpressionName) return;

      frames.sort((a, b) => a.frameNum - b.frameNum);
      const times: number[] = [];
      const values: number[] = [];

      for (const f of frames) {
        times.push(f.frameNum / fps);
        values.push(Math.max(0, Math.min(1, f.weight || 0)));
      }

      if (times.length > 0) {
        morphTrackCount++;
      }
    });
  }

  const durationSec = Math.max(0.1, maxFrame / fps);
  const clip = new THREE.AnimationClip(`vmd_retarget_${Date.now()}`, durationSec, tracks);

  return {
    clip,
    boneTrackCount: tracks.length,
    morphTrackCount,
    durationSec,
    maxFrame,
  };
}

/**
 * Parses and loads MMD PMX/PMD models via three-stdlib MMDLoader.
 */
export async function loadMMDModel(
  fileOrUrl: File | string,
  onProgress?: (percent: number) => void
): Promise<THREE.SkinnedMesh> {
  const loader = new MMDLoader();
  const parser = new MMDParser();
  (loader as any).parser = parser;

  if (typeof fileOrUrl === 'string') {
    return new Promise((resolve, reject) => {
      loader.load(
        fileOrUrl,
        (mesh) => resolve(mesh),
        (xhr) => {
          if (xhr.total && onProgress) {
            onProgress(Math.round((xhr.loaded / xhr.total) * 100));
          }
        },
        reject
      );
    });
  } else {
    // ArrayBuffer load
    const buffer = await fileOrUrl.arrayBuffer();
    return new Promise((resolve, reject) => {
      try {
        const isPmd = fileOrUrl.name.toLowerCase().endsWith('.pmd');
        const modelData = isPmd
          ? parser.parsePmd(buffer, true)
          : parser.parsePmx(buffer, true);

        // Build SkinnedMesh from modelData using internal MeshBuilder
        const meshBuilder = (loader as any).meshBuilder;
        const mesh = meshBuilder.build(modelData, '', loader.crossOrigin);
        resolve(mesh);
      } catch (err) {
        reject(err);
      }
    });
  }
}
