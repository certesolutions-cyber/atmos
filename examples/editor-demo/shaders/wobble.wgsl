/// @opaque
/// @property amplitude: float = 0.3
/// @property frequency: float = 3.0
/// @property speed: float = 2.0
/// @property color1: vec4 = (0.1, 0.6, 1.0, 1.0)
/// @property color2: vec4 = (1.0, 0.2, 0.4, 1.0)

/// @vertex
fn displaceVertex(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    let time = scene.cameraPos.w;
    let phase = dot(position, vec3<f32>(1.0, 0.7, 0.5)) * custom.frequency + time * custom.speed;
    let displacement = sin(phase) * custom.amplitude;
    return position + normal * displacement;
}

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let N = normalize(input.worldNormal);
    let V = normalize(scene.cameraPos.xyz - input.worldPosition);
    let NdotV = max(dot(N, V), 0.0);

    // Fresnel-based color blend
    let fresnel = pow(1.0 - NdotV, 3.0);
    let baseColor = mix(custom.color1.rgb, custom.color2.rgb, fresnel);

    // Simple directional lighting with shadows
    var diffuse = vec3<f32>(0.0);
    for (var i = 0u; i < scene.numDirLights; i = i + 1u) {
        let L = normalize(-scene.dirLights[i].direction.xyz);
        let NdotL = max(dot(N, L), 0.0);
        let radiance = scene.dirLights[i].color.rgb * scene.dirLights[i].color.w;
        var contribution = radiance * NdotL;
        let dirSlot = shadow.dirLightToSlot[i];
        if (dirSlot != 0xFFFFFFFFu) {
            contribution = contribution * sampleDirShadow(dirSlot, input.worldPosition, N, length(input.worldPosition - scene.cameraPos.xyz));
        }
        diffuse = diffuse + contribution;
    }

    // Point lights with shadows
    for (var i = 0u; i < scene.numPointLights; i = i + 1u) {
        let light = scene.pointLights[i];
        let lightPos = light.position.xyz;
        let range = light.position.w;
        let toLight = lightPos - input.worldPosition;
        let dist = length(toLight);
        let L = toLight / max(dist, 0.0001);
        let NdotL = max(dot(N, L), 0.0);
        let attenuation = max(1.0 - (dist * dist) / (range * range), 0.0);
        let radiance = light.color.rgb * light.color.w * attenuation * attenuation;
        var contribution = radiance * NdotL;
        let pointSlot = shadow.pointLightToSlot[i];
        if (pointSlot != 0xFFFFFFFFu) {
            contribution = contribution * samplePointShadow(pointSlot, input.worldPosition, N);
        }
        diffuse = diffuse + contribution;
    }

    // Spot lights with shadows
    for (var i = 0u; i < scene.numSpotLights; i = i + 1u) {
        let light = scene.spotLights[i];
        let lightPos = light.position.xyz;
        let range = light.position.w;
        let spotDir = normalize(light.direction.xyz);
        let outerCos = light.direction.w;
        let innerCos = light.extra.x;
        let toLight = lightPos - input.worldPosition;
        let dist = length(toLight);
        let L = toLight / max(dist, 0.0001);
        let NdotL = max(dot(N, L), 0.0);
        let attenuation = max(1.0 - (dist * dist) / (range * range), 0.0);
        let cosAngle = dot(-L, spotDir);
        let cone = smoothstep(outerCos, innerCos, cosAngle);
        let radiance = light.color.rgb * light.color.w * attenuation * attenuation * cone;
        var contribution = radiance * NdotL;
        let spotSlot = shadow.spotLightToSlot[i];
        if (spotSlot != 0xFFFFFFFFu) {
            contribution = contribution * sampleSpotShadow(spotSlot, input.worldPosition, N);
        }
        diffuse = diffuse + contribution;
    }

    let ambient = vec3<f32>(0.1);
    let color = baseColor * (ambient + diffuse);

    // Rim light
    let rim = pow(1.0 - NdotV, 4.0) * 0.5;
    let finalColor = color + custom.color2.rgb * rim;

    return vec4<f32>(finalColor, 1.0);
}
