/// @property shallowColor: vec4 = (0.0, 0.55, 0.55, 0.6)
/// @property deepColor: vec4 = (0.0, 0.12, 0.25, 0.95)
/// @property waveSpeed: float = 1.0
/// @property waveScale: float = 1.0
/// @property waveStrength: float = 0.4
/// @property specularPower: float = 512.0
/// @property specularIntensity: float = 3.0
/// @property fresnelPower: float = 5.0
/// @property fresnelBias: float = 0.02
/// @property sssColor: vec4 = (0.1, 0.7, 0.45, 1.0)
/// @property sssIntensity: float = 0.6
/// @property causticsScale: float = 0.8
/// @property causticsIntensity: float = 0.35
/// @property foamColor: vec4 = (0.95, 0.97, 1.0, 1.0)
/// @property foamThreshold: float = 0.65

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let time = scene.cameraPos.w;
    let worldPos = input.worldPosition;
    let baseNormal = normalize(input.worldNormal);
    let V = normalize(scene.cameraPos.xyz - worldPos);
    let uv = worldPos.xz;

    // ── Multi-octave procedural wave normals ──
    let t = time * custom.waveSpeed;
    let scale = custom.waveScale;

    // 4 wave layers at different scales, speeds, and directions
    let n1 = waveNormal(uv * scale * 0.5, t * 0.4, vec2<f32>(0.7, 0.3));
    let n2 = waveNormal(uv * scale * 1.0, t * 0.6, vec2<f32>(-0.5, 0.6));
    let n3 = waveNormal(uv * scale * 2.3, t * 0.8, vec2<f32>(0.3, -0.7));
    let n4 = waveNormal(uv * scale * 4.1, t * 1.2, vec2<f32>(-0.6, -0.4));

    // Blend octaves with decreasing weight
    var waveN = n1 + n2 * 0.5 + n3 * 0.25 + n4 * 0.125;
    waveN = waveN * custom.waveStrength;

    // Perturb base normal (assuming water is mostly flat, base normal ≈ up)
    let N = normalize(vec3<f32>(waveN.x, 1.0, waveN.y));

    let NdotV = max(dot(N, V), 0.0);

    // ── Fresnel (Schlick) ──
    let fresnel = custom.fresnelBias + (1.0 - custom.fresnelBias) * pow(1.0 - NdotV, custom.fresnelPower);

    // ── Sky/environment reflection (procedural) ──
    let reflDir = reflect(-V, N);
    let skyColor = proceduralSky(reflDir);
    let reflectionColor = skyColor;

    // ── Water body color (depth-like gradient via view angle) ──
    // Steep angles (sides of waves) → shallow/transparent
    // Flat angles (looking down) → deep/opaque
    let depthFactor = pow(1.0 - NdotV, 0.7);
    let waterColor = mix(custom.deepColor.rgb, custom.shallowColor.rgb, depthFactor);
    let waterAlpha = mix(custom.deepColor.a, custom.shallowColor.a, depthFactor);

    // ── Subsurface scattering ──
    var sss = vec3<f32>(0.0);
    if (scene.numDirLights > 0u) {
        let lightDir = normalize(-scene.dirLights[0].direction.xyz);
        let sssLight = lightDir + N * 0.2;
        let sssDot = pow(clamp(dot(V, -sssLight), 0.0, 1.0), 3.0);
        // Wave sides glow with SSS color
        let sssMask = (1.0 - NdotV) * 0.5 + 0.5;
        sss = custom.sssColor.rgb * sssDot * custom.sssIntensity * sssMask;
    }

    // ── Mix reflection and water body via Fresnel ──
    var color = mix(waterColor + sss, reflectionColor, clamp(fresnel, 0.0, 1.0));

    // ── Specular highlights (Blinn-Phong) ──
    for (var i = 0u; i < scene.numDirLights; i = i + 1u) {
        let light = scene.dirLights[i];
        let L = normalize(-light.direction.xyz);
        let H = normalize(V + L);
        let NdotH = max(dot(N, H), 0.0);
        let spec = pow(NdotH, custom.specularPower) * custom.specularIntensity;
        let radiance = light.color.rgb * light.color.w;
        color = color + radiance * spec * fresnel;
    }

    for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
        let light = scene.pointLights[i];
        let toLight = light.position.xyz - worldPos;
        let dist = length(toLight);
        let range = light.position.w;
        let atten = max(1.0 - (dist * dist) / (range * range), 0.0);
        let L = toLight / max(dist, 0.0001);
        let H = normalize(V + L);
        let NdotH = max(dot(N, H), 0.0);
        let spec = pow(NdotH, custom.specularPower) * custom.specularIntensity;
        let radiance = light.color.rgb * light.color.w * atten * atten;
        color = color + radiance * spec * fresnel;
    }

    // ── Caustics (procedural, underwater effect visible on surface) ──
    let causticsVal = caustics(uv * custom.causticsScale, t * 0.3);
    if (scene.numDirLights > 0u) {
        let lightIntensity = scene.dirLights[0].color.w;
        let lightColor = scene.dirLights[0].color.rgb;
        color = color + lightColor * causticsVal * custom.causticsIntensity * lightIntensity * (1.0 - fresnel);
    }

    // ── Foam (procedural, wave crest-based) ──
    let foamNoise = foam(uv * scale * 2.0, t);
    let wavePeak = max(waveN.x + waveN.y, 0.0) * 2.0;
    let foamMask = smoothstep(custom.foamThreshold, custom.foamThreshold + 0.3, wavePeak + foamNoise * 0.4);
    color = mix(color, custom.foamColor.rgb, foamMask * custom.foamColor.a);
    let alpha = clamp(waterAlpha + foamMask * 0.5 + fresnel * 0.3, 0.0, 1.0);

    // ── Fog ──
    color = applyFog(color, worldPos);

    return vec4<f32>(color, alpha);
}

// ── Hash functions for procedural noise ──

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + vec3<f32>(dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33)));
    return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    let n = vec3<f32>(dot(p, vec2<f32>(127.1, 311.7)),
                      dot(p, vec2<f32>(269.5, 183.3)),
                      dot(p, vec2<f32>(419.2, 371.9)));
    return fract(sin(n.xy) * 43758.5453123);
}

// ── Procedural wave normal (returns xz displacement) ──

fn waveNormal(uv: vec2<f32>, t: f32, dir: vec2<f32>) -> vec2<f32> {
    let p = uv + dir * t;
    let eps = 0.05;

    let h0 = waveHeight(p);
    let hx = waveHeight(p + vec2<f32>(eps, 0.0));
    let hy = waveHeight(p + vec2<f32>(0.0, eps));

    return vec2<f32>(h0 - hx, h0 - hy) / eps;
}

fn waveHeight(p: vec2<f32>) -> f32 {
    // Multi-frequency sine waves with noise modulation
    var h = 0.0;
    var freq = 1.0;
    var amp = 1.0;
    var pos = p;

    for (var i = 0; i < 4; i = i + 1) {
        let n = hash21(floor(pos * 0.5)) * 0.5;
        h = h + sin(pos.x * freq + pos.y * freq * 0.7 + n * 6.28) * amp;
        h = h + cos(pos.y * freq * 1.3 - pos.x * freq * 0.4 + n * 3.14) * amp * 0.7;
        freq = freq * 2.1;
        amp = amp * 0.45;
        pos = vec2<f32>(pos.x * 1.2 - pos.y * 0.3, pos.y * 1.2 + pos.x * 0.3);
    }

    return h * 0.15;
}

// ── Procedural caustics ──

fn caustics(uv: vec2<f32>, t: f32) -> f32 {
    let TAU = 6.28318530718;
    var p = ((uv % TAU) + TAU) % TAU - vec2<f32>(250.0);
    var ip = p;
    var c = 1.0;
    let intensity = 0.005;

    for (var n = 0; n < 4; n = n + 1) {
        let tt = t * (1.0 - 3.5 / f32(n + 1));
        ip = p + vec2<f32>(
            cos(tt - ip.x) + sin(tt + ip.y),
            sin(tt - ip.y) + cos(tt + ip.x)
        );
        c = c + 1.0 / length(vec2<f32>(
            p.x / (sin(ip.x + tt) / intensity),
            p.y / (cos(ip.y + tt) / intensity)
        ));
    }
    c = c / 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
}

// ── Procedural foam noise ──

fn foam(uv: vec2<f32>, t: f32) -> f32 {
    let p1 = uv + vec2<f32>(t * 0.15, t * 0.08);
    let p2 = uv * 1.7 + vec2<f32>(-t * 0.1, t * 0.12);

    let v1 = voronoiNoise(p1);
    let v2 = voronoiNoise(p2);

    // Combine two layers of Voronoi for organic foam look
    return smoothstep(0.1, 0.5, min(v1, v2));
}

fn voronoiNoise(uv: vec2<f32>) -> f32 {
    let i = floor(uv);
    let f = fract(uv);
    var minDist = 1.0;

    for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let point = hash22(i + neighbor);
            let diff = neighbor + point - f;
            let dist = length(diff);
            minDist = min(minDist, dist);
        }
    }
    return minDist;
}

// ── Procedural sky for reflections ──

fn proceduralSky(dir: vec3<f32>) -> vec3<f32> {
    // Simple sky gradient
    let up = max(dir.y, 0.0);
    let horizon = 1.0 - abs(dir.y);

    // Sky gradient: horizon warm, zenith deep blue
    let zenithColor = vec3<f32>(0.15, 0.3, 0.65);
    let horizonColor = vec3<f32>(0.6, 0.7, 0.85);
    let groundColor = vec3<f32>(0.15, 0.18, 0.2);

    var sky: vec3<f32>;
    if (dir.y >= 0.0) {
        sky = mix(horizonColor, zenithColor, pow(up, 0.5));
    } else {
        sky = mix(horizonColor, groundColor, pow(-dir.y, 0.3));
    }

    // Sun disk (approximate, from first directional light if available)
    if (scene.numDirLights > 0u) {
        let sunDir = normalize(-scene.dirLights[0].direction.xyz);
        let sunDot = max(dot(dir, sunDir), 0.0);
        let sunDisk = pow(sunDot, 256.0) * 3.0;
        let sunGlow = pow(sunDot, 8.0) * 0.3;
        let sunColor = scene.dirLights[0].color.rgb * scene.dirLights[0].color.w;
        sky = sky + sunColor * (sunDisk + sunGlow);
    }

    return sky;
}
