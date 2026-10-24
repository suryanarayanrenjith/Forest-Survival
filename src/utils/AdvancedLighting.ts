import * as THREE from 'three';

/**
 * ADVANCED LIGHTING — global three.js shader-chunk patches.
 *
 * Installed ONCE, before any material compiles (App.tsx imports this module
 * right after textureDefaults). Every lit / fogged built-in material in the
 * game — terrain, props, robots, characters, the viewmodel — picks these up
 * through three's own chunks, so no material had to change to get them.
 *
 * 1. CONTACT-HARDENING CASCADED SUN SHADOWS (PCSS)
 *    The key light renders a tight, high-resolution NEAR cascade; on High and
 *    Ultra a zero-intensity twin directional light owns a wide FAR cascade.
 *    When a material sees exactly two shadowed directional lights it takes the
 *    cascaded path: light 0 is evaluated once with a percentage-closer SOFT
 *    shadow (blocker search → penumbra from similar triangles → Vogel-disk PCF,
 *    NVIDIA PCSS 2005/2008), blended into a PCF far cascade. The twin light's
 *    BRDF is never evaluated — it only contributes its shadow map. With one
 *    shadowed light (Medium / Low) the same filter runs on the single map with
 *    a fixed radius. Shadows come out crisp where a trunk meets the ground and
 *    soft under a tall canopy — the grounded, deep look the old fixed 3x3 PCF
 *    could not produce.
 *    Receiver-plane depth bias (Isidoro 2006) keeps the wide kernels acne-free
 *    and an interleaved-gradient-noise rotation hides the sample pattern.
 *    Shadow-map reads use textureLod so the loops never take implicit
 *    derivatives inside divergent control flow (ANGLE / D3D11 safe).
 *
 *    The resolved sun visibility is exported to later chunks as `fsSunShadow`
 *    (guarded by `FS_SUN_SHADOW`) so custom lighting that is ADDED after the
 *    loop — the terrain's extra sun glint, for one — can respect shadows too.
 *
 * 2. POINT-LIGHT LOOP
 *    Forward rendering evaluates every resident point light on every lit
 *    fragment, and three unrolls the loop and runs the full GGX + Lambert BRDF
 *    even for a light at intensity 0 or a fragment outside its cutoff. The game
 *    keeps ~17 pooled point lights resident (muzzle / explosion / pickup /
 *    lantern / gun fill) so the light COUNT never changes at runtime — that
 *    pool was a flat per-pixel tax across the whole screen, and 17 inlined
 *    BRDFs per program made every lit shader slow to compile on D3D11. None of
 *    them cast shadows, so the loop now stays a real loop (one BRDF) that skips
 *    idle lights and out-of-range fragments. Output is identical (a zero light
 *    adds zero); shadow-casting point lights still take three's unrolled path.
 *
 * 3. ATMOSPHERIC FOG
 *    Stock FogExp2 plus analytic exponential HEIGHT fog (integrated from the
 *    camera to the surface, so valleys fill and hill tops clear) and a
 *    sun-directional in-scatter tint (fog glows warm toward the sun). All
 *    three uniforms default to zero, which reproduces the stock fog exactly —
 *    the menu scene and any material that never sets them are unaffected.
 */

/**
 * Shared uniform values. PLAIN objects (not THREE.Vector4) on purpose: three's
 * uniform cloning copies plain objects by reference, so every compiled
 * material shares these exact instances and one write reconfigures them all.
 */
export const sunShadowUniforms = {
  /** x: penumbra uv per unit of shadow depth (0 = fixed-radius PCF),
   *  y: max blocker-search radius (uv), z: min / fixed filter radius (uv),
   *  w: near-cascade fade start (0..1 of the half extent). */
  fsSunPcss: { x: 0, y: 0.02, z: 0.0012, w: 0.82 },
  /** x: far cascade filter radius (uv). */
  fsSunFar: { x: 0.0012, y: 0, z: 0, w: 0 },
  /** x: blocker-search taps, y: near filter taps, z: far filter taps. */
  fsSunTaps: { x: 12, y: 16, z: 8, w: 0 },
};

/** Shared atmospheric-fog uniforms (see installAdvancedLighting). */
export const atmosphereFogUniforms = {
  /** x: height falloff (1/m), y: height-fog density (1/m, 0 = off),
   *  z: base height (m), w: sun in-scatter strength (0 = off). */
  fsFogHeight: { x: 0.1, y: 0, z: 0, w: 0 },
  fsFogSunDir: { x: 0, y: 1, z: 0 },
  fsFogSunColor: { x: 1, y: 1, z: 1 },
};

let installed = false;

// Basic (Low tier) and VSM maps keep three's stock path: Basic is the cheapest
// possible single tap by design, and VSM stores moments rather than packed
// depth, so these filters would read garbage from it.
const SUN_SHADOW_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS == 1 || NUM_DIR_LIGHT_SHADOWS == 2 ) && !defined( USE_REVERSED_DEPTH_BUFFER ) && !defined( SHADOWMAP_TYPE_BASIC ) && !defined( SHADOWMAP_TYPE_VSM )

#define FS_ADVANCED_SUN 1

uniform vec4 fsSunPcss;
uniform vec4 fsSunFar;
uniform vec4 fsSunTaps;

float fsIGN( vec2 p ) {
	return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

vec2 fsVogel( float i, float n, float phi ) {
	float r = sqrt( ( i + 0.5 ) / n );
	float t = i * 2.39996323 + phi;
	return r * vec2( cos( t ), sin( t ) );
}

// Receiver-plane depth gradient (Isidoro 2006): how shadow depth changes per
// unit of shadow-map uv across this fragment's plane. Must be evaluated in
// uniform control flow (derivatives).
vec2 fsDepthGradient( vec3 c ) {
	vec3 dx = dFdx( c );
	vec3 dy = dFdy( c );
	float det = dx.x * dy.y - dx.y * dy.x;
	if ( abs( det ) < 1e-14 ) return vec2( 0.0 );
	vec2 g = vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det;
	return clamp( g, vec2( -0.6 ), vec2( 0.6 ) );
}

float fsShadowDepth( sampler2D map, vec2 uv ) {
	return unpackRGBAToDepth( textureLod( map, uv, 0.0 ) );
}

// Near cascade: PCSS when fsSunPcss.x > 0 (uniform branch), otherwise a
// fixed-radius rotated Vogel PCF.
float fsFilterNear( sampler2D map, vec3 c, vec2 grad, float phi ) {
	float radius = fsSunPcss.z;
	float shadow = 1.0;
	bool occluded = true;
	if ( fsSunPcss.x > 0.0 ) {
		// 1. Blocker search: mean depth of occluders around the receiver.
		// The receiver's OWN texel goes first: the Vogel ring never samples
		// the centre, so in a thin or contact shadow every ring tap could land
		// outside the occluder and the early-out below would paint isolated
		// fully-lit pixels inside the umbra (the speckle under crates/legs).
		float blockerSum = 0.0;
		float blockers = 0.0;
		float d0 = fsShadowDepth( map, c.xy );
		if ( d0 < c.z - 0.0002 ) {
			blockerSum = d0;
			blockers = 1.0;
		}
		for ( int i = 0; i < 16; i ++ ) {
			if ( float( i ) >= fsSunTaps.x ) break;
			vec2 o = fsVogel( float( i ), fsSunTaps.x, phi ) * fsSunPcss.y;
			float d = fsShadowDepth( map, c.xy + o );
			if ( d < c.z + dot( o, grad ) - 0.0002 ) {
				blockerSum += d;
				blockers += 1.0;
			}
		}
		// No blocker anywhere in the search region: fully lit, skip the filter.
		occluded = blockers > 0.5;
		// EVERY search tap blocked (centre + ring): the receiver is deep in the
		// umbra. The filter kernel is never wider than the search disk, so it
		// would return 0 too — skip its 18–24 taps. Penumbrae (some taps lit)
		// still get the full filter, so edges are unchanged.
		if ( blockers > fsSunTaps.x + 0.5 ) {
			occluded = false;
			shadow = 0.0;
		}
		// 2. Penumbra width grows with the receiver-to-blocker distance.
		float avgBlocker = blockerSum / max( blockers, 1.0 );
		radius = clamp( ( c.z - avgBlocker ) * fsSunPcss.x, fsSunPcss.z, fsSunPcss.y );
	}
	if ( occluded ) {
		// 3. Filter with that kernel.
		float lit = 0.0;
		for ( int i = 0; i < 24; i ++ ) {
			if ( float( i ) >= fsSunTaps.y ) break;
			vec2 o = fsVogel( float( i ), fsSunTaps.y, phi + 1.3 ) * radius;
			lit += step( c.z + dot( o, grad ), fsShadowDepth( map, c.xy + o ) );
		}
		shadow = lit / max( fsSunTaps.y, 1.0 );
	}
	return shadow;
}

#if NUM_DIR_LIGHT_SHADOWS == 2

float fsFilterFar( sampler2D map, vec3 c, float phi ) {
	float lit = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		if ( float( i ) >= fsSunTaps.z ) break;
		vec2 o = fsVogel( float( i ), fsSunTaps.z, phi ) * fsSunFar.x;
		lit += step( c.z, fsShadowDepth( map, c.xy + o ) );
	}
	return lit / max( fsSunTaps.z, 1.0 );
}

float fsSunShadowCascaded( vec3 c0, vec3 c1, vec2 grad, float phi ) {
	vec2 e = abs( c0.xy - 0.5 ) * 2.0;
	float edge = max( e.x, e.y );
	float w0 = c0.z <= 1.0 ? 1.0 - smoothstep( fsSunPcss.w, 0.97, edge ) : 0.0;
	float nearShadow = 1.0;
	float farShadow = 1.0;
	if ( w0 > 0.001 ) nearShadow = fsFilterNear( directionalShadowMap[ 0 ], c0, grad, phi );
	if ( w0 < 0.999 ) {
		bool inFar = c1.x >= 0.0 && c1.x <= 1.0 && c1.y >= 0.0 && c1.y <= 1.0 && c1.z <= 1.0;
		if ( inFar ) farShadow = fsFilterFar( directionalShadowMap[ 1 ], c1, phi );
	}
	return mix( farShadow, nearShadow, w0 );
}

#else

float fsSunShadowSingle( vec3 c0, vec2 grad, float phi ) {
	bool inFrustum = c0.x >= 0.0 && c0.x <= 1.0 && c0.y >= 0.0 && c0.y <= 1.0 && c0.z <= 1.0;
	if ( ! inFrustum ) return 1.0;
	float s = fsFilterNear( directionalShadowMap[ 0 ], c0, grad, phi );
	// Fade to lit across the outer rim so the map boundary never draws a line.
	vec2 e = abs( c0.xy - 0.5 ) * 2.0;
	return mix( s, 1.0, smoothstep( 0.92, 1.0, max( e.x, e.y ) ) );
}

#endif

#endif
`;

// Replacement for the point-light section of lights_fragment_begin.
const POINT_LIGHTS_GLSL = /* glsl */ `#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

	PointLight pointLight;

	#if !( defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0 )

	// No point-light shadows (the game never casts them): nothing here needs a
	// constant sampler index, so this stays a REAL loop with ONE copy of the
	// BRDF instead of three's ~17 unrolled copies. On D3D11 that cut the cold
	// shader-compile time of every lit program, and idle pooled lights (colour
	// zero) or fragments outside a light's cutoff skip the BRDF entirely.
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		if ( pointLight.color.r + pointLight.color.g + pointLight.color.b <= 0.0 ) continue;
		getPointLightInfo( pointLight, geometryPosition, directLight );
		if ( ! directLight.visible ) continue;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}

	#else

	PointLightShadow pointLightShadow;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		pointLight = pointLights[ i ];

		// Pooled lights idle at intensity 0: skip them outright (uniform branch).
		if ( pointLight.color.r + pointLight.color.g + pointLight.color.b > 0.0 ) {

			getPointLightInfo( pointLight, geometryPosition, directLight );

			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
			pointLightShadow = pointLightShadows[ i ];
			directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
			#endif

			// Outside the cutoff distance the light contributes exactly zero.
			if ( directLight.visible ) {
				RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			}

		}

	}
	#pragma unroll_loop_end

	#endif

#endif

`;

// Replacement for the directional-light section of lights_fragment_begin.
const DIRECTIONAL_GLSL = /* glsl */ `#define FS_SUN_SHADOW 1
float fsSunShadow = 1.0;

#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

	#if defined( FS_ADVANCED_SUN )
	{
		// Light 0 is the sun / moon. With two shadowed lights, light 1 is the
		// zero-intensity far-cascade owner and is never shaded.
		vec3 fsC0 = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
		fsC0.z += directionalLightShadows[ 0 ].shadowBias;
		// Derivatives in uniform control flow, before any branch.
		vec2 fsGrad = fsDepthGradient( fsC0 );
		float fsPhi = fsIGN( gl_FragCoord.xy ) * 6.2831853;

		DirectionalLight directionalLight = directionalLights[ 0 ];
		getDirectionalLightInfo( directionalLight, directLight );
		if ( receiveShadow ) {
			#if NUM_DIR_LIGHT_SHADOWS == 2
			vec3 fsC1 = vDirectionalShadowCoord[ 1 ].xyz / vDirectionalShadowCoord[ 1 ].w;
			fsC1.z += directionalLightShadows[ 1 ].shadowBias;
			fsSunShadow = fsSunShadowCascaded( fsC0, fsC1, fsGrad, fsPhi );
			#else
			fsSunShadow = fsSunShadowSingle( fsC0, fsGrad, fsPhi );
			#endif
			fsSunShadow = mix( 1.0, fsSunShadow, directionalLightShadows[ 0 ].shadowIntensity );
		}
		directLight.color *= fsSunShadow;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		// Any further directional lights are unshadowed.
		#if NUM_DIR_LIGHT_SHADOWS == 2
		#pragma unroll_loop_start
		for ( int i = 2; i < NUM_DIR_LIGHTS; i ++ ) {
			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		#pragma unroll_loop_end
		#else
		#pragma unroll_loop_start
		for ( int i = 1; i < NUM_DIR_LIGHTS; i ++ ) {
			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		#pragma unroll_loop_end
		#endif
	}
	#else

	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		getDirectionalLightInfo( directionalLight, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		#if ( UNROLLED_LOOP_INDEX == 0 )
		fsSunShadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		directLight.color *= fsSunShadow;
		#else
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end

	#endif

#endif

`;

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
#endif
`;

// world = R^T * viewPos + cameraPosition (the view matrix is rigid)
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldPos = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz + cameraPosition;
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec4 fsFogHeight;
	uniform vec3 fsFogSunDir;
	uniform vec3 fsFogSunColor;
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 fsFogTint = fogColor;
	// Uniform branch: with both terms at their zero defaults this is stock fog.
	if ( fsFogHeight.y > 0.0 || fsFogHeight.w > 0.0 ) {
		vec3 fsRay = vFogWorldPos - cameraPosition;
		float fsDist = max( length( fsRay ), 1e-4 );
		vec3 fsDir = fsRay / fsDist;
		// Exponential height fog integrated analytically along the view ray.
		float fsB = max( fsFogHeight.x, 1e-4 );
		float fsCamH = cameraPosition.y - fsFogHeight.z;
		float fsK = clamp( fsDir.y * fsB * fsDist, -60.0, 60.0 );
		float fsIntegral = abs( fsK ) > 1e-4 ? ( 1.0 - exp( - fsK ) ) / fsK * fsDist : fsDist;
		float fsOptical = fsFogHeight.y * exp( - clamp( fsCamH * fsB, -60.0, 60.0 ) ) * fsIntegral;
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * exp( - max( fsOptical, 0.0 ) );
		// Forward in-scatter: fog glows toward the sun / moon.
		float fsSun = pow( max( dot( fsDir, fsFogSunDir ), 0.0 ), 6.0 ) * fsFogHeight.w;
		fsFogTint = mix( fogColor, fsFogSunColor, clamp( fsSun, 0.0, 1.0 ) );
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fsFogTint, clamp( fogFactor, 0.0, 1.0 ) );
#endif
`;

/**
 * Install every chunk patch (idempotent). Must run before the first material
 * compiles — App.tsx imports this module second, right after textureDefaults.
 */
export function installAdvancedLighting(): void {
  if (installed) return;
  installed = true;

  // ── 1 + 2. Shadows + point-light early-out ────────────────────────────
  const lights = THREE.ShaderChunk.lights_fragment_begin;
  const pointStart = lights.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  const spotStart = lights.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
  const dirStart = lights.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const rectStart = lights.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )');
  if (pointStart < 0 || spotStart < 0 || dirStart < 0 || rectStart < 0
    || !(pointStart < spotStart && spotStart < dirStart && dirStart < rectStart)) {
    console.warn('[AdvancedLighting] Unexpected lights chunk layout — keeping stock lighting.');
  } else {
    THREE.ShaderChunk.shadowmap_pars_fragment += SUN_SHADOW_GLSL;
    THREE.ShaderChunk.lights_fragment_begin =
      lights.slice(0, pointStart)
      + POINT_LIGHTS_GLSL
      + lights.slice(spotStart, dirStart)
      + DIRECTIONAL_GLSL
      + lights.slice(rectStart);
  }

  // ── 3. Atmospheric fog ────────────────────────────────────────────────
  THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;

  // Register the shared uniform objects on every built-in shader that uses
  // them, so each material's cloned uniforms reference these same instances.
  for (const name of Object.keys(THREE.ShaderLib)) {
    const shader = THREE.ShaderLib[name as keyof typeof THREE.ShaderLib];
    if (!shader.uniforms) continue;
    if (shader.uniforms.directionalLights) {
      shader.uniforms.fsSunPcss = { value: sunShadowUniforms.fsSunPcss };
      shader.uniforms.fsSunFar = { value: sunShadowUniforms.fsSunFar };
      shader.uniforms.fsSunTaps = { value: sunShadowUniforms.fsSunTaps };
    }
    if (shader.uniforms.fogColor) {
      shader.uniforms.fsFogHeight = { value: atmosphereFogUniforms.fsFogHeight };
      shader.uniforms.fsFogSunDir = { value: atmosphereFogUniforms.fsFogSunDir };
      shader.uniforms.fsFogSunColor = { value: atmosphereFogUniforms.fsFogSunColor };
    }
  }
}

export interface SunShadowConfig {
  /** Half-size of the near cascade in metres. */
  nearExtent: number;
  /** Near cascade shadow-map resolution. */
  nearSize: number;
  /** Far cascade resolution (0 = single cascade). */
  farSize: number;
  /** Depth range of the shadow camera (far - near) in metres. */
  depthRange: number;
  /** Apparent angular radius of the light in radians (bigger = softer). 0 = fixed-radius PCF. */
  angularRadius: number;
  /** Fixed filter radius in TEXELS when PCSS is off (also the PCSS minimum). */
  minRadiusTexels: number;
  blockerTaps: number;
  filterTaps: number;
  farTaps: number;
}

/** Configure the shared shadow-filter uniforms for the current cascade layout. */
export function configureSunShadows(cfg: SunShadowConfig): void {
  const span = cfg.nearExtent * 2;
  const u = sunShadowUniforms.fsSunPcss;
  // Penumbra width in uv per unit of normalised shadow depth: the depth range
  // in metres times tan(angular radius) gives metres of penumbra per unit of
  // depth; dividing by the cascade span converts metres to uv.
  u.x = cfg.angularRadius > 0 ? (cfg.depthRange * Math.tan(cfg.angularRadius)) / span : 0;
  // Search (and max penumbra) radius = the penumbra of the farthest blocker
  // that matters (~30 m: the top of a tall canopy). It used to be a flat
  // 1.2 m — 3-4× wider than any real penumbra here — which averaged unrelated
  // occluders into the estimate and spread the 12 taps so thin that small
  // shadows slipped between them.
  u.y = cfg.angularRadius > 0 ? Math.min(1.2, 30 * Math.tan(cfg.angularRadius)) / span : 1.2 / span;
  u.z = cfg.minRadiusTexels / Math.max(1, cfg.nearSize);
  u.w = 0.8;
  sunShadowUniforms.fsSunFar.x = 1.6 / Math.max(1, cfg.farSize || cfg.nearSize);
  const t = sunShadowUniforms.fsSunTaps;
  t.x = Math.max(1, Math.min(16, Math.round(cfg.blockerTaps)));
  t.y = Math.max(1, Math.min(24, Math.round(cfg.filterTaps)));
  t.z = Math.max(1, Math.min(8, Math.round(cfg.farTaps)));
}

/** Set the per-frame atmospheric fog terms (game scene). */
export function setAtmosphericFog(
  heightFalloff: number,
  heightDensity: number,
  baseHeight: number,
  sunStrength: number,
  sunDir: THREE.Vector3,
  sunColor: THREE.Color,
): void {
  const h = atmosphereFogUniforms.fsFogHeight;
  h.x = heightFalloff;
  h.y = heightDensity;
  h.z = baseHeight;
  h.w = sunStrength;
  const d = atmosphereFogUniforms.fsFogSunDir;
  d.x = sunDir.x; d.y = sunDir.y; d.z = sunDir.z;
  const c = atmosphereFogUniforms.fsFogSunColor;
  c.x = sunColor.r; c.y = sunColor.g; c.z = sunColor.b;
}

/** Restore the stock-fog defaults (call when a game scene tears down so the
 *  menu backdrop renders exactly as authored). */
export function resetAtmosphericFog(): void {
  const h = atmosphereFogUniforms.fsFogHeight;
  h.x = 0.1; h.y = 0; h.z = 0; h.w = 0;
}

installAdvancedLighting();
