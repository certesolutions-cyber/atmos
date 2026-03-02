/// @property shallowColor: vec4 = (0.0, 0.55, 0.55, 0.3)
/// @property deepColor: vec4 = (0.0, 0.12, 0.25, 1.0)
/// @property waveSpeed: float = 1.0
/// @property waveScale: float = 1.0
/// @property waveStrength: float = 0.4
/// @property specularPower: float = 128.0
/// @property specularIntensity: float = 2.0
/// @property fresnelPower: float = 5.0
/// @property fresnelBias: float = 0.02
/// @property sssColor: vec4 = (0.1, 0.7, 0.45, 1.0)
/// @property sssIntensity: float = 0.6
/// @property causticsScale: float = 0.8
/// @property causticsIntensity: float = 0.35
/// @property foamColor: vec4 = (0.95, 0.97, 1.0, 1.0)
/// @property foamThreshold: float = 0.65
/// @texture envMap

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let time = scene.cameraPos.w;
    let worldPos = input.worldPosition;
    let V = normalize(scene.cameraPos.xyz - worldPos);
    let uv = worldPos.xz;

    let t = time * custom.waveSpeed;
    let scale = custom.waveScale;

    // ── Wave normal via analytical derivatives ──
    let waveResult = computeWaves(uv * scale, t);
    let waveN = waveResult.xy * custom.waveStrength;

    let N = normalize(vec3<f32>(waveN.x, 1.0, waveN.y));
    let NdotV = max(dot(N, V), 0.0);

    // ── Fresnel (Schlick) ──
    let F = clamp(
        custom.fresnelBias + (1.0 - custom.fresnelBias) * pow(1.0 - NdotV, custom.fresnelPower),
        0.0, 1.0,
    );

    // ── Roughness from wave slope (for env mip selection) ──
    let slope = length(waveN);
    let roughness = clamp(slope * 0.8, 0.02, 1.0);

    // ── Sky/environment reflection (roughness-blurred) ──
    let reflDir = reflect(-V, N);
    let reflectionColor = sampleEnvironment(reflDir, roughness);

    // ── Water body color (angle-based) ──
    let angleFactor = pow(1.0 - NdotV, 0.7);
    let waterColor = mix(custom.deepColor.rgb, custom.shallowColor.rgb, angleFactor);
    let waterAlpha = custom.shallowColor.a;

    // ── Subsurface scattering (edge glow + forward scatter) ──
    var sss = vec3<f32>(0.0);
    if (scene.numDirLights > 0u) {
        let lightDir = normalize(-scene.dirLights[0].direction.xyz);
        let NdotL = max(dot(N, lightDir), 0.0);
        let edgeGlow = pow(1.0 - NdotV, 2.0) * NdotL;
        let fwdScatter = pow(clamp(dot(V, -lightDir), 0.0, 1.0), 4.0);
        sss = custom.sssColor.rgb * (edgeGlow + fwdScatter) * custom.sssIntensity;
    }

    // ── Energy-conserving color composition ──
    var color = waterColor * (1.0 - F);
    color = color + reflectionColor * F;
    color = color + sss * (1.0 - F);

    // ── Direct specular (scaled by F, no separate specF to avoid double-count) ──
    for (var i = 0u; i < scene.numDirLights; i = i + 1u) {
        let light = scene.dirLights[i];
        let L = normalize(-light.direction.xyz);
        let NdotL = max(dot(N, L), 0.0);
        if (NdotL > 0.0) {
            let H = normalize(V + L);
            let NdotH = max(dot(N, H), 0.0);
            let spec = pow(NdotH, custom.specularPower) * custom.specularIntensity;
            let radiance = light.color.rgb * light.color.w;
            color = color + radiance * spec * NdotL * (0.25 + 0.75 * F);
        }
    }

    for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
        let light = scene.pointLights[i];
        let toLight = light.position.xyz - worldPos;
        let dist = length(toLight);
        let range = light.position.w;
        let atten = max(1.0 - (dist * dist) / (range * range), 0.0);
        let L = toLight / max(dist, 0.0001);
        let NdotL = max(dot(N, L), 0.0);
        if (NdotL > 0.0) {
            let H = normalize(V + L);
            let NdotH = max(dot(N, H), 0.0);
            let spec = pow(NdotH, custom.specularPower) * custom.specularIntensity;
            let radiance = light.color.rgb * light.color.w * atten * atten;
            color = color + radiance * spec * NdotL * (0.25 + 0.75 * F);
        }
    }

    // ── Caustics ──
    let causticsVal = caustics(uv * custom.causticsScale, t * 0.3);
    if (scene.numDirLights > 0u) {
        let lightIntensity = scene.dirLights[0].color.w;
        let lightColor = scene.dirLights[0].color.rgb;
        color = color + lightColor * causticsVal * custom.causticsIntensity * lightIntensity * (1.0 - F);
    }

    // ── Foam (slope-based) ──
    let foamNoise = smoothNoise(uv * scale * 3.0 + vec2<f32>(t * 0.1, t * 0.07));
    let foamNoise2 = smoothNoise(uv * scale * 5.0 - vec2<f32>(t * 0.08, t * 0.12));
    let foamVal = foamNoise * foamNoise2;
    let foamFromSlope = smoothstep(custom.foamThreshold * 0.3, custom.foamThreshold, slope);
    let foamMask = foamFromSlope * foamVal;
    color = mix(color, custom.foamColor.rgb, foamMask * custom.foamColor.a);

    // ── Alpha (material parameter, not fresnel-driven) ──
    let alpha = clamp(waterAlpha + foamMask * 0.25, 0.0, 1.0);

    color = applyFog(color, worldPos);
    color = clamp(color, vec3<f32>(0.0), vec3<f32>(100.0));
    return vec4<f32>(color, alpha);
}

// ── Core wave system: 8 Gerstner-style waves with analytical derivatives ──
// Returns vec3(dh/dx, dh/dz, height)

fn computeWaves(uv: vec2<f32>, t: f32) -> vec3<f32> {
    var dx = 0.0;
    var dy = 0.0;
    var h  = 0.0;

    let noiseLo = smoothNoise(uv * 0.13) * 0.6 + 0.7;
    let noiseHi = smoothNoise(uv * 0.37 + 1.7) * 0.4 + 0.8;

    h += wave(uv, t, vec2<f32>( 0.70,  0.32), 0.37, 1.00 * noiseLo, 0.80, &dx, &dy);
    h += wave(uv, t, vec2<f32>(-0.45,  0.63), 0.61, 0.60 * noiseLo, 1.10, &dx, &dy);
    h += wave(uv, t, vec2<f32>( 0.25, -0.72), 0.93, 0.40 * noiseHi, 0.95, &dx, &dy);
    h += wave(uv, t, vec2<f32>(-0.67, -0.38), 1.31, 0.25 * noiseHi, 1.30, &dx, &dy);
    h += wave(uv, t, vec2<f32>( 0.88, -0.10), 1.87, 0.15 * noiseLo, 1.50, &dx, &dy);
    h += wave(uv, t, vec2<f32>(-0.20,  0.90), 2.71, 0.10 * noiseHi, 1.80, &dx, &dy);
    h += wave(uv, t, vec2<f32>( 0.55,  0.55), 3.57, 0.07 * noiseLo, 2.10, &dx, &dy);
    h += wave(uv, t, vec2<f32>(-0.80,  0.25), 4.73, 0.04 * noiseHi, 2.50, &dx, &dy);

    return vec3<f32>(-dx, -dy, h);
}

fn wave(
    uv: vec2<f32>, t: f32,
    dir: vec2<f32>, freq: f32, amp: f32, speed: f32,
    dx: ptr<function, f32>, dy: ptr<function, f32>,
) -> f32 {
    let d = normalize(dir);
    let phase = dot(d, uv) * freq + t * speed;
    let s = sin(phase) * amp;
    let c = cos(phase) * amp * freq;
    *dx += c * d.x;
    *dy += c * d.y;
    return s;
}

// ── Smooth value noise ──

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + vec3<f32>(dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33)));
    return fract((p3.x + p3.y) * p3.z);
}

fn smoothNoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash21(i);
    let b = hash21(i + vec2<f32>(1.0, 0.0));
    let c = hash21(i + vec2<f32>(0.0, 1.0));
    let d = hash21(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── Caustics ──

fn caustics(uv: vec2<f32>, t: f32) -> f32 {
    let layer1 = causticsLayer(uv, t, vec2<f32>(3.7, 2.3), vec2<f32>(1.1, 0.7));
    let layer2 = causticsLayer(uv * 1.4 + 3.1, t, vec2<f32>(4.3, 3.1), vec2<f32>(0.9, 1.2));
    let c = layer1 * 0.6 + layer2 * 0.4;
    return c * c;
}

fn causticsLayer(uv: vec2<f32>, t: f32, freq: vec2<f32>, speed: vec2<f32>) -> f32 {
    let a = sin(uv.x * freq.x + t * speed.x + sin(uv.y * freq.y + t * speed.y) * 1.5);
    let b = sin(uv.y * freq.x * 1.1 - t * speed.y + sin(uv.x * freq.y * 0.9 - t * speed.x) * 1.3);
    return (a * b) * 0.5 + 0.5;
}

// ── Environment sampling with roughness-based LOD ──

fn sampleEnvironment(dir: vec3<f32>, roughness: f32) -> vec3<f32> {
    let dim = textureDimensions(envMap);
    if (dim.x <= 1u && dim.y <= 1u) {
        return proceduralSky(dir, roughness);
    }
    let d = normalize(dir);
    let u = atan2(d.z, d.x) * (0.5 / PI) + 0.5;
    let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
    let maxMip = floor(log2(f32(max(dim.x, dim.y))));
    let lod = roughness * maxMip;
    return textureSampleLevel(envMap, envMapSampler, vec2<f32>(u, v), lod).rgb;
}

fn proceduralSky(dir: vec3<f32>, roughness: f32) -> vec3<f32> {
    let up = max(dir.y, 0.0);
    let zenithColor = vec3<f32>(0.15, 0.3, 0.65);
    let horizonColor = vec3<f32>(0.6, 0.7, 0.85);
    let groundColor = vec3<f32>(0.15, 0.18, 0.2);

    var sky: vec3<f32>;
    if (dir.y >= 0.0) {
        sky = mix(horizonColor, zenithColor, pow(up, 0.5));
    } else {
        sky = mix(horizonColor, groundColor, pow(-dir.y, 0.3));
    }

    if (scene.numDirLights > 0u) {
        let sunDir = normalize(-scene.dirLights[0].direction.xyz);
        let sunDot = max(dot(dir, sunDir), 0.0);
        let diskExp = max(256.0 * (1.0 - roughness * 4.0), 4.0);
        let glowExp = max(8.0 * (1.0 - roughness * 2.0), 1.0);
        let sunDisk = pow(sunDot, diskExp) * 3.0;
        let sunGlow = pow(sunDot, glowExp) * 0.3;
        let sunColor = scene.dirLights[0].color.rgb * scene.dirLights[0].color.w;
        sky = sky + sunColor * (sunDisk + sunGlow);
    }

    return sky;
}
