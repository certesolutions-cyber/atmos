/// @property baseColor: vec4 = (0.2, 0.6, 1.0, 1.0)
/// @property speed: float = 2.0

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let N = normalize(input.worldNormal);
    let V = normalize(scene.cameraPos.xyz - input.worldPosition);

    // Simple rim lighting effect
    let rim = 1.0 - max(dot(N, V), 0.0);
    let rimColor = custom.baseColor.rgb * pow(rim, custom.speed);

    // Basic diffuse from scene lights
    let albedo = custom.baseColor.rgb;
    let F0 = vec3<f32>(0.04);
    let Lo = computeLightLoop(N, V, albedo, 0.0, 0.5, F0, input.worldPosition);

    let ambient = vec3<f32>(0.03) * albedo;
    var color = ambient + Lo + rimColor;
    color = applyFog(color, input.worldPosition);
    return vec4<f32>(color, custom.baseColor.a);
}
