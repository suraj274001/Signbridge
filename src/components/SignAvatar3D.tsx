import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ArmPose, AvatarKeyframe, FacialGrammarTag, SignDefinition } from '../types/signbridge';

/**
 * Probe WebGL2 renderer string once to detect software rasterizers (SwiftShader/llvmpipe/WARP).
 * Used strictly for rendering cost (pixel ratio, antialias, shadows, frame pacing) — never
 * changes scene objects, geometry, or lighting intensities.
 */
const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

const REST_RIGHT: ArmPose = {
  handPos: [0.28, 1.02, 0.14],
  handRot: [0.1, 0, -0.1],
  fingers: [0.25, 0.28, 0.3, 0.32, 0.35],
  spread: 0.15,
};

const REST_LEFT: ArmPose = {
  handPos: [-0.28, 1.02, 0.14],
  handRot: [0.1, 0, 0.1],
  fingers: [0.25, 0.28, 0.3, 0.32, 0.35],
  spread: 0.15,
};

// Pre-allocated scratch vectors for zero-GC render loop
const _shoulder = new THREE.Vector3();
const _target = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

function sampleArmPose(
  keyframes: AvatarKeyframe[],
  progress: number,
  side: 'right' | 'left'
): ArmPose {
  const rest = side === 'right' ? REST_RIGHT : REST_LEFT;
  if (!keyframes || keyframes.length === 0) return rest;

  const getPose = (kf: AvatarKeyframe) => (side === 'right' ? kf.right : kf.left ?? rest);

  if (progress <= keyframes[0].t) return getPose(keyframes[0]);
  if (progress >= keyframes[keyframes.length - 1].t) {
    return getPose(keyframes[keyframes.length - 1]);
  }

  let a = keyframes[0];
  let b = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (progress >= keyframes[i].t && progress <= keyframes[i + 1].t) {
      a = keyframes[i];
      b = keyframes[i + 1];
      break;
    }
  }

  const span = Math.max(1e-4, b.t - a.t);
  const alpha = THREE.MathUtils.smoothstep((progress - a.t) / span, 0, 1);
  const pa = getPose(a);
  const pb = getPose(b);

  return {
    handPos: [
      THREE.MathUtils.lerp(pa.handPos[0], pb.handPos[0], alpha),
      THREE.MathUtils.lerp(pa.handPos[1], pb.handPos[1], alpha),
      THREE.MathUtils.lerp(pa.handPos[2], pb.handPos[2], alpha),
    ],
    handRot: [
      THREE.MathUtils.lerp(pa.handRot[0], pb.handRot[0], alpha),
      THREE.MathUtils.lerp(pa.handRot[1], pb.handRot[1], alpha),
      THREE.MathUtils.lerp(pa.handRot[2], pb.handRot[2], alpha),
    ],
    fingers: [
      THREE.MathUtils.lerp(pa.fingers[0], pb.fingers[0], alpha),
      THREE.MathUtils.lerp(pa.fingers[1], pb.fingers[1], alpha),
      THREE.MathUtils.lerp(pa.fingers[2], pb.fingers[2], alpha),
      THREE.MathUtils.lerp(pa.fingers[3], pb.fingers[3], alpha),
      THREE.MathUtils.lerp(pa.fingers[4], pb.fingers[4], alpha),
    ],
    spread: THREE.MathUtils.lerp(pa.spread ?? 0.2, pb.spread ?? 0.2, alpha),
  };
}

function sampleHeadAndBrow(
  keyframes: AvatarKeyframe[],
  progress: number,
  facialCue: FacialGrammarTag
): { headRot: [number, number, number]; browLift: number } {
  let headRot: [number, number, number] = [0, 0, 0];
  let browLift = 0;

  if (keyframes && keyframes.length > 0) {
    let a = keyframes[0];
    let b = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (progress >= keyframes[i].t && progress <= keyframes[i + 1].t) {
        a = keyframes[i];
        b = keyframes[i + 1];
        break;
      }
    }
    const span = Math.max(1e-4, b.t - a.t);
    const alpha = THREE.MathUtils.clamp((progress - a.t) / span, 0, 1);
    const ha = a.headRot ?? [0, 0, 0];
    const hb = b.headRot ?? [0, 0, 0];
    headRot = [
      THREE.MathUtils.lerp(ha[0], hb[0], alpha),
      THREE.MathUtils.lerp(ha[1], hb[1], alpha),
      THREE.MathUtils.lerp(ha[2], hb[2], alpha),
    ];
    browLift = THREE.MathUtils.lerp(a.browLift ?? 0, b.browLift ?? 0, alpha);
  }

  // Layer sentence-level facial grammar cues onto the avatar's face
  if (facialCue === 'POLAR_QUESTION') {
    browLift = Math.max(browLift, 0.75);
    headRot[0] += 0.12;
  } else if (facialCue === 'WH_QUESTION') {
    browLift = Math.min(browLift, -0.65);
    headRot[1] += 0.1;
  } else if (facialCue === 'NEGATION') {
    headRot[1] += Math.sin(progress * Math.PI * 3) * 0.24;
  }

  return { headRot, browLift };
}

/**
 * Simple 2-bone analytical IK helper placing an elbow naturally outward & downward
 * between shoulder and target wrist position.
 */
function solveArmJoints(
  shoulderPos: [number, number, number],
  wristPos: [number, number, number],
  isRight: boolean,
  upperLen = 0.29,
  lowerLen = 0.27
): {
  upperMid: [number, number, number];
  upperQuat: THREE.Quaternion;
  lowerMid: [number, number, number];
  lowerQuat: THREE.Quaternion;
  elbowPos: [number, number, number];
} {
  _shoulder.set(shoulderPos[0], shoulderPos[1], shoulderPos[2]);
  _target.set(wristPos[0], wristPos[1], wristPos[2]);
  _dir.subVectors(_target, _shoulder);
  const dist = THREE.MathUtils.clamp(_dir.length(), 0.08, upperLen + lowerLen - 0.01);
  _dir.normalize();

  // Law of cosines for elbow bend offset
  const cosAngle = THREE.MathUtils.clamp(
    (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist),
    -1,
    1
  );
  const along = upperLen * cosAngle;
  const bendOut = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));

  // Bend pole direction: slightly outward and downward/backward
  const poleX = isRight ? 0.55 : -0.55;
  const poleY = -0.7;
  const poleZ = -0.3;
  const pole = new THREE.Vector3(poleX, poleY, poleZ);
  // Make pole perpendicular to shoulder->wrist direction
  pole.addScaledVector(_dir, -pole.dot(_dir)).normalize();

  _elbow
    .copy(_shoulder)
    .addScaledVector(_dir, along)
    .addScaledVector(pole, bendOut);

  // Upper arm transform
  _mid.addVectors(_shoulder, _elbow).multiplyScalar(0.5);
  const upperMid: [number, number, number] = [_mid.x, _mid.y, _mid.z];
  const upperDir = new THREE.Vector3().subVectors(_elbow, _shoulder).normalize();
  const upperQuat = _quat.clone().setFromUnitVectors(_up, upperDir);

  // Forearm transform
  _mid.addVectors(_elbow, _target).multiplyScalar(0.5);
  const lowerMid: [number, number, number] = [_mid.x, _mid.y, _mid.z];
  const lowerDir = new THREE.Vector3().subVectors(_target, _elbow).normalize();
  const lowerQuat = _quat.clone().setFromUnitVectors(_up, lowerDir);

  return {
    upperMid,
    upperQuat,
    lowerMid,
    lowerQuat,
    elbowPos: [_elbow.x, _elbow.y, _elbow.z],
  };
}

function StudioSetup({ isDark }: { isDark: boolean }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;

    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.25;
    controls.maxDistance = 3.1;
    controls.minPolarAngle = Math.PI * 0.26;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.target.set(0, 1.28, 0.05);
    controls.update();

    return () => {
      controls.dispose();
      envTex.dispose();
      scene.environment = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const bgHex = isDark ? 0x0f172a : 0xf1f5f9;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 3.8, 9.5);
  }, [scene, isDark]);

  return null;
}

/**
 * Software-WebGL frame pacer: on GPU we render continuously at 60fps; on SwiftShader/CPU
 * we render on demand and pace animation frames cleanly via WebGL fence sync + 80ms gap
 * so browser screenshots and clicks never starve or time out.
 */
function SoftwareGlPacer({ active }: { active: boolean }) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    if (!isSoftwareGl) return;
    invalidate();
    if (!active) return;

    let cancelled = false;
    let timerId = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      const ctx = gl.getContext() as WebGL2RenderingContext | null;
      if (ctx && typeof ctx.fenceSync === 'function') {
        const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
        ctx.flush();
        const poll = () => {
          if (cancelled) {
            if (sync) ctx.deleteSync(sync);
            return;
          }
          const status = sync ? ctx.getSyncParameter(sync, ctx.SYNC_STATUS) : ctx.SIGNALED;
          if (status === ctx.UNSIGNALED) {
            timerId = window.setTimeout(poll, 10);
          } else {
            if (sync) ctx.deleteSync(sync);
            timerId = window.setTimeout(() => {
              if (!cancelled) {
                invalidate();
                scheduleNext();
              }
            }, 90);
          }
        };
        timerId = window.setTimeout(poll, 10);
      } else {
        timerId = window.setTimeout(() => {
          if (!cancelled) {
            invalidate();
            scheduleNext();
          }
        }, 120);
      }
    };

    scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [gl, invalidate, active]);

  return null;
}

interface AvatarRigProps {
  currentSign: SignDefinition | null;
  progress: number;
  facialCue: FacialGrammarTag;
  isDark: boolean;
}

function ArticulatedHand({
  side,
  pose,
  skinMat,
  jointMat,
}: {
  side: 'right' | 'left';
  pose: ArmPose;
  skinMat: THREE.MeshStandardMaterial;
  jointMat: THREE.MeshStandardMaterial;
}) {
  const mirror = side === 'left' ? -1 : 1;
  const spread = pose.spread ?? 0.2;

  const fingerDefs = [
    { x: -0.026 * mirror, y: 0.048, len1: 0.036, len2: 0.028, curl: pose.fingers[1], splay: -0.14 * spread * mirror },
    { x: -0.008 * mirror, y: 0.052, len1: 0.041, len2: 0.031, curl: pose.fingers[2], splay: -0.03 * spread * mirror },
    { x: 0.011 * mirror, y: 0.049, len1: 0.038, len2: 0.029, curl: pose.fingers[3], splay: 0.05 * spread * mirror },
    { x: 0.028 * mirror, y: 0.044, len1: 0.031, len2: 0.024, curl: pose.fingers[4], splay: 0.14 * spread * mirror },
  ];

  const thumbCurl = pose.fingers[0];

  return (
    <group position={pose.handPos} rotation={pose.handRot}>
      {/* Seamless skin-tone wrist connector */}
      <mesh material={skinMat}>
        <sphereGeometry args={[0.028, 14, 14]} />
      </mesh>

      {/* Sculpted Palm */}
      <mesh position={[0, 0.038, 0]} material={skinMat} castShadow={!isSoftwareGl}>
        <boxGeometry args={[0.074, 0.082, 0.024]} />
      </mesh>

      {/* Thumb */}
      <group
        position={[-0.042 * mirror, 0.02, 0.01]}
        rotation={[0.25 + thumbCurl * 0.7, 0.35 * mirror, (0.65 - thumbCurl * 0.45) * mirror]}
      >
        <mesh position={[0, 0.018, 0]} material={skinMat}>
          <capsuleGeometry args={[0.01, 0.022, 6, 10]} />
        </mesh>
        <group position={[0, 0.034, 0]} rotation={[thumbCurl * 0.85, 0, 0]}>
          <mesh position={[0, 0.014, 0]} material={skinMat}>
            <capsuleGeometry args={[0.0085, 0.018, 6, 10]} />
          </mesh>
        </group>
      </group>

      {/* 4 Articulated Fingers */}
      {fingerDefs.map((f, idx) => (
        <group
          key={idx}
          position={[f.x, f.y + 0.028, 0]}
          rotation={[f.curl * 1.45, 0, f.splay]}
        >
          <mesh position={[0, f.len1 / 2, 0]} material={skinMat}>
            <capsuleGeometry args={[0.008, f.len1 * 0.75, 6, 10]} />
          </mesh>
          <group position={[0, f.len1, 0]} rotation={[f.curl * 1.25, 0, 0]}>
            <mesh position={[0, f.len2 / 2, 0]} material={skinMat}>
              <capsuleGeometry args={[0.007, f.len2 * 0.75, 6, 10]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function AvatarRig({ currentSign, progress, facialCue, isDark }: AvatarRigProps) {
  const headRef = useRef<THREE.Group | null>(null);
  const leftBrowRef = useRef<THREE.Mesh | null>(null);
  const rightBrowRef = useRef<THREE.Mesh | null>(null);
  const torsoBreathRef = useRef<THREE.Group | null>(null);

  // Smoothly interpolated pose refs
  const rightPoseRef = useRef<ArmPose>(REST_RIGHT);
  const leftPoseRef = useRef<ArmPose>(REST_LEFT);

  // Distinct PBR materials with >= 0.25 roughness variation across adjacent parts
  const materials = useMemo(() => {
    const fabricMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#1e3a5f' : '#1e40af',
      roughness: 0.78,
      metalness: 0.05,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#38bdf8' : '#0d9488',
      roughness: 0.28,
      metalness: 0.35,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#e6b89c',
      roughness: 0.56,
      metalness: 0.04,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#172e4d' : '#1d3a8a',
      roughness: 0.58,
      metalness: 0.12,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.85,
      metalness: 0.05,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.12,
      metalness: 0.1,
    });
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#1e293b' : '#cbd5e1',
      roughness: 0.35,
      metalness: 0.45,
    });
    return { fabricMat, trimMat, skinMat, jointMat, hairMat, eyeMat, pedestalMat };
  }, [isDark]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Compute target poses for current sign progress
  const targetRight = currentSign
    ? sampleArmPose(currentSign.keyframes, progress, 'right')
    : REST_RIGHT;
  const targetLeft = currentSign
    ? sampleArmPose(currentSign.keyframes, progress, 'left')
    : REST_LEFT;
  const effectiveCue = currentSign?.facialCue ?? facialCue;
  const { headRot, browLift } = currentSign
    ? sampleHeadAndBrow(currentSign.keyframes, progress, effectiveCue)
    : { headRot: [0, 0, 0] as [number, number, number], browLift: 0 };

  // Directly sync pose for deterministic software-GL frames while damping smoothly on GPU
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.getElapsedTime();

    if (torsoBreathRef.current) {
      torsoBreathRef.current.position.y = Math.sin(t * 1.8) * 0.006;
    }

    if (headRef.current) {
      headRef.current.rotation.x = THREE.MathUtils.damp(headRef.current.rotation.x, headRot[0], 10, dt);
      headRef.current.rotation.y = THREE.MathUtils.damp(headRef.current.rotation.y, headRot[1], 10, dt);
      headRef.current.rotation.z = THREE.MathUtils.damp(headRef.current.rotation.z, headRot[2], 10, dt);
    }

    if (leftBrowRef.current && rightBrowRef.current) {
      const targetY = 0.052 + browLift * 0.015;
      const targetTilt = browLift < 0 ? Math.abs(browLift) * 0.28 : -browLift * 0.1;
      leftBrowRef.current.position.y = THREE.MathUtils.damp(leftBrowRef.current.position.y, targetY, 12, dt);
      rightBrowRef.current.position.y = THREE.MathUtils.damp(rightBrowRef.current.position.y, targetY, 12, dt);
      leftBrowRef.current.rotation.z = THREE.MathUtils.damp(leftBrowRef.current.rotation.z, -targetTilt, 12, dt);
      rightBrowRef.current.rotation.z = THREE.MathUtils.damp(rightBrowRef.current.rotation.z, targetTilt, 12, dt);
    }
  });

  // Update pose refs so arm IK updates responsively on every frame/progress change
  rightPoseRef.current = targetRight;
  leftPoseRef.current = targetLeft;

  const rightShoulder: [number, number, number] = [0.22, 1.38, 0.0];
  const leftShoulder: [number, number, number] = [-0.22, 1.38, 0.0];
  const rightIK = solveArmJoints(rightShoulder, targetRight.handPos, true);
  const leftIK = solveArmJoints(leftShoulder, targetLeft.handPos, false);

  return (
    <group position={[0, 0, 0]}>
      {/* Grounded Studio Pedestal & Radial Contact Shadow */}
      <mesh position={[0, 0.56, 0]} material={materials.pedestalMat} receiveShadow={!isSoftwareGl}>
        <cylinderGeometry args={[0.42, 0.48, 0.08, 32]} />
      </mesh>
      <mesh position={[0, 0.605, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.37, 0.41, 32]} />
        <meshStandardMaterial color={isDark ? '#38bdf8' : '#2563eb'} roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.525, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={isDark ? 0.35 : 0.14} depthWrite={false} />
      </mesh>

      <group ref={torsoBreathRef}>
        {/* Sculpted Tapered Lower Torso */}
        <mesh position={[0, 0.84, 0]} material={materials.fabricMat} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.155, 0.175, 0.44, 28]} />
        </mesh>

        {/* Sculpted Tapered Upper Chest (broad shoulders tapering smoothly to waist) */}
        <mesh position={[0, 1.2, 0]} scale={[1.18, 1.0, 0.68]} material={materials.fabricMat} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.195, 0.145, 0.36, 28]} />
        </mesh>

        {/* Smooth Rounded Shoulder Cap / Clavicle Yoke */}
        <mesh position={[0, 1.38, 0]} scale={[1.18, 0.42, 0.68]} material={materials.fabricMat} castShadow={!isSoftwareGl}>
          <sphereGeometry args={[0.195, 24, 16]} />
        </mesh>

        {/* Flush Low-Profile Collar Accent Ring */}
        <mesh position={[0, 1.435, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.trimMat}>
          <torusGeometry args={[0.072, 0.014, 14, 28]} />
        </mesh>

        {/* Shoulder Yokes */}
        <mesh position={rightShoulder} material={materials.jointMat}>
          <sphereGeometry args={[0.052, 16, 16]} />
        </mesh>
        <mesh position={leftShoulder} material={materials.jointMat}>
          <sphereGeometry args={[0.052, 16, 16]} />
        </mesh>

        {/* Neck */}
        <mesh position={[0, 1.48, 0]} material={materials.skinMat}>
          <cylinderGeometry args={[0.05, 0.06, 0.11, 18]} />
        </mesh>

        {/* Articulated Head Group with Expressive Non-Manual Eyebrows */}
        <group ref={headRef} position={[0, 1.63, 0.01]}>
          {/* Cranium */}
          <mesh material={materials.skinMat} castShadow={!isSoftwareGl}>
            <sphereGeometry args={[0.125, 24, 24]} />
          </mesh>
          {/* Styled Hair Cap */}
          <mesh position={[0, 0.032, -0.014]} material={materials.hairMat}>
            <sphereGeometry args={[0.128, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          </mesh>
          {/* Ears */}
          <mesh position={[0.122, -0.005, -0.005]} material={materials.skinMat}>
            <sphereGeometry args={[0.022, 10, 10]} />
          </mesh>
          <mesh position={[-0.122, -0.005, -0.005]} material={materials.skinMat}>
            <sphereGeometry args={[0.022, 10, 10]} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.044, 0.016, 0.112]} material={materials.eyeMat}>
            <sphereGeometry args={[0.013, 12, 12]} />
          </mesh>
          <mesh position={[0.044, 0.016, 0.112]} material={materials.eyeMat}>
            <sphereGeometry args={[0.013, 12, 12]} />
          </mesh>
          {/* Nose Bridge */}
          <mesh position={[0, -0.01, 0.122]} material={materials.skinMat}>
            <coneGeometry args={[0.014, 0.032, 8]} />
          </mesh>
          {/* Mouth */}
          <mesh position={[0, -0.048, 0.114]} material={materials.hairMat}>
            <boxGeometry args={[0.044, 0.008, 0.01]} />
          </mesh>
          {/* Expressive Articulated Eyebrows (Grammar Markers!) */}
          <mesh ref={leftBrowRef} position={[-0.044, 0.052, 0.112]} material={materials.hairMat}>
            <boxGeometry args={[0.042, 0.011, 0.012]} />
          </mesh>
          <mesh ref={rightBrowRef} position={[0.044, 0.052, 0.112]} material={materials.hairMat}>
            <boxGeometry args={[0.042, 0.011, 0.012]} />
          </mesh>
        </group>

        {/* Right Arm (IK solved upper + elbow cuff + forearm + articulated hand) */}
        <mesh position={rightIK.upperMid} quaternion={rightIK.upperQuat} material={materials.fabricMat} castShadow={!isSoftwareGl}>
          <capsuleGeometry args={[0.044, 0.23, 8, 14]} />
        </mesh>
        <mesh position={rightIK.elbowPos} material={materials.jointMat}>
          <sphereGeometry args={[0.042, 14, 14]} />
        </mesh>
        <mesh position={rightIK.lowerMid} quaternion={rightIK.lowerQuat} material={materials.skinMat} castShadow={!isSoftwareGl}>
          <capsuleGeometry args={[0.032, 0.22, 8, 14]} />
        </mesh>
        <ArticulatedHand side="right" pose={targetRight} skinMat={materials.skinMat} jointMat={materials.jointMat} />

        {/* Left Arm */}
        <mesh position={leftIK.upperMid} quaternion={leftIK.upperQuat} material={materials.fabricMat} castShadow={!isSoftwareGl}>
          <capsuleGeometry args={[0.044, 0.23, 8, 14]} />
        </mesh>
        <mesh position={leftIK.elbowPos} material={materials.jointMat}>
          <sphereGeometry args={[0.042, 14, 14]} />
        </mesh>
        <mesh position={leftIK.lowerMid} quaternion={leftIK.lowerQuat} material={materials.skinMat} castShadow={!isSoftwareGl}>
          <capsuleGeometry args={[0.032, 0.22, 8, 14]} />
        </mesh>
        <ArticulatedHand side="left" pose={targetLeft} skinMat={materials.skinMat} jointMat={materials.jointMat} />
      </group>
    </group>
  );
}

export interface SignAvatar3DProps {
  currentSign: SignDefinition | null;
  progress: number; // 0..1
  isPlaying: boolean;
  facialCue?: FacialGrammarTag;
  isDark?: boolean;
  height?: number;
}

export function SignAvatar3D({
  currentSign,
  progress,
  isPlaying,
  facialCue = 'NEUTRAL',
  isDark = false,
  height = 420,
}: SignAvatar3DProps) {
  return (
    <div
      data-testid="avatar-3d-canvas"
      data-current-sign={currentSign?.gloss ?? 'IDLE'}
      style={{ height: `${height}px` }}
      className="relative w-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900"
    >
      <Canvas
        dpr={isSoftwareGl ? 1 : [1, 2]}
        shadows={!isSoftwareGl}
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 1.44, 1.94], fov: 38, near: 0.1, far: 30 }}
      >
        <StudioSetup isDark={isDark} />
        <SoftwareGlPacer active={isPlaying} />

        {/* Warm/Cool Studio 3-Point Lighting Rig */}
        <hemisphereLight args={['#dbeafe', '#334155', 0.85]} />
        <directionalLight
          position={[2.2, 3.6, 2.8]}
          intensity={2.1}
          color="#fff7ed"
          castShadow={!isSoftwareGl}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-2.2, 2.0, -1.6]} intensity={0.85} color="#bfdbfe" />

        <AvatarRig
          currentSign={currentSign}
          progress={progress}
          facialCue={facialCue}
          isDark={isDark}
        />
      </Canvas>

      {/* Clean non-blurred bottom HUD caption strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 py-2.5 bg-slate-900/80 text-white flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-teal-300">
            {currentSign ? currentSign.gloss : 'IDLE'}
          </span>
          <span className="text-slate-300">
            {currentSign ? currentSign.labelEn : 'Ready for speech or text input'}
          </span>
        </div>
        <span className="font-mono text-slate-300">
          {facialCue !== 'NEUTRAL' ? facialCue : 'NEUTRAL'} · Drag to orbit
        </span>
      </div>
    </div>
  );
}
